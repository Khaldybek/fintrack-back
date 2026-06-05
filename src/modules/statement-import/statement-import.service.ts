import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Account } from '../accounts/entities/account.entity';
import { StatementImport } from './entities/statement-import.entity';
import { StatementImportRow } from './entities/statement-import-row.entity';
import { Transaction } from '../transactions/entities/transaction.entity';
import { AccountsService } from '../accounts/accounts.service';
import { CategoriesService } from '../categories/categories.service';
import { TransactionsService } from '../transactions/transactions.service';
import { PlanService } from '../billing/plan.service';
import { StatementParserService } from './parsers/statement-parser.service';
import { detectFileFormat, isAllowedStatementMime } from './parsers/format-detector';
import {
  BANK_NAMES,
  MAX_STATEMENT_FILE_SIZE,
  MAX_STATEMENT_ROWS,
  PREVIEW_TTL_HOURS,
} from './parsers/parser.types';
import { buildTransactionFingerprint } from './statement-import.fingerprint';
import { toMoneyDto } from '../../common/money.util';
import type { UpdateImportRowsDto } from './dto/update-import-rows.dto';
import type { ConfirmImportDto } from './dto/confirm-import.dto';
import type { Category } from '../categories/entities/category.entity';

const PRO_FEATURE_HINT =
  'Upgrade to Pro to import bank statements.';

@Injectable()
export class StatementImportService {
  constructor(
    @InjectRepository(StatementImport)
    private readonly importRepo: Repository<StatementImport>,
    @InjectRepository(StatementImportRow)
    private readonly rowRepo: Repository<StatementImportRow>,
    @InjectRepository(Transaction)
    private readonly txRepo: Repository<Transaction>,
    private readonly accountsService: AccountsService,
    private readonly categoriesService: CategoriesService,
    private readonly transactionsService: TransactionsService,
    private readonly planService: PlanService,
    private readonly parserService: StatementParserService,
    private readonly dataSource: DataSource,
  ) {}

  private async assertProFeature(userId: string): Promise<void> {
    await this.planService.assertFeature(
      userId,
      'bankStatementImport',
      'bank_statement_import',
      PRO_FEATURE_HINT,
    );
  }

  async uploadAndParse(
    userId: string,
    accountId: string,
    file: Express.Multer.File | undefined,
  ) {
    await this.assertProFeature(userId);

    if (!accountId || !/^[0-9a-f-]{36}$/i.test(accountId)) {
      throw new BadRequestException('accountId is required');
    }
    if (!file) throw new BadRequestException('file is required');

    const account = await this.accountsService.findOne(accountId, userId);
    const currency = account.currency ?? 'KZT';

    const buffer = await this.readFileBuffer(file);
    const size = file.size ?? buffer.length;
    if (size > MAX_STATEMENT_FILE_SIZE) {
      throw new BadRequestException('File exceeds 10 MB limit');
    }

    const fileName = file.originalname || 'statement';
    const mime = (file.mimetype || '').toLowerCase();
    if (!isAllowedStatementMime(mime, fileName)) {
      throw new BadRequestException('Unsupported file format. Use CSV, XLSX, or PDF.');
    }

    const format = detectFileFormat(fileName, mime);
    if (!format) throw new BadRequestException('Unsupported file format');

    let parseResult;
    try {
      parseResult = await this.parserService.parseFile(buffer, fileName, mime, currency);
    } catch {
      throw new BadRequestException('Failed to parse statement file');
    }

    if (parseResult.rows.length === 0) {
      throw new BadRequestException('No transactions found in statement');
    }
    if (parseResult.rows.length > MAX_STATEMENT_ROWS) {
      throw new BadRequestException(`Statement exceeds ${MAX_STATEMENT_ROWS} rows limit`);
    }

    const categories = await this.categoriesService.findAllByUser(userId);
    const existingFingerprints = await this.loadExistingFingerprints(accountId);

    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + PREVIEW_TTL_HOURS);

    const dates = parseResult.rows.map((r) => r.date).sort();
    const importEntity = this.importRepo.create({
      userId,
      accountId,
      status: 'preview',
      bankCode: parseResult.bank.bankCode,
      bankConfidence: parseResult.bank.confidence,
      fileName,
      fileFormat: format,
      periodFrom: dates[0] ?? null,
      periodTo: dates[dates.length - 1] ?? null,
      expiresAt,
    });
    const savedImport = await this.importRepo.save(importEntity);

    const rowEntities: StatementImportRow[] = [];
    const BATCH = 10;
    for (let i = 0; i < parseResult.rows.length; i += BATCH) {
      const chunk = parseResult.rows.slice(i, i + BATCH);
      const categoryResults = await Promise.all(
        chunk.map((row) =>
          this.resolveCategory(userId, row.memo, row.amountMinor, categories),
        ),
      );
      for (let j = 0; j < chunk.length; j++) {
        const row = chunk[j];
        const category = categoryResults[j];
        const rowIndex = i + j;
        const fingerprint = buildTransactionFingerprint(
          accountId,
          row.date,
          row.amountMinor,
          row.memo,
        );
        const isDuplicate = existingFingerprints.has(fingerprint);
        rowEntities.push(
          this.rowRepo.create({
            importId: savedImport.id,
            rowIndex,
            date: row.date,
            amountMinor: row.amountMinor,
            currency,
            memo: row.memo,
            categoryId: category.id,
            suggestedCategoryId: category.id,
            selected: !isDuplicate,
            isDuplicate,
            fingerprint,
            raw: row.raw ?? null,
            parseWarning: row.parseWarning ?? null,
          }),
        );
      }
    }
    await this.rowRepo.save(rowEntities);

    return this.toPreviewResponse(savedImport.id, userId);
  }

  async getPreview(importId: string, userId: string) {
    await this.assertProFeature(userId);
    const imp = await this.findImport(importId, userId);
    return this.toPreviewResponse(imp.id, userId);
  }

  async updateRows(importId: string, userId: string, dto: UpdateImportRowsDto) {
    await this.assertProFeature(userId);
    const imp = await this.findImport(importId, userId);
    this.assertPreviewActive(imp);

    const rows = await this.rowRepo.find({ where: { importId: imp.id } });
    const byId = new Map(rows.map((r) => [r.id, r]));

    for (const patch of dto.rows) {
      const row = byId.get(patch.rowId);
      if (!row) throw new NotFoundException(`Row ${patch.rowId} not found`);
      if (patch.selected !== undefined) row.selected = patch.selected;
      if (patch.memo !== undefined) row.memo = patch.memo;
      if (patch.categoryId !== undefined) {
        await this.categoriesService.findOne(patch.categoryId, userId);
        row.categoryId = patch.categoryId;
      }
    }
    await this.rowRepo.save([...byId.values()]);
    return this.toPreviewResponse(imp.id, userId);
  }

  async confirm(importId: string, userId: string, dto: ConfirmImportDto) {
    await this.assertProFeature(userId);
    const imp = await this.findImport(importId, userId);
    this.assertPreviewActive(imp);

    if (imp.expiresAt < new Date()) {
      throw new BadRequestException('Import session expired');
    }

    const allRows = await this.rowRepo.find({
      where: { importId: imp.id },
      order: { rowIndex: 'ASC' },
    });

    let selected = allRows.filter((r) => r.selected && !r.isDuplicate);
    if (dto.rowIds?.length) {
      const idSet = new Set(dto.rowIds);
      selected = selected.filter((r) => idSet.has(r.id));
    }

    if (selected.length === 0) {
      throw new BadRequestException('No rows selected for import');
    }

    for (const row of selected) {
      if (!row.categoryId) {
        throw new BadRequestException(`Row ${row.id} has no category`);
      }
      await this.categoriesService.findOne(row.categoryId, userId);
    }

    const skippedDuplicates = allRows.filter((r) => r.isDuplicate).length;
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    const transactionIds: string[] = [];
    let balanceDelta = 0;

    try {
      for (const row of selected) {
        const tx = queryRunner.manager.create(Transaction, {
          accountId: imp.accountId,
          categoryId: row.categoryId!,
          amountMinor: row.amountMinor,
          currency: row.currency,
          date: row.date,
          memo: row.memo,
        });
        const saved = await queryRunner.manager.save(tx);
        transactionIds.push(saved.id);
        row.transactionId = saved.id;
        balanceDelta += row.amountMinor;
      }

      if (balanceDelta !== 0) {
        await queryRunner.manager
          .createQueryBuilder()
          .update(Account)
          .set({ balanceMinor: () => `balance_minor + ${balanceDelta}` })
          .where('id = :id', { id: imp.accountId })
          .execute();
      }

      await queryRunner.manager.save(StatementImportRow, selected);
      imp.status = 'confirmed';
      imp.confirmedAt = new Date();
      await queryRunner.manager.save(imp);

      await queryRunner.commitTransaction();
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }

    return {
      created: transactionIds.length,
      skippedDuplicates,
      importId: imp.id,
      transactionIds,
    };
  }

  async cancel(importId: string, userId: string) {
    await this.assertProFeature(userId);
    const imp = await this.findImport(importId, userId);
    if (imp.status === 'confirmed') {
      throw new BadRequestException('Import already confirmed');
    }
    imp.status = 'cancelled';
    await this.importRepo.save(imp);
    return { success: true };
  }

  private async findImport(importId: string, userId: string): Promise<StatementImport> {
    const imp = await this.importRepo.findOne({ where: { id: importId, userId } });
    if (!imp) throw new NotFoundException('Import not found');
    return imp;
  }

  private assertPreviewActive(imp: StatementImport): void {
    if (imp.status !== 'preview') {
      throw new BadRequestException(`Import is ${imp.status}`);
    }
  }

  private async toPreviewResponse(importId: string, userId: string) {
    const imp = await this.importRepo.findOne({
      where: { id: importId, userId },
      relations: ['account'],
    });
    if (!imp) throw new NotFoundException('Import not found');

    const rows = await this.rowRepo.find({
      where: { importId },
      relations: ['category'],
      order: { rowIndex: 'ASC' },
    });

    const expense = rows.filter((r) => r.amountMinor < 0).length;
    const income = rows.filter((r) => r.amountMinor > 0).length;
    const duplicates = rows.filter((r) => r.isDuplicate).length;

    return {
      id: imp.id,
      status: imp.status,
      bank: {
        code: imp.bankCode,
        name: BANK_NAMES[imp.bankCode as keyof typeof BANK_NAMES] ?? imp.bankCode,
        confidence: Number(imp.bankConfidence),
      },
      file: { name: imp.fileName, format: imp.fileFormat },
      accountId: imp.accountId,
      period:
        imp.periodFrom && imp.periodTo
          ? { from: imp.periodFrom, to: imp.periodTo }
          : null,
      stats: {
        total: rows.length,
        expense,
        income,
        duplicates,
        parseErrors: rows.filter((r) => r.parseWarning).length,
      },
      rows: rows.map((r) => ({
        id: r.id,
        date: r.date,
        amountMinor: r.amountMinor,
        amount: toMoneyDto(r.amountMinor, r.currency),
        memo: r.memo,
        direction: r.amountMinor < 0 ? 'expense' : 'income',
        categoryId: r.categoryId,
        categoryName: r.category?.name ?? null,
        selected: r.selected,
        duplicate: r.isDuplicate,
        parseWarning: r.parseWarning,
      })),
    };
  }

  private async loadExistingFingerprints(accountId: string): Promise<Set<string>> {
    const txs = await this.txRepo.find({
      where: { accountId },
      select: ['date', 'amountMinor', 'memo'],
    });
    const set = new Set<string>();
    for (const tx of txs) {
      set.add(
        buildTransactionFingerprint(
          accountId,
          tx.date,
          Number(tx.amountMinor),
          tx.memo ?? '',
        ),
      );
    }
    return set;
  }

  private async resolveCategory(
    userId: string,
    memo: string,
    amountMinor: number,
    categories: Category[],
  ): Promise<Category> {
    const suggest = await this.transactionsService.suggestCategory(userId, {
      memo,
      amountMinor,
    });
    const expectedType = amountMinor < 0 ? 'expense' : 'income';
    if (suggest.categoryId) {
      const cat = categories.find((c) => c.id === suggest.categoryId);
      if (cat && cat.type === expectedType) return cat;
    }
    const type = expectedType;
    const fallback =
      categories.find((c) => c.type === type && c.name === 'Прочее') ??
      categories.find((c) => c.type === type);
    if (!fallback) {
      throw new BadRequestException('No categories available');
    }
    return fallback;
  }

  private async readFileBuffer(file: Express.Multer.File): Promise<Buffer> {
    const rawBuffer = (file as { buffer?: Buffer }).buffer;
    if (rawBuffer?.length) return rawBuffer;
    const path = (file as { path?: string }).path;
    if (path) {
      const fs = await import('fs/promises');
      return fs.readFile(path);
    }
    throw new BadRequestException('Empty file');
  }
}

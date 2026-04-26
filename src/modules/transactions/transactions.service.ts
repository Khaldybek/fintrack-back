import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Transaction } from './entities/transaction.entity';
import { TransactionSplit } from './entities/transaction-split.entity';
import { TransactionTemplate } from './entities/transaction-template.entity';
import { Account } from '../accounts/entities/account.entity';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { UpdateTransactionDto } from './dto/update-transaction.dto';
import { SetSplitsDto } from './dto/set-splits.dto';
import { QueryTransactionsDto } from './dto/query-transactions.dto';
import { AccountsService } from '../accounts/accounts.service';
import { CategoriesService } from '../categories/categories.service';
import { AiService } from '../ai/ai.service';
import { majorAmountToSignedMinor, toMoneyDto } from '../../common/money.util';
import { getTodayInTimezone } from '../../common/date.util';
import { CreateTransactionTemplateDto } from './dto/create-template.dto';
import type { SuggestCategoryDto } from './dto/suggest-category.dto';

export type SuggestCategoryResult = {
  categoryId: string | null;
  categoryName: string;
  merchantCanonical: string;
  confidence: number;
};

export type VoiceParseResult = {
  amountMinor: number;
  categoryId: string | null;
  date: string;
  memo: string | null;
  accountId: string | null;
  confidence: number;
};

@Injectable()
export class TransactionsService {
  constructor(
    @InjectRepository(Transaction)
    private readonly repo: Repository<Transaction>,
    @InjectRepository(TransactionSplit)
    private readonly splitRepo: Repository<TransactionSplit>,
    @InjectRepository(TransactionTemplate)
    private readonly templateRepo: Repository<TransactionTemplate>,
    @InjectRepository(Account)
    private readonly accountRepo: Repository<Account>,
    private readonly accountsService: AccountsService,
    private readonly categoriesService: CategoriesService,
    private readonly aiService: AiService,
  ) {}

  async findAllByUser(userId: string, query: QueryTransactionsDto) {
    const accountIds = await this.getUserAccountIds(userId);
    if (accountIds.length === 0) return { items: [], total: 0 };

    const qb = this.repo
      .createQueryBuilder('t')
      .leftJoinAndSelect('t.category', 'category')
      .leftJoinAndSelect('t.account', 'account')
      .leftJoinAndSelect('t.splits', 'splits')
      .leftJoinAndSelect('splits.category', 'splitCategory')
      .where('t.accountId IN (:...accountIds)', { accountIds });

    if (query.accountId) {
      if (!accountIds.includes(query.accountId)) throw new BadRequestException('Account not found');
      qb.andWhere('t.accountId = :accountId', { accountId: query.accountId });
    }
    if (query.categoryId) {
      await this.categoriesService.findOne(query.categoryId, userId);
      qb.andWhere('t.categoryId = :categoryId', { categoryId: query.categoryId });
    }
    if (query.dateFrom) qb.andWhere('t.date >= :dateFrom', { dateFrom: query.dateFrom });
    if (query.dateTo) qb.andWhere('t.date <= :dateTo', { dateTo: query.dateTo });
    if (query.search?.trim()) {
      qb.andWhere('t.memo ILIKE :search', { search: `%${query.search.trim()}%` });
    }

    qb.orderBy('t.date', 'DESC').addOrderBy('t.createdAt', 'DESC');
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(500, Math.max(1, query.limit ?? 20));
    qb.skip((page - 1) * limit).take(limit);
    const [items, total] = await qb.getManyAndCount();
    return { items: items.map((t) => this.toResponse(t)), total };
  }

  private async getUserAccountIds(userId: string): Promise<string[]> {
    const accounts = await this.accountRepo.find({ where: { userId }, select: ['id'] });
    return accounts.map((a) => a.id);
  }

  async findOne(id: string, userId: string): Promise<Transaction> {
    const accountIds = await this.getUserAccountIds(userId);
    if (accountIds.length === 0) throw new NotFoundException('Transaction not found');
    const tx = await this.repo.findOne({
      where: { id, accountId: In(accountIds) },
      relations: ['category', 'account', 'splits', 'splits.category'],
    });
    if (!tx) throw new NotFoundException('Transaction not found');
    return tx;
  }

  async findOneResponse(id: string, userId: string) {
    const tx = await this.findOne(id, userId);
    return this.toResponse(tx);
  }

  async create(userId: string, dto: CreateTransactionDto) {
    await this.accountsService.findOne(dto.accountId, userId);
    await this.categoriesService.findOne(dto.categoryId, userId);
    const tx = this.repo.create({
      accountId: dto.accountId,
      categoryId: dto.categoryId,
      amountMinor: dto.amountMinor,
      currency: dto.currency ?? 'KZT',
      date: dto.date,
      memo: dto.memo ?? null,
    });
    const saved = await this.repo.save(tx);
    await this.adjustAccountBalance(dto.accountId, dto.amountMinor);
    const withRelations = await this.repo.findOne({
      where: { id: saved.id },
      relations: ['category', 'account'],
    });
    return this.toResponse(withRelations!);
  }

  async update(id: string, userId: string, dto: UpdateTransactionDto) {
    const tx = await this.findOne(id, userId);
    const oldAmount = Number(tx.amountMinor);
    const oldAccountId = tx.accountId;

    if (dto.accountId !== undefined) await this.accountsService.findOne(dto.accountId, userId);
    if (dto.categoryId !== undefined) await this.categoriesService.findOne(dto.categoryId, userId);

    const newAmount = dto.amountMinor !== undefined ? dto.amountMinor : oldAmount;
    const newAccountId = dto.accountId ?? oldAccountId;

    tx.amountMinor = newAmount;
    tx.accountId = newAccountId;
    if (dto.categoryId !== undefined) tx.categoryId = dto.categoryId;
    if (dto.currency !== undefined) tx.currency = dto.currency;
    if (dto.date !== undefined) tx.date = dto.date;
    if (dto.memo !== undefined) tx.memo = dto.memo;

    await this.repo.save(tx);
    if (oldAccountId !== newAccountId) {
      await this.adjustAccountBalance(oldAccountId, -oldAmount);
      await this.adjustAccountBalance(newAccountId, newAmount);
    } else {
      await this.adjustAccountBalance(oldAccountId, newAmount - oldAmount);
    }
    const withRelations = await this.repo.findOne({
      where: { id: tx.id },
      relations: ['category', 'account'],
    });
    return this.toResponse(withRelations!);
  }

  async remove(id: string, userId: string): Promise<void> {
    const tx = await this.findOne(id, userId);
    const amount = Number(tx.amountMinor);
    await this.adjustAccountBalance(tx.accountId, -amount);
    await this.repo.softRemove(tx);
  }

  async voiceParse(userId: string, text: string, timezone: string): Promise<VoiceParseResult> {
    const trimmed = (text || '').trim();
    const referenceDate = getTodayInTimezone(timezone || 'UTC');
    const accountsList = (await this.accountsService.findAllByUser(userId)) as Array<{
      id: string;
      name: string;
      currency?: string;
    }>;
    const currency = (accountsList[0]?.currency ?? 'KZT').trim() || 'KZT';

    if (this.aiService.isEnabled() && trimmed.length > 0) {
      const categories = await this.categoriesService.findAllByUser(userId);
      const categoryNames = categories.map((c) => c.name);
      const accountNames = accountsList.map((a) => a.name);
      const raw = await this.aiService.parseTransactionFromText(trimmed, {
        referenceDate,
        categoryNames,
        accountNames,
        currency,
      });
      if (raw) {
        const categoryId =
          raw.category_name.trim() !== ''
            ? categories.find((c) => c.name === raw.category_name)?.id ?? null
            : null;
        const accountId =
          raw.account_name.trim() !== ''
            ? accountsList.find((a) => a.name === raw.account_name)?.id ?? null
            : null;
        return {
          amountMinor: raw.amount_minor,
          categoryId,
          date: raw.date || referenceDate,
          memo: raw.memo?.trim() || null,
          accountId,
          confidence: Math.min(1, Math.max(0, raw.confidence)),
        };
      }
    }

    const match = trimmed.match(/(\d+(?:[.,]\d{1,2})?)/);
    let amountMinor = 0;
    if (match) {
      const num = parseFloat(match[1].replace(',', '.'));
      amountMinor = majorAmountToSignedMinor(-num, currency);
    }
    return {
      amountMinor,
      categoryId: null,
      date: referenceDate,
      memo: trimmed || null,
      accountId: null,
      confidence: 0.5,
    };
  }

  /** Keyword fallback for suggestCategory: memo substring → default category name */
  private static readonly SUGGEST_CATEGORY_KEYWORDS: Array<{ pattern: RegExp; categoryName: string }> = [
    { pattern: /такси|uber|yandex|bolt|in drive/i, categoryName: 'Транспорт' },
    { pattern: /магнум|гастроном|продукт|еда|шаруа|спар|пятёрочка/i, categoryName: 'Еда' },
    { pattern: /жкх|квартир|аренд|коммунал|жильё/i, categoryName: 'Жильё' },
    { pattern: /аптек|клиник|врач|здоровье|медицин/i, categoryName: 'Здоровье' },
    { pattern: /кино|подписк|netflix|развлеч|игр/i, categoryName: 'Развлечения' },
    { pattern: /зарплат|доход|пополнение/i, categoryName: 'Зарплата' },
  ];

  async suggestCategory(
    userId: string,
    dto: SuggestCategoryDto,
  ): Promise<SuggestCategoryResult> {
    const memo = (dto.memo ?? '').trim();
    const categories = await this.categoriesService.findAllByUser(userId);
    const categoryNames = categories.map((c) => c.name);
    const expenseCategories = categories.filter((c) => c.type === 'expense');
    const fallbackCategory = expenseCategories.find((c) => c.name === 'Прочее') ?? expenseCategories[0];

    if (this.aiService.isEnabled() && memo.length > 0) {
      const raw = await this.aiService.suggestCategory(memo, categoryNames);
      if (raw) {
        const category = categories.find((c) => c.name === raw.category_name);
        const categoryId = category?.id ?? fallbackCategory?.id ?? null;
        const categoryName =
          (category?.name ?? raw.category_name?.trim()) || (fallbackCategory?.name ?? 'Прочее');
        return {
          categoryId,
          categoryName,
          merchantCanonical: raw.merchant_canonical?.trim() || memo,
          confidence: Math.min(1, Math.max(0, raw.confidence)),
        };
      }
    }

    for (const { pattern, categoryName } of TransactionsService.SUGGEST_CATEGORY_KEYWORDS) {
      if (pattern.test(memo)) {
        const cat = categories.find((c) => c.name === categoryName);
        if (cat) {
          return {
            categoryId: cat.id,
            categoryName: cat.name,
            merchantCanonical: memo,
            confidence: 0.6,
          };
        }
      }
    }
    return {
      categoryId: fallbackCategory?.id ?? null,
      categoryName: fallbackCategory?.name ?? 'Прочее',
      merchantCanonical: memo,
      confidence: 0.4,
    };
  }

  private static readonly RECEIPT_MAX_SIZE = 10 * 1024 * 1024; // 10 MB
  private static readonly RECEIPT_MIMES = ['image/jpeg', 'image/png', 'image/webp'];

  async receiptOcr(
    userId: string,
    file: Express.Multer.File | undefined,
  ): Promise<{
    amountMinor: number;
    date: string | null;
    memo: string | null;
    categoryId: string | null;
    items: never[];
  }> {
    const empty = {
      amountMinor: 0,
      date: null as string | null,
      memo: null as string | null,
      categoryId: null as string | null,
      items: [] as never[],
    };
    if (!file) return empty;
    const rawBuffer = (file as { buffer?: Buffer }).buffer ?? null;
    const size = file.size ?? rawBuffer?.length ?? 0;
    if (!rawBuffer?.length && !(file as { path?: string }).path) return empty;
    if (size > TransactionsService.RECEIPT_MAX_SIZE) return empty;
    const mime = (file.mimetype || '').toLowerCase();
    if (!TransactionsService.RECEIPT_MIMES.includes(mime)) return empty;

    let buffer: Buffer;
    if (rawBuffer?.length) {
      buffer = rawBuffer;
    } else {
      try {
        const fs = await import('fs/promises');
        buffer = await fs.readFile((file as { path: string }).path);
      } catch {
        return empty;
      }
    }
    const base64 = buffer.toString('base64');
    const accountsForCurrency = (await this.accountsService.findAllByUser(userId)) as Array<{ currency?: string }>;
    const receiptCurrency = (accountsForCurrency[0]?.currency ?? 'KZT').trim() || 'KZT';
    const raw =
      this.aiService.isEnabled() &&
      (await this.aiService.extractReceipt(base64, mime || 'image/jpeg', receiptCurrency));
    if (!raw) return empty;

    const memo = raw.memo?.trim() || null;
    const date = raw.date?.trim() && /^\d{4}-\d{2}-\d{2}$/.test(raw.date) ? raw.date : null;
    let categoryId: string | null = null;
    if (memo) {
      const suggest = await this.suggestCategory(userId, { memo, amountMinor: raw.amount_minor });
      categoryId = suggest.categoryId;
    }
    return {
      amountMinor: raw.amount_minor,
      date,
      memo,
      categoryId,
      items: [],
    };
  }

  async setSplits(transactionId: string, userId: string, dto: SetSplitsDto) {
    const tx = await this.findOne(transactionId, userId);
    const total = Number(tx.amountMinor);
    const sum = dto.splits.reduce((s, x) => s + x.amountMinor, 0);
    if (sum !== total) {
      throw new BadRequestException(
        `Sum of splits (${sum}) must equal transaction amount (${total})`,
      );
    }
    for (const s of dto.splits) {
      await this.categoriesService.findOne(s.categoryId, userId);
    }
    await this.splitRepo.delete({ transactionId });
    const entities = dto.splits.map((s) =>
      this.splitRepo.create({ transactionId, categoryId: s.categoryId, amountMinor: s.amountMinor }),
    );
    await this.splitRepo.save(entities);
    const updated = await this.repo.findOne({
      where: { id: transactionId },
      relations: ['category', 'account', 'splits', 'splits.category'],
    });
    return this.toResponse(updated!);
  }

  async findAllTemplates(userId: string) {
    const list = await this.templateRepo.find({
      where: { userId },
      relations: ['category'],
      order: { createdAt: 'DESC' },
    });
    return list.map((t) => ({
      id: t.id,
      name: t.name,
      categoryId: t.categoryId,
      category: t.category ? { id: t.category.id, name: t.category.name, type: t.category.type } : undefined,
      amount: toMoneyDto(t.amountMinor, t.currency),
      amount_minor: t.amountMinor,
      currency: t.currency,
    }));
  }

  async createTemplate(userId: string, dto: CreateTransactionTemplateDto) {
    await this.categoriesService.findOne(dto.categoryId, userId);
    const t = this.templateRepo.create({
      userId,
      name: dto.name,
      categoryId: dto.categoryId,
      amountMinor: dto.amountMinor,
      currency: dto.currency ?? 'KZT',
    });
    const saved = await this.templateRepo.save(t);
    const withCat = await this.templateRepo.findOne({
      where: { id: saved.id },
      relations: ['category'],
    });
    if (!withCat) throw new NotFoundException('Template not found');
    return {
      id: withCat.id,
      name: withCat.name,
      categoryId: withCat.categoryId,
      category: withCat.category ? { id: withCat.category.id, name: withCat.category.name, type: withCat.category.type } : undefined,
      amount: toMoneyDto(withCat.amountMinor, withCat.currency),
      amount_minor: withCat.amountMinor,
      currency: withCat.currency,
    };
  }

  async deleteTemplate(id: string, userId: string): Promise<void> {
    const t = await this.templateRepo.findOne({ where: { id, userId } });
    if (!t) throw new NotFoundException('Template not found');
    await this.templateRepo.remove(t);
  }

  private async adjustAccountBalance(accountId: string, delta: number): Promise<void> {
    const num = Number(delta);
    await this.accountRepo
      .createQueryBuilder()
      .update(Account)
      .set({ balanceMinor: () => `balance_minor + ${num}` })
      .where('id = :id', { id: accountId })
      .execute();
  }

  private toResponse(t: Transaction) {
    const amountMinor = typeof t.amountMinor === 'bigint' ? Number(t.amountMinor) : t.amountMinor;
    const out: Record<string, unknown> = {
      id: t.id,
      accountId: t.accountId,
      categoryId: t.categoryId,
      category: t.category ? { id: t.category.id, name: t.category.name, type: t.category.type } : undefined,
      account: t.account ? { id: t.account.id, name: t.account.name } : undefined,
      amount: toMoneyDto(amountMinor, t.currency),
      amount_minor: amountMinor,
      currency: t.currency,
      date: t.date,
      memo: t.memo,
      createdAt: t.createdAt.toISOString(),
    };
    if (t.splits && t.splits.length >= 0) {
      out.splits = t.splits.map((s) => {
        const split = s as TransactionSplit & { category?: { id: string; name: string; type: string } };
        return {
          id: s.id,
          categoryId: s.categoryId,
          amountMinor: typeof s.amountMinor === 'bigint' ? Number(s.amountMinor) : s.amountMinor,
          category: split.category ? { id: split.category.id, name: split.category.name, type: split.category.type } : undefined,
        };
      });
    }
    return out;
  }
}


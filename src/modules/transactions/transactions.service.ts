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
import { toMoneyDto } from '../../common/money.util';
import { CreateTransactionTemplateDto } from './dto/create-template.dto';

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

  async voiceParse(text: string): Promise<{ amountMinor: number; categoryId?: string | null; memo?: string | null }> {
    const trimmed = (text || '').trim();
    const match = trimmed.match(/(\d+(?:[.,]\d{1,2})?)/);
    let amountMinor = 0;
    if (match) {
      const num = parseFloat(match[1].replace(',', '.'));
      amountMinor = Math.round(num * 100);
    }
    return { amountMinor, categoryId: null, memo: trimmed || null };
  }

  /** OCR чека (stub: возвращает заглушку) */
  async receiptOcr(file: Express.Multer.File | undefined): Promise<{
    amountMinor: number;
    date?: string | null;
    memo?: string | null;
    categoryId?: string | null;
  }> {
    return { amountMinor: 0, date: null, memo: null, categoryId: null };
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


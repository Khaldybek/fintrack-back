import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Budget } from './entities/budget.entity';
import { Transaction } from '../transactions/entities/transaction.entity';
import { Account } from '../accounts/entities/account.entity';
import { CreateBudgetDto } from './dto/create-budget.dto';
import { UpdateBudgetDto } from './dto/update-budget.dto';
import { toMoneyDto } from '../../common/money.util';
import { getCurrentMonthRange } from '../../common/date.util';
import { FeatureGatedException } from '../../common/errors/feature-gated.exception';
import { CategoriesService } from '../categories/categories.service';

const FREE_BUDGET_LIMIT = 1;

function progressSeverity(percent: number): 'good' | 'attention' | 'risk' {
  if (percent >= 100) return 'risk';
  if (percent >= 85) return 'risk';
  if (percent >= 70) return 'attention';
  return 'good';
}

@Injectable()
export class BudgetsService {
  constructor(
    @InjectRepository(Budget)
    private readonly repo: Repository<Budget>,
    @InjectRepository(Transaction)
    private readonly transactionRepo: Repository<Transaction>,
    @InjectRepository(Account)
    private readonly accountRepo: Repository<Account>,
    private readonly categoriesService: CategoriesService,
  ) {}

  async findAllByUser(userId: string, timezone: string) {
    const budgets = await this.repo.find({
      where: { userId },
      relations: ['category'],
      order: { createdAt: 'ASC' },
    });
    const { dateFrom, dateTo } = getCurrentMonthRange(timezone);
    const accountIds = await this.getUserAccountIds(userId);
    const result: Awaited<ReturnType<BudgetsService['findOne']>>[] = [];
    for (const b of budgets) {
      const spent = await this.getSpentForCategory(b.categoryId, accountIds, dateFrom, dateTo);
      const percent = b.limitMinor > 0 ? Math.round((spent / b.limitMinor) * 100) : 0;
      result.push(this.toResponse(b, spent, percent));
    }
    return result;
  }

  private async getUserAccountIds(userId: string): Promise<string[]> {
    const accounts = await this.accountRepo.find({ where: { userId }, select: ['id'] });
    return accounts.map((a) => a.id);
  }

  private async getSpentForCategory(
    categoryId: string,
    accountIds: string[],
    dateFrom: string,
    dateTo: string,
  ): Promise<number> {
    if (accountIds.length === 0) return 0;
    const r = await this.transactionRepo
      .createQueryBuilder('t')
      .select('COALESCE(SUM(ABS(t.amount_minor)), 0)', 'sum')
      .where('t.category_id = :categoryId', { categoryId })
      .andWhere('t.account_id IN (:...accountIds)', { accountIds })
      .andWhere('t.date >= :dateFrom', { dateFrom })
      .andWhere('t.date <= :dateTo', { dateTo })
      .andWhere('t.amount_minor < 0')
      .andWhere('t.deleted_at IS NULL')
      .getRawOne<{ sum: string }>();
    return parseInt(r?.sum ?? '0', 10);
  }

  async findOne(id: string, userId: string, timezone: string) {
    const budget = await this.repo.findOne({ where: { id, userId }, relations: ['category'] });
    if (!budget) throw new NotFoundException('Budget not found');
    const accountIds = await this.getUserAccountIds(userId);
    const { dateFrom, dateTo } = getCurrentMonthRange(timezone);
    const spent = await this.getSpentForCategory(budget.categoryId, accountIds, dateFrom, dateTo);
    const percent = budget.limitMinor > 0 ? Math.round((spent / budget.limitMinor) * 100) : 0;
    return this.toResponse(budget, spent, percent);
  }

  async create(userId: string, dto: CreateBudgetDto, timezone: string) {
    await this.categoriesService.findOne(dto.categoryId, userId);
    const count = await this.repo.count({ where: { userId } });
    if (count >= FREE_BUDGET_LIMIT) {
      throw new FeatureGatedException(
        'budgets_limit',
        'Upgrade to Pro to add more than 1 budget.',
      );
    }
    const budget = this.repo.create({
      userId,
      categoryId: dto.categoryId,
      limitMinor: dto.limitMinor,
      currency: dto.currency ?? 'KZT',
    });
    const saved = await this.repo.save(budget);
    return this.findOne(saved.id, userId, timezone);
  }

  async update(id: string, userId: string, dto: UpdateBudgetDto, timezone: string) {
    const budget = await this.repo.findOne({ where: { id, userId } });
    if (!budget) throw new NotFoundException('Budget not found');
    if (dto.limitMinor !== undefined) budget.limitMinor = dto.limitMinor;
    if (dto.currency !== undefined) budget.currency = dto.currency;
    await this.repo.save(budget);
    return this.findOne(id, userId, timezone);
  }

  async remove(id: string, userId: string): Promise<void> {
    const budget = await this.repo.findOne({ where: { id, userId } });
    if (!budget) throw new NotFoundException('Budget not found');
    await this.repo.softRemove(budget);
  }

  private toResponse(
    budget: Budget,
    spent: number,
    percent: number,
  ) {
    const severity = progressSeverity(percent);
    return {
      id: budget.id,
      categoryId: budget.categoryId,
      category: budget.category ? { id: budget.category.id, name: budget.category.name, type: budget.category.type } : undefined,
      limit: toMoneyDto(budget.limitMinor, budget.currency),
      limit_minor: budget.limitMinor,
      spent: toMoneyDto(spent, budget.currency),
      spent_minor: spent,
      progress_percent: percent,
      severity,
      status: severity === 'risk' ? 'risk' : severity === 'attention' ? 'attention' : 'stable',
      explanation:
        percent >= 100
          ? 'Лимит превышен.'
          : percent >= 85
            ? 'Близко к лимиту (≥85%).'
            : percent >= 70
              ? 'Порог 70% достигнут.'
              : 'В пределах нормы.',
      currency: budget.currency,
      thresholds: { warning_70: 70, warning_85: 85, danger_100: 100 },
    };
  }
}

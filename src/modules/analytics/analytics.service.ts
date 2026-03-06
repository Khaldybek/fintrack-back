import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Account } from '../accounts/entities/account.entity';
import { Transaction } from '../transactions/entities/transaction.entity';
import { AiService } from '../ai/ai.service';
import { toMoneyDto } from '../../common/money.util';
import { getCurrentMonthRange } from '../../common/date.util';
import { getMonthNameRu } from '../ai/prompts/monthly-summary.prompt';
import type { User } from '../users/entities/user.entity';

const MONTHLY_SUMMARY_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const NO_DATA_TEXT = 'Нет данных за период.';

@Injectable()
export class AnalyticsService {
  private readonly monthlySummaryCache = new Map<
    string,
    { summaryText: string; shareReadyText: string; expiresAt: number }
  >();

  constructor(
    @InjectRepository(Account)
    private readonly accountRepo: Repository<Account>,
    @InjectRepository(Transaction)
    private readonly txRepo: Repository<Transaction>,
    private readonly aiService: AiService,
  ) {}

  private async accountIds(userId: string): Promise<string[]> {
    const a = await this.accountRepo.find({ where: { userId }, select: ['id'] });
    return a.map((x) => x.id);
  }

  async monthly(user: User, year?: number) {
    const ids = await this.accountIds(user.id);
    const y = year ?? new Date().getFullYear();
    if (ids.length === 0) return { year: y, months: [] };
    const rows = await this.txRepo
      .createQueryBuilder('t')
      .select('SUBSTRING(t.date::text FROM 1 FOR 7)', 'month')
      .addSelect('SUM(CASE WHEN t.amount_minor > 0 THEN t.amount_minor ELSE 0 END)', 'income')
      .addSelect('SUM(CASE WHEN t.amount_minor < 0 THEN ABS(t.amount_minor) ELSE 0 END)', 'expense')
      .where('t.account_id IN (:...ids)', { ids })
      .andWhere('SUBSTRING(t.date::text FROM 1 FOR 4) = :y', { y: String(y) })
      .andWhere('t.deleted_at IS NULL')
      .groupBy('SUBSTRING(t.date::text FROM 1 FOR 7)')
      .orderBy('month')
      .getRawMany();
    const currency = 'KZT';
    return {
      year: y,
      months: rows.map((r) => ({
        month: r.month,
        income: toMoneyDto(Number(r.income) || 0, currency),
        expense: toMoneyDto(Number(r.expense) || 0, currency),
      })),
    };
  }

  async categories(user: User, dateFrom?: string, dateTo?: string) {
    const ids = await this.accountIds(user.id);
    if (ids.length === 0) return { items: [], total_expense_minor: 0 };
    const range = dateFrom && dateTo ? { dateFrom, dateTo } : getCurrentMonthRange(user.timezone ?? 'UTC');
    const rows = await this.txRepo
      .createQueryBuilder('t')
      .innerJoin('categories', 'c', 'c.id = t.category_id')
      .select('t.category_id', 'categoryId')
      .addSelect('c.name', 'name')
      .addSelect('c.type', 'type')
      .addSelect('SUM(ABS(CASE WHEN t.amount_minor < 0 THEN t.amount_minor ELSE 0 END))', 'expense')
      .where('t.account_id IN (:...ids)', { ids })
      .andWhere('t.date >= :dateFrom', { dateFrom: range.dateFrom })
      .andWhere('t.date <= :dateTo', { dateTo: range.dateTo })
      .andWhere('t.amount_minor < 0')
      .groupBy('t.category_id')
      .addGroupBy('c.name')
      .addGroupBy('c.type')
      .getRawMany();
    const total = rows.reduce((s, r) => s + parseInt(r.expense ?? '0', 10), 0);
    const currency = 'KZT';
    return {
      items: rows.map((r) => ({
        categoryId: r.categoryId,
        name: r.name,
        type: r.type,
        expense: toMoneyDto(parseInt(r.expense ?? '0', 10), currency),
        expense_minor: parseInt(r.expense ?? '0', 10),
      })),
      total_expense: toMoneyDto(total, currency),
      total_expense_minor: total,
    };
  }

  async trends(user: User, months: number = 6) {
    const safeMonths = Number.isInteger(months) && months >= 1 && months <= 60 ? months : 6;
    const end = new Date();
    const start = new Date();
    start.setMonth(start.getMonth() - safeMonths);
    const ids = await this.accountIds(user.id);
    if (ids.length === 0) return { items: [] };
    const fromStr = start.toISOString().slice(0, 10);
    const toStr = end.toISOString().slice(0, 10);
    const rows = await this.txRepo
      .createQueryBuilder('t')
      .select('SUBSTRING(t.date::text FROM 1 FOR 7)', 'month')
      .addSelect('SUM(t.amount_minor)', 'net')
      .where('t.account_id IN (:...ids)', { ids })
      .andWhere('t.date >= :from', { from: fromStr })
      .andWhere('t.date <= :to', { to: toStr })
      .andWhere('t.deleted_at IS NULL')
      .groupBy('SUBSTRING(t.date::text FROM 1 FOR 7)')
      .orderBy('month')
      .getRawMany();
    const currency = 'KZT';
    return {
      items: rows.map((r) => {
        const net = Number(r.net) || 0;
        return {
          month: r.month,
          net: toMoneyDto(net, currency),
          net_minor: net,
        };
      }),
    };
  }

  async heatmap(user: User, days: number = 90) {
    const safeDays = Number.isInteger(days) && days >= 7 && days <= 365 ? days : 90;
    const ids = await this.accountIds(user.id);
    if (ids.length === 0) return { days: [] };
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - safeDays);
    const rows = await this.txRepo
      .createQueryBuilder('t')
      .select('t.date::text', 'day')
      .addSelect('SUM(ABS(t.amount_minor))', 'total')
      .where('t.account_id IN (:...ids)', { ids })
      .andWhere('t.date >= :from', { from: start.toISOString().slice(0, 10) })
      .andWhere('t.date <= :to', { to: end.toISOString().slice(0, 10) })
      .andWhere('t.amount_minor < 0')
      .andWhere('t.deleted_at IS NULL')
      .groupBy('t.date::text')
      .orderBy('day')
      .getRawMany();
    const currency = 'KZT';
    const items = rows.map((r) => ({
      day: r.day,
      total: toMoneyDto(Number(r.total) || 0, currency),
      total_minor: Number(r.total) || 0,
    }));
    const max = items.reduce((m, r) => Math.max(m, r.total_minor), 0);
    return {
      days: items.map((r) => ({
        ...r,
        intensity: max > 0 ? Math.round((r.total_minor / max) * 100) : 0,
      })),
    };
  }

  async anomalies(user: User) {
    const ids = await this.accountIds(user.id);
    if (ids.length === 0) return { items: [], status: 'stable' };
    const rows = await this.txRepo
      .createQueryBuilder('t')
      .select('SUBSTRING(t.date::text FROM 1 FOR 7)', 'month')
      .addSelect('SUM(ABS(t.amount_minor))', 'expense')
      .where('t.account_id IN (:...ids)', { ids })
      .andWhere('t.amount_minor < 0')
      .andWhere('t.deleted_at IS NULL')
      .groupBy('SUBSTRING(t.date::text FROM 1 FOR 7)')
      .orderBy('month')
      .getRawMany();
    if (rows.length < 2) return { items: [], status: 'stable' };
    const values = rows.map((r) => Number(r.expense) || 0);
    const avg = values.reduce((s, v) => s + v, 0) / values.length;
    const stddev = Math.sqrt(values.reduce((s, v) => s + Math.pow(v - avg, 2), 0) / values.length);
    const threshold = avg + 1.5 * stddev;
    const currency = 'KZT';
    const anomalous = rows
      .filter((r) => (Number(r.expense) || 0) > threshold)
      .map((r) => ({
        month: r.month,
        expense: toMoneyDto(Number(r.expense) || 0, currency),
        expense_minor: Number(r.expense) || 0,
        avg_expense: toMoneyDto(Math.round(avg), currency),
        deviation_pct: Math.round(((Number(r.expense) - avg) / avg) * 100),
      }));
    return {
      items: anomalous,
      status: anomalous.length > 0 ? 'anomaly_detected' : 'stable',
    };
  }

  async topCategories(user: User, dateFrom?: string, dateTo?: string, limit: number = 5) {
    const ids = await this.accountIds(user.id);
    if (ids.length === 0) return { items: [] };
    const range = dateFrom && dateTo ? { dateFrom, dateTo } : getCurrentMonthRange(user.timezone ?? 'UTC');
    const safeLimit = Number.isInteger(limit) && limit >= 1 && limit <= 20 ? limit : 5;
    const rows = await this.txRepo
      .createQueryBuilder('t')
      .innerJoin('categories', 'c', 'c.id = t.category_id')
      .select('t.category_id', 'categoryId')
      .addSelect('c.name', 'name')
      .addSelect('c.icon', 'icon')
      .addSelect('c.color', 'color')
      .addSelect('SUM(ABS(t.amount_minor))', 'expense')
      .addSelect('COUNT(t.id)', 'tx_count')
      .where('t.account_id IN (:...ids)', { ids })
      .andWhere('t.date >= :dateFrom', { dateFrom: range.dateFrom })
      .andWhere('t.date <= :dateTo', { dateTo: range.dateTo })
      .andWhere('t.amount_minor < 0')
      .andWhere('t.deleted_at IS NULL')
      .groupBy('t.category_id')
      .addGroupBy('c.name')
      .addGroupBy('c.icon')
      .addGroupBy('c.color')
      .orderBy('expense', 'DESC')
      .limit(safeLimit)
      .getRawMany();
    const currency = 'KZT';
    const total = rows.reduce((s, r) => s + (Number(r.expense) || 0), 0);
    return {
      date_from: range.dateFrom,
      date_to: range.dateTo,
      items: rows.map((r, i) => ({
        rank: i + 1,
        categoryId: r.categoryId,
        name: r.name,
        icon: r.icon ?? null,
        color: r.color ?? null,
        expense: toMoneyDto(Number(r.expense) || 0, currency),
        expense_minor: Number(r.expense) || 0,
        tx_count: Number(r.tx_count) || 0,
        share_pct: total > 0 ? Math.round(((Number(r.expense) || 0) / total) * 100) : 0,
      })),
      total_expense: toMoneyDto(total, currency),
      total_expense_minor: total,
    };
  }

  async savingsRate(user: User, months: number = 6) {
    const safeMonths = Number.isInteger(months) && months >= 1 && months <= 24 ? months : 6;
    const ids = await this.accountIds(user.id);
    if (ids.length === 0) return { items: [] };
    const end = new Date();
    const start = new Date();
    start.setMonth(start.getMonth() - safeMonths);
    const rows = await this.txRepo
      .createQueryBuilder('t')
      .select('SUBSTRING(t.date::text FROM 1 FOR 7)', 'month')
      .addSelect('SUM(CASE WHEN t.amount_minor > 0 THEN t.amount_minor ELSE 0 END)', 'income')
      .addSelect('SUM(CASE WHEN t.amount_minor < 0 THEN ABS(t.amount_minor) ELSE 0 END)', 'expense')
      .where('t.account_id IN (:...ids)', { ids })
      .andWhere('t.date >= :from', { from: start.toISOString().slice(0, 10) })
      .andWhere('t.date <= :to', { to: end.toISOString().slice(0, 10) })
      .andWhere('t.deleted_at IS NULL')
      .groupBy('SUBSTRING(t.date::text FROM 1 FOR 7)')
      .orderBy('month')
      .getRawMany();
    const currency = 'KZT';
    return {
      items: rows.map((r) => {
        const income = Number(r.income) || 0;
        const expense = Number(r.expense) || 0;
        const saved = income - expense;
        const rate = income > 0 ? Math.round((saved / income) * 100) : 0;
        return {
          month: r.month,
          income: toMoneyDto(income, currency),
          expense: toMoneyDto(expense, currency),
          saved: toMoneyDto(saved, currency),
          saved_minor: saved,
          savings_rate_pct: rate,
          status: rate >= 20 ? 'good' : rate >= 0 ? 'attention' : 'risk',
        };
      }),
    };
  }

  async compare(
    user: User,
    periodA: { dateFrom: string; dateTo: string },
    periodB: { dateFrom: string; dateTo: string },
  ) {
    const ids = await this.accountIds(user.id);
    if (ids.length === 0) {
      return { period_a: null, period_b: null, diff: null };
    }
    const currency = 'KZT';
    const query = async (from: string, to: string) => {
      const rows = await this.txRepo
        .createQueryBuilder('t')
        .select('SUM(CASE WHEN t.amount_minor > 0 THEN t.amount_minor ELSE 0 END)', 'income')
        .addSelect('SUM(CASE WHEN t.amount_minor < 0 THEN ABS(t.amount_minor) ELSE 0 END)', 'expense')
        .addSelect('COUNT(t.id)', 'tx_count')
        .where('t.account_id IN (:...ids)', { ids })
        .andWhere('t.date >= :from', { from })
        .andWhere('t.date <= :to', { to })
        .andWhere('t.deleted_at IS NULL')
        .getRawOne<{ income: string; expense: string; tx_count: string }>();
      const income = Number(rows?.income) || 0;
      const expense = Number(rows?.expense) || 0;
      return { income, expense, net: income - expense, tx_count: Number(rows?.tx_count) || 0 };
    };
    const [a, b] = await Promise.all([
      query(periodA.dateFrom, periodA.dateTo),
      query(periodB.dateFrom, periodB.dateTo),
    ]);
    const diffExpense = b.expense - a.expense;
    const diffIncome = b.income - a.income;
    return {
      period_a: {
        date_from: periodA.dateFrom,
        date_to: periodA.dateTo,
        income: toMoneyDto(a.income, currency),
        expense: toMoneyDto(a.expense, currency),
        net: toMoneyDto(a.net, currency),
        tx_count: a.tx_count,
      },
      period_b: {
        date_from: periodB.dateFrom,
        date_to: periodB.dateTo,
        income: toMoneyDto(b.income, currency),
        expense: toMoneyDto(b.expense, currency),
        net: toMoneyDto(b.net, currency),
        tx_count: b.tx_count,
      },
      diff: {
        income_change: toMoneyDto(diffIncome, currency),
        income_change_pct: a.income > 0 ? Math.round((diffIncome / a.income) * 100) : null,
        expense_change: toMoneyDto(diffExpense, currency),
        expense_change_pct: a.expense > 0 ? Math.round((diffExpense / a.expense) * 100) : null,
      },
    };
  }

  async getMonthlyReportSummary(
    user: User,
    year: number,
    month: number,
  ): Promise<{ summaryText: string; shareReadyText: string }> {
    const cacheKey = `${user.id}:${year}:${month}`;
    const now = Date.now();
    const cached = this.monthlySummaryCache.get(cacheKey);
    if (cached && cached.expiresAt > now) {
      return { summaryText: cached.summaryText, shareReadyText: cached.shareReadyText };
    }

    const dateFrom = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const dateTo = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

    const ids = await this.accountIds(user.id);
    let incomeMinor = 0;
    let expenseMinor = 0;
    if (ids.length > 0) {
      const row = await this.txRepo
        .createQueryBuilder('t')
        .select('SUM(CASE WHEN t.amount_minor > 0 THEN t.amount_minor ELSE 0 END)', 'income')
        .addSelect('SUM(CASE WHEN t.amount_minor < 0 THEN ABS(t.amount_minor) ELSE 0 END)', 'expense')
        .where('t.account_id IN (:...ids)', { ids })
        .andWhere('t.date >= :from', { from: dateFrom })
        .andWhere('t.date <= :to', { to: dateTo })
        .andWhere('t.deleted_at IS NULL')
        .getRawOne<{ income: string; expense: string }>();
      incomeMinor = Number(row?.income) || 0;
      expenseMinor = Number(row?.expense) || 0;
    }

    const savingsMinor = incomeMinor - expenseMinor;
    const currency = 'KZT';

    if (incomeMinor === 0 && expenseMinor === 0) {
      return { summaryText: NO_DATA_TEXT, shareReadyText: NO_DATA_TEXT };
    }

    const topCat = await this.topCategories(user, dateFrom, dateTo, 5);
    const top_categories = topCat.items.map((r) => ({
      name: r.name,
      expense_minor: r.expense_minor ?? 0,
    }));

    if (this.aiService.isEnabled()) {
      const result = await this.aiService.generateMonthlySummary({
        year,
        month,
        month_name_ru: getMonthNameRu(month),
        income_minor: incomeMinor,
        expense_minor: expenseMinor,
        savings_minor: savingsMinor,
        currency,
        top_categories,
      });
      if (result) {
        this.monthlySummaryCache.set(cacheKey, {
          summaryText: result.summaryText,
          shareReadyText: result.shareReadyText,
          expiresAt: now + MONTHLY_SUMMARY_CACHE_TTL_MS,
        });
        this.pruneMonthlySummaryCache();
        return result;
      }
    }

    const summaryText =
      `За ${getMonthNameRu(month)} ${year}: доход ${incomeMinor.toLocaleString('ru-KZ')} ${currency}, расход ${expenseMinor.toLocaleString('ru-KZ')} ${currency}. Накопления: ${savingsMinor.toLocaleString('ru-KZ')} ${currency}.`;
    const shareReadyText = `Мой ${getMonthNameRu(month)} ${year}: ${savingsMinor >= 0 ? '+' : ''}${savingsMinor.toLocaleString('ru-KZ')} ${currency} накоплений.`;
    return { summaryText, shareReadyText };
  }

  private pruneMonthlySummaryCache(): void {
    const now = Date.now();
    for (const [key, entry] of this.monthlySummaryCache.entries()) {
      if (entry.expiresAt <= now) this.monthlySummaryCache.delete(key);
    }
  }
}

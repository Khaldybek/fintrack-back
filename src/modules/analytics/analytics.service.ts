import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Account } from '../accounts/entities/account.entity';
import { Transaction } from '../transactions/entities/transaction.entity';
import { toMoneyDto } from '../../common/money.util';
import { getCurrentMonthRange } from '../../common/date.util';
import type { User } from '../users/entities/user.entity';

@Injectable()
export class AnalyticsService {
  constructor(
    @InjectRepository(Account)
    private readonly accountRepo: Repository<Account>,
    @InjectRepository(Transaction)
    private readonly txRepo: Repository<Transaction>,
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
      .select('SUBSTRING(t.date FROM 1 FOR 7)', 'month')
      .addSelect('SUM(CASE WHEN t.amount_minor > 0 THEN t.amount_minor ELSE 0 END)', 'income')
      .addSelect('SUM(CASE WHEN t.amount_minor < 0 THEN ABS(t.amount_minor) ELSE 0 END)', 'expense')
      .where('t.account_id IN (:...ids)', { ids })
      .andWhere('SUBSTRING(t.date FROM 1 FOR 4) = :y', { y: String(y) })
      .groupBy('SUBSTRING(t.date FROM 1 FOR 7)')
      .orderBy('month')
      .getRawMany();
    const currency = 'KZT';
    return {
      year: y,
      months: rows.map((r) => ({
        month: r.month,
        income: toMoneyDto(parseInt(r.income ?? '0', 10), currency),
        expense: toMoneyDto(parseInt(r.expense ?? '0', 10), currency),
      })),
    };
  }

  async categories(user: User, dateFrom?: string, dateTo?: string) {
    const ids = await this.accountIds(user.id);
    if (ids.length === 0) return { items: [], total_expense_minor: 0 };
    const range = dateFrom && dateTo ? { dateFrom, dateTo } : getCurrentMonthRange(user.timezone);
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
    const end = new Date();
    const start = new Date();
    start.setMonth(start.getMonth() - months);
    const ids = await this.accountIds(user.id);
    if (ids.length === 0) return { items: [] };
    const rows = await this.txRepo
      .createQueryBuilder('t')
      .select('SUBSTRING(t.date FROM 1 FOR 7)', 'month')
      .addSelect('SUM(t.amount_minor)', 'net')
      .where('t.account_id IN (:...ids)', { ids })
      .andWhere('t.date >= :from', { from: start.toISOString().slice(0, 10) })
      .andWhere('t.date <= :to', { to: end.toISOString().slice(0, 10) })
      .groupBy('SUBSTRING(t.date FROM 1 FOR 7)')
      .orderBy('month')
      .getRawMany();
    const currency = 'KZT';
    return {
      items: rows.map((r) => ({
        month: r.month,
        net: toMoneyDto(parseInt(r.net ?? '0', 10), currency),
        net_minor: parseInt(r.net ?? '0', 10),
      })),
    };
  }

  async heatmap(_user: User) {
    return { days: [], explanation: 'Heatmap data.' };
  }

  async anomalies(_user: User) {
    return { items: [], status: 'stable' };
  }

  /** Экспорт месячного отчёта (stub: возвращает url заглушку) */
  async monthlyReportExport(
    _user: User,
    year?: number,
    month?: number,
  ): Promise<{ url: string }> {
    const y = year ?? new Date().getFullYear();
    const m = month ?? new Date().getMonth() + 1;
    return { url: `/exports/monthly-report-${y}-${String(m).padStart(2, '0')}.pdf` };
  }
}

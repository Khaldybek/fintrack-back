import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Account } from '../accounts/entities/account.entity';
import { Transaction } from '../transactions/entities/transaction.entity';
import { SalarySchedule } from './entities/salary-schedule.entity';
import { AiService } from '../ai/ai.service';
import { toMoneyDto } from '../../common/money.util';
import { getTodayInTimezone } from '../../common/date.util';
import type { User } from '../users/entities/user.entity';

const INSIGHT_CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

const DEFAULT_CURRENCY = 'KZT';
const LOW_BALANCE_THRESHOLD_MINOR = 50_000; // 500 KZT if 1 unit = 1 tenge

/** Start and end of current month in user timezone as YYYY-MM-DD */
function getCurrentMonthRange(timezone: string): { dateFrom: string; dateTo: string } {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone || 'UTC',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = formatter.formatToParts(now);
  const year = parts.find((p) => p.type === 'year')!.value;
  const month = parts.find((p) => p.type === 'month')!.value;
  const dateFrom = `${year}-${month}-01`;
  const y = parseInt(year, 10);
  const m = parseInt(month, 10);
  const lastDay = new Date(y, m, 0);
  const dateTo = `${y}-${month}-${String(lastDay.getDate()).padStart(2, '0')}`;
  return { dateFrom, dateTo };
}

type InsightCacheEntry = { text: string; severity: 'good' | 'attention' | 'risk'; status: string; expiresAt: number };

@Injectable()
export class DashboardService {
  private readonly insightCache = new Map<string, InsightCacheEntry>();

  constructor(
    @InjectRepository(Account)
    private readonly accountRepo: Repository<Account>,
    @InjectRepository(Transaction)
    private readonly transactionRepo: Repository<Transaction>,
    @InjectRepository(SalarySchedule)
    private readonly salaryRepo: Repository<SalarySchedule>,
    private readonly aiService: AiService,
  ) {}

  async getSummary(user: User) {
    const accounts = await this.accountRepo.find({ where: { userId: user.id }, select: ['id', 'balanceMinor', 'currency'] });
    const accountIds = accounts.map((a) => a.id);
    const totalBalanceMinor = accounts.reduce((sum, a) => sum + Number(a.balanceMinor), 0);
    const currency = accounts[0]?.currency ?? DEFAULT_CURRENCY;

    const { dateFrom, dateTo } = getCurrentMonthRange(user.timezone);

    let incomeMinor = 0;
    let expenseMinor = 0;
    if (accountIds.length > 0) {
      const income = await this.transactionRepo
        .createQueryBuilder('t')
        .select('COALESCE(SUM(t.amount_minor), 0)', 'sum')
        .where('t.account_id IN (:...ids)', { ids: accountIds })
        .andWhere('t.date >= :dateFrom', { dateFrom })
        .andWhere('t.date <= :dateTo', { dateTo })
        .andWhere('t.amount_minor > 0')
        .getRawOne<{ sum: string }>();
      const expense = await this.transactionRepo
        .createQueryBuilder('t')
        .select('COALESCE(SUM(ABS(t.amount_minor)), 0)', 'sum')
        .where('t.account_id IN (:...ids)', { ids: accountIds })
        .andWhere('t.date >= :dateFrom', { dateFrom })
        .andWhere('t.date <= :dateTo', { dateTo })
        .andWhere('t.amount_minor < 0')
        .getRawOne<{ sum: string }>();
      incomeMinor = parseInt(income?.sum ?? '0', 10);
      expenseMinor = parseInt(expense?.sum ?? '0', 10);
    }

    return {
      balance: toMoneyDto(totalBalanceMinor, currency),
      balance_total_minor: totalBalanceMinor,
      currency,
      month: { dateFrom, dateTo },
      income: toMoneyDto(incomeMinor, currency),
      income_minor: incomeMinor,
      expense: toMoneyDto(expenseMinor, currency),
      expense_minor: expenseMinor,
      timezone_hint: user.timezone,
    };
  }

  async getForecast(user: User) {
    const summary = await this.getSummary(user);
    const balance = summary.balance_total_minor;
    const { dateTo } = summary.month;
    const today = new Date().toISOString().slice(0, 10);
    const endDate = new Date(dateTo);
    const todayDate = new Date(today);
    const daysLeft = Math.max(0, Math.ceil((endDate.getTime() - todayDate.getTime()) / (24 * 60 * 60 * 1000)));
    const daysElapsed = new Date(today).getDate();
    const avgDailyExpense = daysElapsed > 0 ? Math.round(summary.expense_minor / daysElapsed) : 0;
    const projectedBalanceMinor = balance - avgDailyExpense * daysLeft;

    const status = projectedBalanceMinor < 0 ? 'risk' : projectedBalanceMinor < LOW_BALANCE_THRESHOLD_MINOR ? 'attention' : 'stable';
    const severity = projectedBalanceMinor < 0 ? 'risk' : projectedBalanceMinor < LOW_BALANCE_THRESHOLD_MINOR ? 'attention' : 'good';

    const explanation =
      projectedBalanceMinor < 0
        ? `Прогноз: к концу месяца баланс может уйти в минус (${summary.currency}).`
        : daysLeft === 0
          ? 'Конец месяца.'
          : `Прогноз на конец месяца: ${toMoneyDto(projectedBalanceMinor, summary.currency).formatted}.`;

    let explanationAi: string | null = null;
    if (this.aiService.isEnabled()) {
      explanationAi =
        (await this.aiService.explainForecast({
          balance_minor: balance,
          projected_balance_minor: projectedBalanceMinor,
          status: status as 'stable' | 'attention' | 'risk',
          days_left: daysLeft,
          currency: summary.currency,
        })) ?? null;
    }

    return {
      balance: toMoneyDto(balance, summary.currency),
      projected_balance: toMoneyDto(projectedBalanceMinor, summary.currency),
      projected_balance_minor: projectedBalanceMinor,
      date_to: dateTo,
      days_left: daysLeft,
      status,
      severity,
      explanation,
      explanationAi: explanationAi ?? undefined,
      timezone_hint: user.timezone,
    };
  }

  async getAlerts(user: User) {
    const summary = await this.getSummary(user);
    type AlertItem = {
      type: string;
      severity: 'good' | 'attention' | 'risk';
      status: string;
      explanation: string;
      amount?: { amount_minor: number; currency: string; formatted: string };
    };
    const items: AlertItem[] = [];

    const totalMinor = summary.balance_total_minor;
    const currency = summary.currency;

    if (totalMinor < 0) {
      items.push({
        type: 'negative_balance',
        severity: 'risk',
        status: 'risk',
        explanation: 'Баланс отрицательный. Рекомендуем пополнить счёт.',
        amount: toMoneyDto(totalMinor, currency),
      });
    } else if (totalMinor < LOW_BALANCE_THRESHOLD_MINOR) {
      items.push({
        type: 'low_balance',
        severity: 'attention',
        status: 'attention',
        explanation: 'Низкий остаток на счетах. Рекомендуем контролировать расходы.',
        amount: toMoneyDto(totalMinor, currency),
      });
    }

    const salaryAlert = await this.getSalarySoonAlert(user);
    if (salaryAlert) items.push(salaryAlert);

    return { items, timezone_hint: user.timezone };
  }

  private async getSalarySoonAlert(user: User): Promise<{
    type: string;
    severity: 'good' | 'attention' | 'risk';
    status: string;
    explanation: string;
    amount?: { amount_minor: number; currency: string; formatted: string };
  } | null> {
    const schedules = await this.salaryRepo.find({ where: { userId: user.id }, order: { dayOfMonth: 'ASC' } });
    if (schedules.length === 0) return null;

    const now = new Date();
    const tz = user.timezone || 'UTC';
    const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: tz, day: 'numeric', month: '2-digit', year: 'numeric' });
    const parts = formatter.formatToParts(now);
    const today = parseInt(parts.find((p) => p.type === 'day')!.value, 10);
    const month = parseInt(parts.find((p) => p.type === 'month')!.value, 10);
    const year = parseInt(parts.find((p) => p.type === 'year')!.value, 10);

    const lastDayOfMonth = new Date(year, month + 1, 0).getDate();
    for (const s of schedules) {
      const salaryDay = Math.min(s.dayOfMonth, lastDayOfMonth);
      const daysUntil = salaryDay >= today ? salaryDay - today : lastDayOfMonth - today + salaryDay;
      if (daysUntil >= 3 && daysUntil <= 5) {
        return {
          type: 'salary_soon',
          severity: 'good',
          status: 'stable',
          explanation: `Зарплата через ${daysUntil} дн. (около ${salaryDay}-го).`,
        };
      }
    }
    return null;
  }

  async getSalarySchedules(userId: string) {
    return this.salaryRepo.find({
      where: { userId },
      order: { dayOfMonth: 'ASC' },
    });
  }

  async createSalarySchedule(userId: string, dayOfMonth: number, label?: string | null) {
    const schedule = this.salaryRepo.create({ userId, dayOfMonth, label: label ?? null });
    return this.salaryRepo.save(schedule);
  }

  async removeSalarySchedule(id: string, userId: string): Promise<void> {
    const schedule = await this.salaryRepo.findOne({ where: { id, userId } });
    if (schedule) await this.salaryRepo.remove(schedule);
  }

  async getInsight(user: User) {
    const dateStr = getTodayInTimezone(user.timezone ?? 'UTC');
    const cacheKey = `insight:${user.id}:${dateStr}`;
    const now = Date.now();
    const cached = this.insightCache.get(cacheKey);
    if (cached && cached.expiresAt > now) {
      return { text: cached.text, severity: cached.severity, status: cached.status };
    }

    const summary = await this.getSummary(user);
    const forecast = await this.getForecast(user);
    const severity = forecast.severity as 'good' | 'attention' | 'risk';
    const status = forecast.status;

    if (this.aiService.isEnabled()) {
      const text = await this.aiService.generateInsight({
        balance_minor: summary.balance_total_minor,
        income_minor: summary.income_minor,
        expense_minor: summary.expense_minor,
        projected_balance_minor: forecast.projected_balance_minor,
        forecast_status: forecast.status as 'stable' | 'attention' | 'risk',
        days_left_in_month: forecast.days_left,
        currency: summary.currency,
      });
      if (text) {
        const entry: InsightCacheEntry = {
          text,
          severity,
          status,
          expiresAt: now + INSIGHT_CACHE_TTL_MS,
        };
        this.insightCache.set(cacheKey, entry);
        this.pruneInsightCache();
        return { text, severity, status };
      }
    }

    const fallbackText =
      forecast.projected_balance_minor < 0
        ? 'Прогноз: к концу месяца баланс может уйти в минус. Рекомендуем сократить расходы или пополнить счёт.'
        : 'Проверьте остаток до конца месяца — прогноз в разделе «Прогноз».';
    return { text: fallbackText, severity, status };
  }

  private pruneInsightCache(): void {
    const now = Date.now();
    for (const [key, entry] of this.insightCache.entries()) {
      if (entry.expiresAt <= now) this.insightCache.delete(key);
    }
  }

  /** Финансовый индекс 0–100, status, factors (Pro-фича) */
  async getIndex(user: User): Promise<{
    score: number;
    status: 'stable' | 'attention' | 'risk';
    factors_positive: Array<{ label: string; score: number }>;
    factors_negative: Array<{ label: string; score: number }>;
  }> {
    const summary = await this.getSummary(user);
    const balance = summary.balance_total_minor;
    const income = summary.income_minor;
    const expense = summary.expense_minor;
    const factors_positive: Array<{ label: string; score: number }> = [];
    const factors_negative: Array<{ label: string; score: number }> = [];

    let score = 50;

    if (balance > 0) {
      const balanceScore = Math.min(20, Math.floor(balance / 100_000) * 2);
      score += balanceScore;
      factors_positive.push({ label: 'Положительный баланс', score: balanceScore });
    } else {
      factors_negative.push({ label: 'Отрицательный баланс', score: 20 });
      score -= 20;
    }

    if (income > 0) {
      const savingsRate = (income - expense) / income;
      if (savingsRate > 0.1) {
        const s = 15;
        score += s;
        factors_positive.push({ label: 'Накопления от дохода', score: s });
      } else if (savingsRate < 0) {
        factors_negative.push({ label: 'Расходы превышают доход', score: 15 });
        score -= 15;
      }
    }

    if (balance >= LOW_BALANCE_THRESHOLD_MINOR) {
      factors_positive.push({ label: 'Достаточный запас', score: 10 });
      score += 10;
    } else if (balance >= 0) {
      factors_negative.push({ label: 'Низкий запас', score: 5 });
      score -= 5;
    }

    score = Math.max(0, Math.min(100, score));
    const status: 'stable' | 'attention' | 'risk' = score >= 70 ? 'stable' : score >= 40 ? 'attention' : 'risk';

    return { score, status, factors_positive, factors_negative };
  }
}

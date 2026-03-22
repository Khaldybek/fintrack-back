import { Injectable } from '@nestjs/common';
import type { User } from '../users/entities/user.entity';
import { DashboardService } from '../dashboard/dashboard.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { CreditsService } from '../credits/credits.service';
import { toMoneyDto } from '../../common/money.util';

type NotificationSeverity = 'good' | 'attention' | 'risk';

type NotificationItem = {
  id: string;
  source: 'dashboard' | 'subscription' | 'credit' | 'salary';
  type: string;
  title: string;
  message: string;
  severity: NotificationSeverity;
  status: string;
  date?: string;
  days_left?: number;
  meta?: Record<string, unknown>;
};

function daysUntil(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr);
  target.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function getNextDateByDayOfMonth(dayOfMonth: number): string {
  const now = new Date();
  let y = now.getFullYear();
  let m = now.getDate() <= dayOfMonth ? now.getMonth() : now.getMonth() + 1;
  if (m > 11) {
    m = 0;
    y += 1;
  }
  const lastDay = new Date(y, m + 1, 0).getDate();
  const d = Math.min(dayOfMonth, lastDay);
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function severityWeight(severity: NotificationSeverity): number {
  if (severity === 'risk') return 3;
  if (severity === 'attention') return 2;
  return 1;
}

@Injectable()
export class NotificationsService {
  constructor(
    private readonly dashboardService: DashboardService,
    private readonly subscriptionsService: SubscriptionsService,
    private readonly creditsService: CreditsService,
  ) {}

  async list(user: User, daysAhead = 14, limit = 50, includeStable = false) {
    const safeDays = Number.isInteger(daysAhead) ? Math.max(1, Math.min(90, daysAhead)) : 14;
    const safeLimit = Number.isInteger(limit) ? Math.max(1, Math.min(200, limit)) : 50;

    const [dashboardAlerts, subsReminders, creditReminders, salarySchedules] = await Promise.all([
      this.dashboardService.getAlerts(user),
      this.subscriptionsService.reminders(user.id, safeDays),
      this.creditsService.reminders(user.id, safeDays),
      this.dashboardService.getSalarySchedules(user.id),
    ]);

    const items: NotificationItem[] = [];

    for (const alert of dashboardAlerts.items ?? []) {
      items.push({
        id: `dashboard:${alert.type}`,
        source: 'dashboard',
        type: alert.type,
        title: alert.type === 'negative_balance' ? 'Отрицательный баланс' : alert.type === 'low_balance' ? 'Низкий баланс' : 'Уведомление',
        message: alert.explanation,
        severity: alert.severity,
        status: alert.status,
        meta: alert.amount ? { amount: alert.amount } : undefined,
      });
    }

    for (const sub of subsReminders.items ?? []) {
      const d = typeof sub.days_until_payment === 'number' ? sub.days_until_payment : 0;
      const severity: NotificationSeverity = d < 0 ? 'risk' : d <= 3 ? 'attention' : 'good';
      items.push({
        id: `subscription:${sub.id}:${sub.nextPaymentDate}`,
        source: 'subscription',
        type: 'subscription_payment',
        title: `Подписка: ${sub.name}`,
        message: d < 0 ? 'Платеж просрочен' : d === 0 ? 'Платеж сегодня' : `Платеж через ${d} дн.`,
        severity,
        status: d < 0 ? 'overdue' : d <= 3 ? 'soon' : 'stable',
        date: sub.nextPaymentDate,
        days_left: d,
        meta: {
          subscription_id: sub.id,
          amount_minor: sub.amount_minor,
          currency: sub.currency,
        },
      });
    }

    for (const credit of creditReminders.items ?? []) {
      const d = Number(credit.daysUntilPayment) || 0;
      const severity: NotificationSeverity = d <= 3 ? 'attention' : 'good';
      items.push({
        id: `credit:${credit.id}:${credit.nextPaymentDate}`,
        source: 'credit',
        type: 'credit_payment',
        title: credit.bank ? `Кредит: ${credit.bank}` : 'Кредитный платеж',
        message: d === 0 ? 'Платеж сегодня' : `Платеж через ${d} дн.`,
        severity,
        status: d <= 3 ? 'soon' : 'stable',
        date: credit.nextPaymentDate,
        days_left: d,
        meta: {
          credit_id: credit.id,
          monthly_payment_minor: credit.monthly_payment_minor,
          currency: credit.currency,
        },
      });
    }

    for (const s of salarySchedules ?? []) {
      const nextDate = getNextDateByDayOfMonth(Number(s.dayOfMonth) || 1);
      const d = daysUntil(nextDate);
      if (d < 0 || d > safeDays) continue;
      const severity: NotificationSeverity = d <= 2 ? 'attention' : 'good';
      items.push({
        id: `salary:${s.id}:${nextDate}`,
        source: 'salary',
        type: 'salary_expected',
        title: s.label ? `Ожидается зарплата: ${s.label}` : 'Ожидается зарплата',
        message:
          d === 0
            ? 'Зарплата ожидается сегодня'
            : s.amountMinor
              ? `Через ${d} дн., сумма ${toMoneyDto(Number(s.amountMinor), 'KZT').formatted}`
              : `Через ${d} дн.`,
        severity,
        status: d <= 2 ? 'soon' : 'stable',
        date: nextDate,
        days_left: d,
        meta: {
          salary_schedule_id: s.id,
          amount_minor: s.amountMinor ?? null,
        },
      });
    }

    const visible = includeStable ? items : items.filter((x) => x.severity !== 'good');
    const sorted = visible.sort((a, b) => {
      const sw = severityWeight(b.severity) - severityWeight(a.severity);
      if (sw !== 0) return sw;
      const da = a.date ? new Date(a.date).getTime() : Number.MAX_SAFE_INTEGER;
      const db = b.date ? new Date(b.date).getTime() : Number.MAX_SAFE_INTEGER;
      return da - db;
    });

    const sliced = sorted.slice(0, safeLimit);
    return {
      items: sliced,
      total: sorted.length,
      unread: sorted.length,
      by_severity: {
        risk: sorted.filter((x) => x.severity === 'risk').length,
        attention: sorted.filter((x) => x.severity === 'attention').length,
        good: sorted.filter((x) => x.severity === 'good').length,
      },
    };
  }
}

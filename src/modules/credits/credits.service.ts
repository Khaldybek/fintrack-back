import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreditLoan } from './entities/credit-loan.entity';
import { CreateCreditDto } from './dto/create-credit.dto';
import { toMoneyDto } from '../../common/money.util';

/** Ближайшая дата платежа по дню месяца (1–31): сегодня или следующий такой день. */
function getNextPaymentDate(dayOfMonth: number): string {
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

function daysUntil(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr);
  target.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

@Injectable()
export class CreditsService {
  constructor(
    @InjectRepository(CreditLoan)
    private readonly repo: Repository<CreditLoan>,
  ) {}

  private toCreditResponse(c: CreditLoan) {
    const day = c.paymentDayOfMonth ?? 1;
    const nextDate = getNextPaymentDate(day);
    const daysUntilPayment = daysUntil(nextDate);
    return {
      id: c.id,
      bank: c.bank,
      principal: toMoneyDto(c.principalMinor, c.currency),
      principal_minor: c.principalMinor,
      ratePct: Number(c.ratePct),
      termMonths: c.termMonths,
      monthlyPayment: toMoneyDto(c.monthlyPaymentMinor, c.currency),
      monthly_payment_minor: c.monthlyPaymentMinor,
      paymentDayOfMonth: c.paymentDayOfMonth ?? null,
      nextPaymentDate: nextDate,
      daysUntilPayment,
      currency: c.currency,
    };
  }

  async findAll(userId: string) {
    const list = await this.repo.find({ where: { userId }, order: { createdAt: 'ASC' } });
    return list.map((c) => this.toCreditResponse(c));
  }

  async findOne(id: string, userId: string) {
    const c = await this.repo.findOne({ where: { id, userId } });
    if (!c) throw new NotFoundException('Credit not found');
    return this.toCreditResponse(c);
  }

  async create(userId: string, dto: CreateCreditDto) {
    const c = this.repo.create({
      userId,
      bank: dto.bank ?? null,
      principalMinor: dto.principalMinor,
      ratePct: dto.ratePct,
      termMonths: dto.termMonths,
      monthlyPaymentMinor: dto.monthlyPaymentMinor,
      paymentDayOfMonth: dto.paymentDayOfMonth ?? null,
      currency: dto.currency ?? 'KZT',
    });
    const saved = await this.repo.save(c);
    return this.findOne(saved.id, userId);
  }

  async update(id: string, userId: string, dto: Partial<CreateCreditDto>) {
    const c = await this.repo.findOne({ where: { id, userId } });
    if (!c) throw new NotFoundException('Credit not found');
    if (dto.bank !== undefined) c.bank = dto.bank;
    if (dto.principalMinor !== undefined) c.principalMinor = dto.principalMinor;
    if (dto.ratePct !== undefined) c.ratePct = dto.ratePct as CreditLoan['ratePct'];
    if (dto.termMonths !== undefined) c.termMonths = dto.termMonths;
    if (dto.monthlyPaymentMinor !== undefined) c.monthlyPaymentMinor = dto.monthlyPaymentMinor;
    if (dto.paymentDayOfMonth !== undefined) c.paymentDayOfMonth = dto.paymentDayOfMonth ?? null;
    if (dto.currency !== undefined) c.currency = dto.currency;
    await this.repo.save(c);
    return this.findOne(id, userId);
  }

  async remove(id: string, userId: string) {
    const c = await this.repo.findOne({ where: { id, userId } });
    if (!c) throw new NotFoundException('Credit not found');
    await this.repo.softRemove(c);
  }

  async summary(userId: string, monthlyIncomeMinor?: number) {
    const list = await this.repo.find({ where: { userId } });
    const totalDebt = list.reduce((s, c) => s + c.principalMinor, 0);
    const totalMonthly = list.reduce((s, c) => s + c.monthlyPaymentMinor, 0);
    const currency = list[0]?.currency ?? 'KZT';
    const income = monthlyIncomeMinor ?? 0;
    const debtToIncomePct = income > 0 ? Math.round((totalMonthly / income) * 100) : 0;
    const severity = debtToIncomePct >= 50 ? 'risk' : debtToIncomePct >= 30 ? 'attention' : 'good';
    return {
      total_debt: toMoneyDto(totalDebt, currency),
      total_debt_minor: totalDebt,
      total_monthly_payment: toMoneyDto(totalMonthly, currency),
      total_monthly_payment_minor: totalMonthly,
      debt_to_income_percent: debtToIncomePct,
      severity,
      status: severity,
      explanation: debtToIncomePct >= 50 ? 'Высокая долговая нагрузка (>50%).' : debtToIncomePct >= 30 ? 'Умеренная нагрузка (30–50%).' : 'Нормальная нагрузка (<30%).',
      currency,
    };
  }

  /** Напоминания: ближайшие платежи в течение следующих N дней (по умолчанию 14). */
  async reminders(userId: string, daysAhead: number = 14) {
    const list = await this.repo.find({ where: { userId }, order: { createdAt: 'ASC' } });
    const items: Array<{
      id: string;
      bank: string | null;
      monthlyPayment: ReturnType<typeof toMoneyDto>;
      monthly_payment_minor: number;
      nextPaymentDate: string;
      daysUntilPayment: number;
      currency: string;
    }> = [];
    for (const c of list) {
      const day = c.paymentDayOfMonth ?? 1;
      const nextDate = getNextPaymentDate(day);
      const days = daysUntil(nextDate);
      if (days >= 0 && days <= daysAhead) {
        items.push({
          id: c.id,
          bank: c.bank,
          monthlyPayment: toMoneyDto(c.monthlyPaymentMinor, c.currency),
          monthly_payment_minor: c.monthlyPaymentMinor,
          nextPaymentDate: nextDate,
          daysUntilPayment: days,
          currency: c.currency,
        });
      }
    }
    items.sort((a, b) => a.daysUntilPayment - b.daysUntilPayment);
    return { items, daysAhead };
  }

  async simulatePrepayment(userId: string, extraPerMonthMinor: number) {
    const list = await this.repo.find({ where: { userId } });
    const totalMonthly = list.reduce((s, c) => s + c.monthlyPaymentMinor, 0);
    const newMonthly = totalMonthly + extraPerMonthMinor;
    const totalDebt = list.reduce((s, c) => s + c.principalMinor, 0);
    const currency = list[0]?.currency ?? 'KZT';
    const monthsToPayoff = newMonthly > 0 ? Math.ceil(totalDebt / newMonthly) : 0;
    const totalPayment = newMonthly * monthsToPayoff;
    const overpayment = totalPayment - totalDebt;
    return {
      extra_per_month: toMoneyDto(extraPerMonthMinor, currency),
      new_total_monthly: toMoneyDto(newMonthly, currency),
      estimated_months_to_payoff: monthsToPayoff,
      estimated_overpayment: toMoneyDto(overpayment, currency),
      severity: 'good',
    };
  }
}

import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Subscription } from './entities/subscription.entity';
import { CreateSubscriptionDto } from './dto/create-subscription.dto';
import { UpdateSubscriptionDto } from './dto/update-subscription.dto';
import { toMoneyDto } from '../../common/money.util';
import { CategoriesService } from '../categories/categories.service';

function subscriptionSeverity(nextPaymentDate: string): 'good' | 'attention' | 'risk' {
  const next = new Date(nextPaymentDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  next.setHours(0, 0, 0, 0);
  const daysLeft = Math.ceil((next.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (daysLeft < 0) return 'risk';
  if (daysLeft <= 3) return 'attention';
  return 'good';
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function isOnOrBeforeToday(dateStr: string): boolean {
  const d = new Date(dateStr);
  const today = new Date();
  d.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);
  return d.getTime() <= today.getTime();
}

@Injectable()
export class SubscriptionsService {
  constructor(
    @InjectRepository(Subscription)
    private readonly repo: Repository<Subscription>,
    private readonly categoriesService: CategoriesService,
  ) {}

  async findAllByUser(userId: string) {
    const list = await this.repo.find({
      where: { userId },
      relations: ['category'],
      order: { nextPaymentDate: 'ASC' },
    });
    return list.map((s) => this.toResponse(s));
  }

  async findOne(id: string, userId: string) {
    const sub = await this.repo.findOne({
      where: { id, userId },
      relations: ['category'],
    });
    if (!sub) throw new NotFoundException('Subscription not found');
    return this.toResponse(sub);
  }

  async create(userId: string, dto: CreateSubscriptionDto) {
    await this.categoriesService.findOne(dto.categoryId, userId);
    const sub = this.repo.create({
      userId,
      name: dto.name,
      amountMinor: dto.amountMinor,
      currency: dto.currency ?? 'KZT',
      nextPaymentDate: dto.nextPaymentDate,
      intervalDays: dto.intervalDays,
      categoryId: dto.categoryId,
    });
    const saved = await this.repo.save(sub);
    return this.findOne(saved.id, userId);
  }

  async update(id: string, userId: string, dto: UpdateSubscriptionDto) {
    const sub = await this.repo.findOne({ where: { id, userId }, relations: ['category'] });
    if (!sub) throw new NotFoundException('Subscription not found');
    if (dto.name !== undefined) sub.name = dto.name;
    if (dto.amountMinor !== undefined) sub.amountMinor = dto.amountMinor;
    if (dto.currency !== undefined) sub.currency = dto.currency;
    if (dto.nextPaymentDate !== undefined) sub.nextPaymentDate = dto.nextPaymentDate;
    if (dto.intervalDays !== undefined) sub.intervalDays = dto.intervalDays;
    if (dto.categoryId !== undefined) {
      await this.categoriesService.findOne(dto.categoryId, userId);
      sub.categoryId = dto.categoryId;
    }
    await this.repo.save(sub);
    return this.toResponse(sub);
  }

  async remove(id: string, userId: string): Promise<void> {
    const sub = await this.repo.findOne({ where: { id, userId } });
    if (!sub) throw new NotFoundException('Subscription not found');
    await this.repo.remove(sub);
  }

  async pay(id: string, userId: string) {
    const sub = await this.repo.findOne({ where: { id, userId }, relations: ['category'] });
    if (!sub) throw new NotFoundException('Subscription not found');

    // Move to the next unpaid cycle; catch up if user pays late.
    let next = sub.nextPaymentDate;
    while (isOnOrBeforeToday(next)) {
      next = addDays(next, sub.intervalDays);
    }
    sub.nextPaymentDate = next;
    await this.repo.save(sub);
    return this.toResponse(sub);
  }

  async summary(userId: string) {
    const list = await this.repo.find({ where: { userId } });
    const totalMonthlyMinor = list.reduce((sum, sub) => {
      const monthlyApprox = Math.round((sub.amountMinor * 30) / Math.max(1, sub.intervalDays));
      return sum + monthlyApprox;
    }, 0);
    const dueSoonCount = list.filter((sub) => subscriptionSeverity(sub.nextPaymentDate) !== 'good').length;
    const currency = list[0]?.currency ?? 'KZT';

    return {
      subscriptions_count: list.length,
      due_soon_count: dueSoonCount,
      estimated_monthly_total: toMoneyDto(totalMonthlyMinor, currency),
      estimated_monthly_total_minor: totalMonthlyMinor,
      currency,
    };
  }

  async reminders(userId: string, daysAhead: number = 14) {
    const list = await this.repo.find({
      where: { userId },
      relations: ['category'],
      order: { nextPaymentDate: 'ASC' },
    });

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const maxDays = Number.isInteger(daysAhead) ? Math.max(1, Math.min(90, daysAhead)) : 14;

    const items = list
      .map((sub) => {
        const next = new Date(sub.nextPaymentDate);
        next.setHours(0, 0, 0, 0);
        const daysLeft = Math.ceil((next.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        return { sub, daysLeft };
      })
      .filter((x) => x.daysLeft <= maxDays)
      .map(({ sub, daysLeft }) => ({
        ...this.toResponse(sub),
        days_until_payment: daysLeft,
      }));

    return { items, daysAhead: maxDays };
  }

  private toResponse(s: Subscription) {
    const amountMinor = typeof s.amountMinor === 'bigint' ? Number(s.amountMinor) : s.amountMinor;
    const money = toMoneyDto(amountMinor, s.currency);
    const severity = subscriptionSeverity(s.nextPaymentDate);
    const status = severity === 'risk' ? 'overdue' : severity === 'attention' ? 'soon' : 'stable';
    return {
      id: s.id,
      name: s.name,
      amount: money.formatted,
      amount_minor: amountMinor,
      currency: s.currency,
      nextPaymentDate: s.nextPaymentDate,
      intervalDays: s.intervalDays,
      categoryId: s.categoryId,
      category: s.category ? { id: s.category.id, name: s.category.name, type: s.category.type } : undefined,
      severity,
      status,
    };
  }
}

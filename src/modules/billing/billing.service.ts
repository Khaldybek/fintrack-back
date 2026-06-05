import {
  BadRequestException,
  GoneException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  CHECKOUT_SESSION_TTL_MINUTES,
  getPlanDefinition,
  isPaidPlanCode,
  type PaidPlanCode,
} from '../../config/plans.config';
import { toMoneyDto } from '../../common/money.util';
import { PlanService } from './plan.service';
import { BillingCheckoutSession } from './entities/billing-checkout-session.entity';
import { UserBillingSubscription } from './entities/user-billing-subscription.entity';
import { BillingInvoice } from './entities/billing-invoice.entity';

function todayYmd(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDaysYmd(dateYmd: string, days: number): string {
  const d = new Date(`${dateYmd}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function normalizePan(pan: string): string {
  return pan.replace(/\D/g, '');
}

function mockPaymentSucceeds(pan: string | undefined, decline: boolean | undefined): boolean {
  if (process.env.BILLING_MOCK_ALWAYS_SUCCEED === '1') return true;
  if (decline) return false;
  const digits = normalizePan(pan ?? '');
  if (!digits) return false;
  if (digits.startsWith('4000000000000002')) return false;
  return digits.startsWith('4242') || digits.length >= 13;
}

@Injectable()
export class BillingService {
  constructor(
    @InjectRepository(BillingCheckoutSession)
    private readonly checkoutRepo: Repository<BillingCheckoutSession>,
    @InjectRepository(UserBillingSubscription)
    private readonly subscriptionRepo: Repository<UserBillingSubscription>,
    @InjectRepository(BillingInvoice)
    private readonly invoiceRepo: Repository<BillingInvoice>,
    private readonly planService: PlanService,
  ) {}

  async createCheckout(userId: string, planCode: string) {
    if (!isPaidPlanCode(planCode)) {
      throw new BadRequestException('Invalid plan code');
    }
    const plan = getPlanDefinition(planCode);
    const expiresAt = new Date(Date.now() + CHECKOUT_SESSION_TTL_MINUTES * 60 * 1000);

    const session = this.checkoutRepo.create({
      userId,
      planCode,
      amountMinor: plan.amountMinor,
      currency: plan.currency,
      status: 'pending',
      expiresAt,
    });
    const saved = await this.checkoutRepo.save(session);

    return {
      sessionId: saved.id,
      planCode: saved.planCode,
      amountMinor: saved.amountMinor,
      amount: toMoneyDto(saved.amountMinor, saved.currency),
      currency: saved.currency,
      status: saved.status,
      expiresAt: saved.expiresAt.toISOString(),
    };
  }

  async confirmCheckout(
    userId: string,
    sessionId: string,
    body: { cardNumber?: string; cardBrand?: string; decline?: boolean },
  ) {
    const session = await this.checkoutRepo.findOne({
      where: { id: sessionId, userId },
    });
    if (!session) throw new NotFoundException('Checkout session not found');

    if (session.status === 'completed') {
      const sub = await this.planService.findSubscription(userId);
      return this.buildConfirmResponse(session, sub);
    }

    if (session.status === 'failed') {
      throw new HttpException(
        { code: 'PAYMENT_FAILED', message: 'Payment was declined. Start a new checkout.' },
        HttpStatus.PAYMENT_REQUIRED,
      );
    }

    if (session.status === 'expired' || session.expiresAt.getTime() < Date.now()) {
      if (session.status === 'pending') {
        session.status = 'expired';
        await this.checkoutRepo.save(session);
      }
      throw new GoneException('Checkout session expired');
    }

    const pan = normalizePan(body.cardNumber ?? '');
    const last4 = pan.slice(-4) || '4242';
    const brand = (body.cardBrand ?? 'visa').trim().toLowerCase();

    if (!mockPaymentSucceeds(body.cardNumber, body.decline)) {
      session.status = 'failed';
      await this.checkoutRepo.save(session);
      await this.invoiceRepo.save(
        this.invoiceRepo.create({
          userId,
          checkoutSessionId: session.id,
          planCode: session.planCode,
          amountMinor: session.amountMinor,
          currency: session.currency,
          status: 'failed',
          description: `FinTrack ${session.planCode} (declined)`,
          mockCardBrand: brand,
          mockCardLast4: last4,
          paidAt: null,
        }),
      );
      throw new HttpException(
        {
          code: 'PAYMENT_FAILED',
          message: 'Card was declined. Use test card 4242… or set BILLING_MOCK_ALWAYS_SUCCEED=1.',
        },
        HttpStatus.PAYMENT_REQUIRED,
      );
    }

    const plan = getPlanDefinition(session.planCode as PaidPlanCode);
    const periodStart = todayYmd();
    const periodEnd = addDaysYmd(periodStart, plan.intervalDays);

    let sub = await this.subscriptionRepo.findOne({ where: { userId } });
    if (sub) {
      sub.planCode = session.planCode;
      sub.status = 'active';
      sub.currentPeriodStart = periodStart;
      sub.currentPeriodEnd = periodEnd;
      sub.cancelAtPeriodEnd = false;
      sub.paymentMethodLast4 = last4;
      sub.paymentMethodBrand = brand;
    } else {
      sub = this.subscriptionRepo.create({
        userId,
        planCode: session.planCode,
        status: 'active',
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
        cancelAtPeriodEnd: false,
        paymentMethodLast4: last4,
        paymentMethodBrand: brand,
      });
    }
    await this.subscriptionRepo.save(sub!);

    session.status = 'completed';
    await this.checkoutRepo.save(session);

    await this.invoiceRepo.save(
      this.invoiceRepo.create({
        userId,
        checkoutSessionId: session.id,
        planCode: session.planCode,
        amountMinor: session.amountMinor,
        currency: session.currency,
        status: 'paid',
        description: `FinTrack ${plan.name}`,
        mockCardBrand: brand,
        mockCardLast4: last4,
        paidAt: new Date(),
      }),
    );

    return this.buildConfirmResponse(session, sub!);
  }

  private buildConfirmResponse(
    session: BillingCheckoutSession,
    sub: UserBillingSubscription | null,
  ) {
    return {
      sessionId: session.id,
      status: 'completed' as const,
      planCode: session.planCode,
      subscription: sub
        ? {
            planCode: sub.planCode,
            status: sub.status,
            currentPeriodStart: sub.currentPeriodStart,
            currentPeriodEnd: sub.currentPeriodEnd,
            cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
          }
        : null,
    };
  }

  async getSubscription(userId: string) {
    await this.planService.refreshSubscriptionStatus(userId);
    const sub = await this.planService.findSubscription(userId);
    const planView = await this.planService.getPlanResponse(userId);
    return {
      ...planView,
      subscription: sub
        ? {
            id: sub.id,
            planCode: sub.planCode,
            status: sub.status,
            currentPeriodStart: sub.currentPeriodStart,
            currentPeriodEnd: sub.currentPeriodEnd,
            cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
            paymentMethodLast4: sub.paymentMethodLast4,
            paymentMethodBrand: sub.paymentMethodBrand,
          }
        : null,
    };
  }

  async cancel(userId: string) {
    const sub = await this.subscriptionRepo.findOne({ where: { userId } });
    if (!sub || sub.status === 'canceled') {
      throw new BadRequestException('No active subscription to cancel');
    }
    sub.cancelAtPeriodEnd = true;
    await this.subscriptionRepo.save(sub);
    return {
      cancelAtPeriodEnd: true,
      currentPeriodEnd: sub.currentPeriodEnd,
      message: 'Subscription will end at the current period. Access remains until then.',
    };
  }

  async listInvoices(userId: string, limit = 20) {
    const safeLimit = Math.min(50, Math.max(1, limit));
    const rows = await this.invoiceRepo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: safeLimit,
    });
    return rows.map((inv) => ({
      id: inv.id,
      planCode: inv.planCode,
      amountMinor: inv.amountMinor,
      amount: toMoneyDto(inv.amountMinor, inv.currency),
      currency: inv.currency,
      status: inv.status,
      description: inv.description,
      mockCardBrand: inv.mockCardBrand,
      mockCardLast4: inv.mockCardLast4,
      paidAt: inv.paidAt?.toISOString() ?? null,
      createdAt: inv.createdAt.toISOString(),
    }));
  }

  async mockRenew(userId: string) {
    const allowed =
      process.env.NODE_ENV !== 'production' || process.env.BILLING_MOCK_RENEW === '1';
    if (!allowed) {
      throw new BadRequestException('Renew simulation is disabled in production');
    }

    const sub = await this.subscriptionRepo.findOne({ where: { userId } });
    if (!sub || sub.status === 'canceled') {
      throw new BadRequestException('No subscription to renew');
    }
    if (sub.cancelAtPeriodEnd) {
      throw new BadRequestException('Subscription is set to cancel at period end');
    }

    const plan = getPlanDefinition(sub.planCode as PaidPlanCode);
    const newStart = sub.currentPeriodEnd;
    const newEnd = addDaysYmd(newStart, plan.intervalDays);
    sub.currentPeriodStart = newStart;
    sub.currentPeriodEnd = newEnd;
    sub.status = 'active';
    await this.subscriptionRepo.save(sub);

    await this.invoiceRepo.save(
      this.invoiceRepo.create({
        userId,
        checkoutSessionId: null,
        planCode: sub.planCode,
        amountMinor: plan.amountMinor,
        currency: plan.currency,
        status: 'paid',
        description: `FinTrack ${plan.name} (auto-renew mock)`,
        mockCardBrand: sub.paymentMethodBrand,
        mockCardLast4: sub.paymentMethodLast4,
        paidAt: new Date(),
      }),
    );

    return {
      planCode: sub.planCode,
      currentPeriodStart: sub.currentPeriodStart,
      currentPeriodEnd: sub.currentPeriodEnd,
      status: sub.status,
    };
  }
}

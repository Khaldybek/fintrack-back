import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  BILLING_GRACE_DAYS,
  getPlanDefinition,
  listPublicPlans,
  type PlanCode,
  type PlanFeatureKey,
  type PlanLimits,
  PLAN_CATALOG,
} from '../../config/plans.config';
import { FeatureGatedException } from '../../common/errors/feature-gated.exception';
import { UserBillingSubscription } from './entities/user-billing-subscription.entity';

function todayYmd(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDaysYmd(dateYmd: string, days: number): string {
  const d = new Date(`${dateYmd}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function daysBetweenYmd(from: string, to: string): number {
  const a = new Date(`${from}T12:00:00.000Z`).getTime();
  const b = new Date(`${to}T12:00:00.000Z`).getTime();
  return Math.round((b - a) / (24 * 60 * 60 * 1000));
}

@Injectable()
export class PlanService {
  constructor(
    @InjectRepository(UserBillingSubscription)
    private readonly subscriptionRepo: Repository<UserBillingSubscription>,
  ) {}

  listPublicPlans() {
    return listPublicPlans().map((p) => ({
      code: p.code,
      name: p.name,
      description: p.description,
      amountMinor: p.amountMinor,
      currency: p.currency,
      intervalDays: p.intervalDays,
      features: p.features,
    }));
  }

  async findSubscription(userId: string): Promise<UserBillingSubscription | null> {
    return this.subscriptionRepo.findOne({ where: { userId } });
  }

  /** Sync status from dates; persist if changed. */
  async refreshSubscriptionStatus(userId: string): Promise<UserBillingSubscription | null> {
    const sub = await this.findSubscription(userId);
    if (!sub) return null;

    const today = todayYmd();
    let changed = false;

    if (sub.status === 'active' && sub.currentPeriodEnd < today) {
      sub.status = sub.cancelAtPeriodEnd ? 'canceled' : 'past_due';
      changed = true;
    }

    if (sub.status === 'past_due') {
      const graceEnd = addDaysYmd(sub.currentPeriodEnd, BILLING_GRACE_DAYS);
      if (today > graceEnd) {
        sub.status = 'canceled';
        changed = true;
      }
    }

    if (changed) {
      await this.subscriptionRepo.save(sub);
    }
    return sub;
  }

  async getEffectivePlanCode(userId: string): Promise<PlanCode> {
    const sub = await this.refreshSubscriptionStatus(userId);
    if (!sub) return 'free';

    if (sub.status === 'canceled' || sub.status === 'incomplete') {
      return 'free';
    }

    if (sub.status === 'active' || sub.status === 'past_due') {
      const code = sub.planCode as PlanCode;
      if (code in PLAN_CATALOG && code !== 'free') {
        return code;
      }
    }

    return 'free';
  }

  async getLimits(userId: string): Promise<PlanLimits> {
    const code = await this.getEffectivePlanCode(userId);
    return getPlanDefinition(code).limits;
  }

  async hasFeature(userId: string, feature: PlanFeatureKey): Promise<boolean> {
    const code = await this.getEffectivePlanCode(userId);
    return getPlanDefinition(code).features[feature];
  }

  async getPlanResponse(userId: string) {
    const sub = await this.refreshSubscriptionStatus(userId);
    const effectiveCode = await this.getEffectivePlanCode(userId);
    const def = getPlanDefinition(effectiveCode);

    return {
      plan: effectiveCode,
      limits: def.limits,
      features: def.features,
      subscription: sub
        ? {
            planCode: sub.planCode,
            status: sub.status,
            currentPeriodStart: sub.currentPeriodStart,
            currentPeriodEnd: sub.currentPeriodEnd,
            cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
            paymentMethodLast4: sub.paymentMethodLast4,
            daysUntilRenewal: Math.max(0, daysBetweenYmd(todayYmd(), sub.currentPeriodEnd)),
          }
        : null,
    };
  }

  async assertWithinLimit(
    userId: string,
    resource: 'accounts' | 'budgets' | 'goals',
    currentCount: number,
  ): Promise<void> {
    const limits = await this.getLimits(userId);
    const max = limits[resource];
    if (max === null) return;
    if (currentCount >= max) {
      const hints: Record<typeof resource, { code: string; hint: string }> = {
        accounts: {
          code: 'accounts_limit',
          hint: 'Upgrade to Pro to add more accounts.',
        },
        budgets: {
          code: 'budgets_limit',
          hint: 'Upgrade to Pro to add more budgets.',
        },
        goals: {
          code: 'goals_limit',
          hint: 'Upgrade to Pro to add more goals.',
        },
      };
      const { code, hint } = hints[resource];
      throw new FeatureGatedException(code, hint);
    }
  }

  async assertFeature(
    userId: string,
    feature: PlanFeatureKey,
    featureCode: string,
    upgradeHint: string,
  ): Promise<void> {
    const ok = await this.hasFeature(userId, feature);
    if (!ok) {
      throw new FeatureGatedException(featureCode, upgradeHint);
    }
  }
}

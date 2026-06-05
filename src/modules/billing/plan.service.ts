import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  BILLING_GRACE_DAYS,
  getPlanDefinition,
  listPublicPlans,
  type PlanCode,
  type PlanFeatureKey,
  type PlanFeatures,
  type PlanLimits,
  PLAN_CATALOG,
} from '../../config/plans.config';
import { FeatureGatedException } from '../../common/errors/feature-gated.exception';
import { UserBillingSubscription } from './entities/user-billing-subscription.entity';
import { HouseholdMember } from '../household/entities/household-member.entity';
import { Household } from '../household/entities/household.entity';

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

export type FamilyModeSource = 'subscription' | 'membership' | null;

@Injectable()
export class PlanService {
  constructor(
    @InjectRepository(UserBillingSubscription)
    private readonly subscriptionRepo: Repository<UserBillingSubscription>,
    @InjectRepository(HouseholdMember)
    private readonly householdMemberRepo: Repository<HouseholdMember>,
    @InjectRepository(Household)
    private readonly householdRepo: Repository<Household>,
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

  async getHouseholdMembership(userId: string): Promise<{
    id: string;
    name: string;
    role: string;
    isOwner: boolean;
    ownerId: string;
  } | null> {
    const membership = await this.householdMemberRepo.findOne({
      where: { userId },
      relations: ['household'],
    });
    if (!membership?.household) return null;
    return {
      id: membership.household.id,
      name: membership.household.name,
      role: membership.role,
      isOwner: membership.role === 'owner',
      ownerId: membership.household.ownerId,
    };
  }

  async hasEffectiveFeature(userId: string, feature: PlanFeatureKey): Promise<boolean> {
    if (feature === 'familyMode') {
      const subHas = await this.hasFeature(userId, 'familyMode');
      if (subHas) return true;
      const membership = await this.getHouseholdMembership(userId);
      return membership !== null;
    }
    return this.hasFeature(userId, feature);
  }

  private buildFeaturesEffective(
    subscriptionFeatures: PlanFeatures,
    inHousehold: boolean,
  ): { featuresEffective: PlanFeatures; familyModeSource: FamilyModeSource } {
    const viaSubscription = subscriptionFeatures.familyMode;
    const effectiveFamilyMode = viaSubscription || inHousehold;
    let familyModeSource: FamilyModeSource = null;
    if (effectiveFamilyMode) {
      familyModeSource = viaSubscription ? 'subscription' : 'membership';
    }
    return {
      featuresEffective: {
        ...subscriptionFeatures,
        familyMode: effectiveFamilyMode,
      },
      familyModeSource,
    };
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
    const householdMembership = await this.getHouseholdMembership(userId);
    const { featuresEffective, familyModeSource } = this.buildFeaturesEffective(
      def.features,
      householdMembership !== null,
    );

    let householdOwnerPlan: PlanCode | null = null;
    if (householdMembership) {
      householdOwnerPlan = await this.getEffectivePlanCode(householdMembership.ownerId);
    }

    return {
      plan: effectiveCode,
      limits: def.limits,
      features: def.features,
      featuresEffective,
      familyModeSource,
      household: householdMembership
        ? {
            id: householdMembership.id,
            name: householdMembership.name,
            role: householdMembership.role,
            isOwner: householdMembership.isOwner,
          }
        : null,
      householdOwnerPlan,
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

  async assertEffectiveFeature(
    userId: string,
    feature: PlanFeatureKey,
    featureCode: string,
    upgradeHint: string,
  ): Promise<void> {
    const ok = await this.hasEffectiveFeature(userId, feature);
    if (!ok) {
      throw new FeatureGatedException(featureCode, upgradeHint);
    }
  }
}

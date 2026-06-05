export type PlanCode =
  | 'free'
  | 'pro_monthly'
  | 'pro_yearly'
  | 'family_monthly'
  | 'family_yearly';

export type PaidPlanCode = Exclude<PlanCode, 'free'>;

export type PlanFeatureKey =
  | 'dashboardIndex'
  | 'forecast'
  | 'familyMode'
  | 'bankStatementImport';

export type PlanLimits = {
  accounts: number | null;
  budgets: number | null;
  goals: number | null;
};

export type PlanFeatures = Record<PlanFeatureKey, boolean>;

export type PlanDefinition = {
  code: PlanCode;
  name: string;
  description: string;
  amountMinor: number;
  currency: string;
  intervalDays: number;
  limits: PlanLimits;
  features: PlanFeatures;
  /** Shown on pricing page */
  public: boolean;
};

const FREE_LIMITS: PlanLimits = { accounts: 2, budgets: 1, goals: 1 };
const FREE_FEATURES: PlanFeatures = {
  dashboardIndex: false,
  forecast: true,
  familyMode: false,
  bankStatementImport: false,
};

const PRO_LIMITS: PlanLimits = { accounts: null, budgets: null, goals: null };
const PRO_FEATURES: PlanFeatures = {
  dashboardIndex: true,
  forecast: true,
  familyMode: false,
  bankStatementImport: true,
};

const FAMILY_FEATURES: PlanFeatures = {
  dashboardIndex: true,
  forecast: true,
  familyMode: true,
  bankStatementImport: true,
};

export const PLAN_CATALOG: Record<PlanCode, PlanDefinition> = {
  free: {
    code: 'free',
    name: 'Free',
    description: 'Базовый учёт финансов',
    amountMinor: 0,
    currency: 'KZT',
    intervalDays: 0,
    limits: FREE_LIMITS,
    features: FREE_FEATURES,
    public: false,
  },
  pro_monthly: {
    code: 'pro_monthly',
    name: 'Pro',
    description: 'Безлимитные счета, бюджеты и цели + индекс здоровья',
    amountMinor: 2990,
    currency: 'KZT',
    intervalDays: 30,
    limits: PRO_LIMITS,
    features: PRO_FEATURES,
    public: true,
  },
  pro_yearly: {
    code: 'pro_yearly',
    name: 'Pro (год)',
    description: 'Pro со скидкой при оплате за год',
    amountMinor: 29900,
    currency: 'KZT',
    intervalDays: 365,
    limits: PRO_LIMITS,
    features: PRO_FEATURES,
    public: true,
  },
  family_monthly: {
    code: 'family_monthly',
    name: 'Family',
    description: 'Pro + семейный режим и общий бюджет',
    amountMinor: 4990,
    currency: 'KZT',
    intervalDays: 30,
    limits: PRO_LIMITS,
    features: FAMILY_FEATURES,
    public: true,
  },
  family_yearly: {
    code: 'family_yearly',
    name: 'Family (год)',
    description: 'Family со скидкой при оплате за год',
    amountMinor: 49900,
    currency: 'KZT',
    intervalDays: 365,
    limits: PRO_LIMITS,
    features: FAMILY_FEATURES,
    public: true,
  },
};

export const PAID_PLAN_CODES: PaidPlanCode[] = [
  'pro_monthly',
  'pro_yearly',
  'family_monthly',
  'family_yearly',
];

export function isPaidPlanCode(code: string): code is PaidPlanCode {
  return (PAID_PLAN_CODES as string[]).includes(code);
}

export function getPlanDefinition(code: PlanCode): PlanDefinition {
  return PLAN_CATALOG[code];
}

export function listPublicPlans(): PlanDefinition[] {
  return Object.values(PLAN_CATALOG).filter((p) => p.public);
}

/** Days after period end before downgrade to free */
export const BILLING_GRACE_DAYS = 3;

export const CHECKOUT_SESSION_TTL_MINUTES = 15;

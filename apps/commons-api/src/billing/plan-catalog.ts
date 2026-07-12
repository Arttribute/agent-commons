/**
 * Subscription plans and their entitlements. Kept in code (not the DB) so plan
 * shape is versioned and reviewable; Stripe price IDs come from env so staging
 * uses test prices and production uses live prices.
 *
 * Tiers (decided 2026-07-11):
 *   free  $0    ~500 credits/mo   native agents + basic chat, NO computer use
 *   plus  $20   ~5,000 credits    computer use: starter + standard profiles
 *   pro   $50   ~14,000 credits   + performance profiles
 *   max   $200  ~60,000 credits   + gpu profiles
 *
 * Credits cover BOTH model tokens and per-minute computer use.
 */

export type PlanKey = 'free' | 'plus' | 'pro' | 'max';

export type ComputeProfile = 'starter' | 'standard' | 'performance' | 'gpu';

/** Model capability tiers from the model registry (frontier|standard|fast|local). */
export type ModelTier = 'frontier' | 'standard' | 'fast' | 'local';

export interface PlanEntitlements {
  computerUse: boolean;
  allowedProfiles: ComputeProfile[];
  maxConcurrentComputers: number;
  modelTiers: ModelTier[];
  maxConcurrentRuns: number;
}

export interface Plan {
  key: PlanKey;
  name: string;
  /** Monthly credit grant (also the free-tier lazy monthly grant). */
  monthlyCredits: number;
  /** Env var holding the Stripe price id for this plan (undefined for free). */
  stripePriceEnv?: string;
  entitlements: PlanEntitlements;
}

export const PLANS: Record<PlanKey, Plan> = {
  free: {
    key: 'free',
    name: 'Free',
    monthlyCredits: 500,
    entitlements: {
      computerUse: false,
      allowedProfiles: [],
      maxConcurrentComputers: 0,
      modelTiers: ['fast', 'standard', 'local'],
      maxConcurrentRuns: 2,
    },
  },
  plus: {
    key: 'plus',
    name: 'Plus',
    monthlyCredits: 5000,
    stripePriceEnv: 'STRIPE_PRICE_PLUS',
    entitlements: {
      computerUse: true,
      allowedProfiles: ['starter', 'standard'],
      maxConcurrentComputers: 1,
      modelTiers: ['fast', 'standard', 'local', 'frontier'],
      maxConcurrentRuns: 4,
    },
  },
  pro: {
    key: 'pro',
    name: 'Pro',
    monthlyCredits: 14000,
    stripePriceEnv: 'STRIPE_PRICE_PRO',
    entitlements: {
      computerUse: true,
      allowedProfiles: ['starter', 'standard', 'performance'],
      maxConcurrentComputers: 3,
      modelTiers: ['fast', 'standard', 'local', 'frontier'],
      maxConcurrentRuns: 8,
    },
  },
  max: {
    key: 'max',
    name: 'Max',
    monthlyCredits: 60000,
    stripePriceEnv: 'STRIPE_PRICE_MAX',
    entitlements: {
      computerUse: true,
      allowedProfiles: ['starter', 'standard', 'performance', 'gpu'],
      maxConcurrentComputers: 5,
      modelTiers: ['fast', 'standard', 'local', 'frontier'],
      maxConcurrentRuns: 16,
    },
  },
};

/** One-time credit top-up packs. `credits` is the amount granted on purchase. */
export interface TopupPack {
  key: string;
  name: string;
  credits: number;
  /** Env var holding the Stripe price id for this pack. */
  stripePriceEnv: string;
}

export const TOPUP_PACKS: Record<string, TopupPack> = {
  small: {
    key: 'small',
    name: '$10 credit pack',
    credits: 10000,
    stripePriceEnv: 'STRIPE_PRICE_TOPUP_SMALL',
  },
  medium: {
    key: 'medium',
    name: '$50 credit pack',
    credits: 52500, // ~5% bonus
    stripePriceEnv: 'STRIPE_PRICE_TOPUP_MEDIUM',
  },
  large: {
    key: 'large',
    name: '$100 credit pack',
    credits: 110000, // ~10% bonus
    stripePriceEnv: 'STRIPE_PRICE_TOPUP_LARGE',
  },
};

export const DEFAULT_PLAN: PlanKey = 'free';

export function planFromKey(key: string | null | undefined): Plan {
  if (key && key in PLANS) return PLANS[key as PlanKey];
  return PLANS[DEFAULT_PLAN];
}

/** Resolve a plan key from a Stripe price id via the env-configured price map. */
export function planKeyFromPriceId(priceId: string | null | undefined): PlanKey | null {
  if (!priceId) return null;
  for (const plan of Object.values(PLANS)) {
    if (plan.stripePriceEnv && process.env[plan.stripePriceEnv] === priceId) {
      return plan.key;
    }
  }
  return null;
}

/** Resolve a top-up pack from a Stripe price id. */
export function topupPackFromPriceId(
  priceId: string | null | undefined,
): TopupPack | null {
  if (!priceId) return null;
  for (const pack of Object.values(TOPUP_PACKS)) {
    if (process.env[pack.stripePriceEnv] === priceId) return pack;
  }
  return null;
}

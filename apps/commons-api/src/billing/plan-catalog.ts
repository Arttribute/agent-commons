/**
 * Subscription plans and their entitlements. Kept in code (not the DB) so plan
 * shape is versioned and reviewable; Stripe price IDs come from env so staging
 * uses test prices and production uses live prices.
 *
 * Product-facing tiers (reviewed 2026-07-16 against gross AWS cost):
 *   free     $0     daily earned credits, no persistent computer
 *   builder  $20    5,000 credits, 1 computer-enabled agent
 *   pro      $50   15,000 credits, 3 computer-enabled agents
 *   scale   $150   50,000 credits, 10 computer-enabled agents
 *
 * The stable internal keys remain plus/pro/max so existing Stripe subscriptions
 * continue to resolve. The UI only exposes Builder/Pro/Scale names.
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
  /** Number of agents allowed to retain a persistent computer/workspace. */
  maxComputerAgents: number;
  maxConcurrentComputers: number;
  modelTiers: ModelTier[];
  maxConcurrentRuns: number;
}

export interface Plan {
  key: PlanKey;
  name: string;
  /** Monthly credit grant (also the free-tier lazy monthly grant). */
  monthlyCredits: number;
  priceUsd: number;
  /** Env var holding the Stripe price id for this plan (undefined for free). */
  stripePriceEnv?: string;
  entitlements: PlanEntitlements;
}

export const PLANS: Record<PlanKey, Plan> = {
  free: {
    key: 'free',
    name: 'Free',
    monthlyCredits: 0,
    priceUsd: 0,
    entitlements: {
      computerUse: false,
      allowedProfiles: [],
      maxComputerAgents: 0,
      maxConcurrentComputers: 0,
      modelTiers: ['fast', 'standard', 'local'],
      maxConcurrentRuns: 2,
    },
  },
  plus: {
    key: 'plus',
    name: 'Builder',
    monthlyCredits: 5000,
    priceUsd: 20,
    stripePriceEnv: 'STRIPE_PRICE_PLUS',
    entitlements: {
      computerUse: true,
      allowedProfiles: ['starter', 'standard'],
      maxComputerAgents: 1,
      maxConcurrentComputers: 1,
      modelTiers: ['fast', 'standard', 'local', 'frontier'],
      maxConcurrentRuns: 4,
    },
  },
  pro: {
    key: 'pro',
    name: 'Pro',
    monthlyCredits: 15000,
    priceUsd: 50,
    stripePriceEnv: 'STRIPE_PRICE_PRO',
    entitlements: {
      computerUse: true,
      allowedProfiles: ['starter', 'standard', 'performance'],
      maxComputerAgents: 3,
      maxConcurrentComputers: 2,
      modelTiers: ['fast', 'standard', 'local', 'frontier'],
      maxConcurrentRuns: 8,
    },
  },
  max: {
    key: 'max',
    name: 'Scale',
    monthlyCredits: 50000,
    priceUsd: 150,
    stripePriceEnv: 'STRIPE_PRICE_MAX',
    entitlements: {
      computerUse: true,
      allowedProfiles: ['starter', 'standard', 'performance', 'gpu'],
      maxComputerAgents: 10,
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
  priceUsd: number;
  credits: number;
  /** Env var holding the Stripe price id for this pack. */
  stripePriceEnv: string;
}

export const TOPUP_PACKS: Record<string, TopupPack> = {
  small: {
    key: 'small',
    name: '$10 credit pack',
    priceUsd: 10,
    credits: 4000,
    stripePriceEnv: 'STRIPE_PRICE_TOPUP_SMALL',
  },
  medium: {
    key: 'medium',
    name: '$50 credit pack',
    priceUsd: 50,
    credits: 22000, // 10% volume bonus
    stripePriceEnv: 'STRIPE_PRICE_TOPUP_MEDIUM',
  },
  large: {
    key: 'large',
    name: '$100 credit pack',
    priceUsd: 100,
    credits: 48000, // 20% volume bonus
    stripePriceEnv: 'STRIPE_PRICE_TOPUP_LARGE',
  },
};

export const DEFAULT_PLAN: PlanKey = 'free';

export function planFromKey(key: string | null | undefined): Plan {
  if (key && key in PLANS) return PLANS[key as PlanKey];
  return PLANS[DEFAULT_PLAN];
}

/** Resolve a plan key from a Stripe price id via the env-configured price map. */
export function planKeyFromPriceId(
  priceId: string | null | undefined,
): PlanKey | null {
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

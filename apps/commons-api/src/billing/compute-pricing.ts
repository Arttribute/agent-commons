import { ComputeProfile } from './plan-catalog';

/**
 * Credits charged per minute of computer uptime, by resource profile.
 *
 * Anchoring: raw sandbox compute runs ~$0.05/vCPU-hr (e2b/Daytona 2026). A
 * standard 2-vCPU box is ~$0.10-0.12/hr raw; at a ~4x margin that's ~$0.42/hr =
 * 7 credits/min at 1000 credits/USD. Tune with scripts/analyze-usage-margins.mjs
 * and the COMPUTE_CREDITS_PER_MIN env override (JSON) after observing real cost.
 */
const DEFAULT_CREDITS_PER_MIN: Record<ComputeProfile, number> = {
  starter: 2,
  standard: 7,
  performance: 14,
  gpu: 70,
};

let cached: Record<ComputeProfile, number> | null = null;

export function creditsPerMinute(profile: string): number {
  if (!cached) {
    cached = { ...DEFAULT_CREDITS_PER_MIN };
    const override = process.env.COMPUTE_CREDITS_PER_MIN;
    if (override) {
      try {
        Object.assign(cached, JSON.parse(override));
      } catch {
        // ignore malformed override; fall back to defaults
      }
    }
  }
  return cached[profile as ComputeProfile] ?? DEFAULT_CREDITS_PER_MIN.standard;
}

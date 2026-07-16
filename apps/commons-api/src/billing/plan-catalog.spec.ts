import { PLANS, TOPUP_PACKS, planFromKey } from './plan-catalog';

describe('billing catalog', () => {
  it('keeps agent creation unlimited while computer ownership is plan-limited', () => {
    expect(PLANS.free.entitlements.maxComputerAgents).toBe(0);
    expect(PLANS.plus.entitlements.maxComputerAgents).toBe(1);
    expect(PLANS.pro.entitlements.maxComputerAgents).toBe(3);
    expect(PLANS.max.entitlements.maxComputerAgents).toBe(10);
  });

  it('has a simple $20/$50/$150 paid ladder', () => {
    expect([
      PLANS.plus.priceUsd,
      PLANS.pro.priceUsd,
      PLANS.max.priceUsd,
    ]).toEqual([20, 50, 150]);
  });

  it('keeps top-ups less generous than subscription credit bundles', () => {
    expect([
      TOPUP_PACKS.small.priceUsd,
      TOPUP_PACKS.medium.priceUsd,
      TOPUP_PACKS.large.priceUsd,
    ]).toEqual([10, 50, 100]);
    expect(TOPUP_PACKS.small.credits).toBe(4000);
    expect(TOPUP_PACKS.medium.credits).toBe(22000);
    expect(TOPUP_PACKS.large.credits).toBe(48000);
  });

  it('falls back safely to Free for unknown legacy values', () => {
    expect(planFromKey('unknown')).toBe(PLANS.free);
  });
});

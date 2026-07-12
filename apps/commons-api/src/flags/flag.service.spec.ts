import { FlagService } from './flag.service';

function makeDb(flags: any[], overrides: any[] = []) {
  return {
    query: {
      featureFlag: { findMany: jest.fn().mockResolvedValue(flags) },
      flagOverride: {
        findMany: jest.fn().mockResolvedValue(overrides),
      },
    },
    insert: jest.fn().mockReturnValue({
      values: jest.fn().mockReturnValue({
        onConflictDoNothing: jest.fn().mockResolvedValue(undefined),
        onConflictDoUpdate: jest.fn().mockResolvedValue(undefined),
      }),
    }),
  } as any;
}

const entitlements = { getPlan: jest.fn().mockResolvedValue({ key: 'free' }) } as any;

describe('FlagService', () => {
  it('disabled flag evaluates false', async () => {
    const svc = new FlagService(
      makeDb([{ flagKey: 'f', enabled: false, flagType: 'boolean', rolloutPercentage: 100 }]),
      entitlements,
    );
    expect((await svc.evaluate('f', { principalId: 'u1' })).enabled).toBe(false);
  });

  it('100% rollout evaluates true for everyone', async () => {
    const svc = new FlagService(
      makeDb([{ flagKey: 'f', enabled: true, flagType: 'boolean', rolloutPercentage: 100 }]),
      entitlements,
    );
    for (const u of ['a', 'b', 'c', 'd']) {
      expect((await svc.evaluate('f', { principalId: u })).enabled).toBe(true);
    }
  });

  it('0% rollout evaluates false for everyone', async () => {
    const svc = new FlagService(
      makeDb([{ flagKey: 'f', enabled: true, flagType: 'boolean', rolloutPercentage: 0 }]),
      entitlements,
    );
    for (const u of ['a', 'b', 'c', 'd']) {
      expect((await svc.evaluate('f', { principalId: u })).enabled).toBe(false);
    }
  });

  it('is deterministic — same principal always gets the same result', async () => {
    const flag = { flagKey: 'f', enabled: true, flagType: 'boolean', rolloutPercentage: 50, salt: 's' };
    const svc = new FlagService(makeDb([flag]), entitlements);
    const first = (await svc.evaluate('f', { principalId: 'stable-user' })).enabled;
    for (let i = 0; i < 5; i++) {
      expect((await svc.evaluate('f', { principalId: 'stable-user' })).enabled).toBe(first);
    }
  });

  it('roughly honors the rollout percentage across many users', async () => {
    const flag = { flagKey: 'f', enabled: true, flagType: 'boolean', rolloutPercentage: 30, salt: 's' };
    const svc = new FlagService(makeDb([flag]), entitlements);
    let on = 0;
    const N = 2000;
    for (let i = 0; i < N; i++) {
      if ((await svc.evaluate('f', { principalId: `user-${i}` })).enabled) on++;
    }
    const ratio = on / N;
    expect(ratio).toBeGreaterThan(0.25);
    expect(ratio).toBeLessThan(0.35);
  });

  it('assigns stable weighted variants', async () => {
    const flag = {
      flagKey: 'f',
      enabled: true,
      flagType: 'multivariate',
      rolloutPercentage: 100,
      salt: 's',
      variants: [
        { key: 'control', weight: 50 },
        { key: 'treatment', weight: 50 },
      ],
    };
    const svc = new FlagService(makeDb([flag]), entitlements);
    const v1 = (await svc.evaluate('f', { principalId: 'u9' })).variant;
    const v2 = (await svc.evaluate('f', { principalId: 'u9' })).variant;
    expect(v1).toBe(v2);
    expect(['control', 'treatment']).toContain(v1);
  });

  it('deny override forces off even at 100%', async () => {
    const svc = new FlagService(
      makeDb(
        [{ flagKey: 'f', enabled: true, flagType: 'boolean', rolloutPercentage: 100 }],
        [{ flagKey: 'f', subjectType: 'user', subjectId: 'u1', enabled: false }],
      ),
      entitlements,
    );
    expect((await svc.evaluate('f', { principalId: 'u1' })).enabled).toBe(false);
  });
});

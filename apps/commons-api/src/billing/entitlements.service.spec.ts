import { EntitlementsService } from './entitlements.service';
import { PLANS } from './plan-catalog';

function makeDb(subscriptions: any[]) {
  return {
    query: {
      subscription: {
        findMany: jest.fn().mockResolvedValue(subscriptions),
      },
    },
  } as any;
}

describe('EntitlementsService', () => {
  it('defaults to the free plan when there is no subscription', async () => {
    const svc = new EntitlementsService(makeDb([]));
    const plan = await svc.getPlan('user-1');
    expect(plan.key).toBe('free');
    expect(plan.entitlements.computerUse).toBe(false);
  });

  it('resolves an active subscription to its plan', async () => {
    const svc = new EntitlementsService(
      makeDb([{ planKey: 'pro', status: 'active', updatedAt: new Date() }]),
    );
    const plan = await svc.getPlan('user-1');
    expect(plan.key).toBe('pro');
    expect(plan.entitlements.allowedProfiles).toContain('performance');
  });

  it('keeps access during past_due before the grace window ends', async () => {
    const svc = new EntitlementsService(
      makeDb([
        {
          planKey: 'plus',
          status: 'past_due',
          currentPeriodEnd: new Date(), // just now, within grace
          updatedAt: new Date(),
        },
      ]),
    );
    const plan = await svc.getPlan('user-1');
    expect(plan.key).toBe('plus');
  });

  it('drops to free once past_due exceeds the grace window', async () => {
    const old = new Date(Date.now() - 30 * 86400_000);
    const svc = new EntitlementsService(
      makeDb([
        {
          planKey: 'plus',
          status: 'past_due',
          currentPeriodEnd: old,
          updatedAt: new Date(),
        },
      ]),
    );
    const plan = await svc.getPlan('user-1');
    expect(plan.key).toBe('free');
  });

  it('prefers an active subscription over a past_due one', async () => {
    const svc = new EntitlementsService(
      makeDb([
        { planKey: 'plus', status: 'past_due', updatedAt: new Date() },
        { planKey: 'max', status: 'active', updatedAt: new Date() },
      ]),
    );
    const plan = await svc.getPlan('user-1');
    expect(plan.key).toBe('max');
  });

  it('caches within the TTL (second call does not hit the db)', async () => {
    const db = makeDb([{ planKey: 'pro', status: 'active', updatedAt: new Date() }]);
    const svc = new EntitlementsService(db);
    await svc.getPlan('user-1');
    await svc.getPlan('user-1');
    expect(db.query.subscription.findMany).toHaveBeenCalledTimes(1);
  });

  it('exposes the expected plan set', () => {
    expect(Object.keys(PLANS)).toEqual(['free', 'plus', 'pro', 'max']);
  });
});

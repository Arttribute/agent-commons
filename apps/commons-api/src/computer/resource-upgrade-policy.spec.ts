import {
  evaluateResourceUpgrade,
  resourceUpgradePolicy,
} from './resource-upgrade-policy';

describe('agent computer resource permission boundary', () => {
  it('requires owner approval for GPU and larger RAM by default', () => {
    const policy = resourceUpgradePolicy();
    expect(evaluateResourceUpgrade(policy, 'gpu').automatic).toBe(false);
    expect(evaluateResourceUpgrade(policy, 'performance').automatic).toBe(
      false,
    );
  });
  it('does not grant GPU access through automatic CPU permission', () => {
    const policy = resourceUpgradePolicy({ cpuAccess: 'auto' });
    expect(evaluateResourceUpgrade(policy, 'performance').automatic).toBe(true);
    expect(evaluateResourceUpgrade(policy, 'gpu').automatic).toBe(false);
  });
  it('honors explicit GPU permission, CPU ceilings and task duration caps', () => {
    const policy = resourceUpgradePolicy({
      cpuAccess: 'auto',
      gpuAccess: 'auto',
      maxAutomaticCpuProfile: 'standard',
      maxMinutes: 15,
    });
    expect(evaluateResourceUpgrade(policy, 'gpu', 10).automatic).toBe(true);
    expect(evaluateResourceUpgrade(policy, 'standard', 10).automatic).toBe(
      true,
    );
    expect(evaluateResourceUpgrade(policy, 'performance', 10).automatic).toBe(
      false,
    );
    expect(() => evaluateResourceUpgrade(policy, 'gpu', 16)).toThrow(
      /15 minutes/,
    );
    expect(() => evaluateResourceUpgrade(policy, 'gpu', NaN)).toThrow();
  });
  it('rejects disabled and invalid resource access', () => {
    expect(() =>
      evaluateResourceUpgrade(
        resourceUpgradePolicy({ gpuAccess: 'off' }),
        'gpu',
      ),
    ).toThrow(/disabled/);
    expect(() => resourceUpgradePolicy({ gpuAccess: 'yes' })).toThrow();
    expect(() => resourceUpgradePolicy({ maxMinutes: 1000 })).toThrow();
    expect(() =>
      evaluateResourceUpgrade(resourceUpgradePolicy(), 'unlimited'),
    ).toThrow();
  });
});

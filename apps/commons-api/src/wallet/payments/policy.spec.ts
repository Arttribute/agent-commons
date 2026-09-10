import {
  assertRequirement,
  validateSpendingPolicy,
  positiveUnits,
  type SpendingPolicy,
} from './policy';
const policy: SpendingPolicy = {
  network: 'eip155:84532',
  asset: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
  payTo: '0x1111111111111111111111111111111111111111',
  origin: 'https://payments.example.com',
  maxPaymentUnits: '1000',
};
const requirement = {
  scheme: 'exact',
  network: policy.network,
  asset: policy.asset,
  payTo: policy.payTo,
  amount: '100',
  maxTimeoutSeconds: 60,
};
describe('owner spending policy', () => {
  it('accepts canonical Celo Sepolia USDC while rejecting legacy and mainnet Celo grants', () => {
    const celo: SpendingPolicy = {
      ...policy,
      network: 'eip155:11142220',
      asset: '0x01C5C0122039549AD1493B8220cABEdD739BC44E',
    };
    expect(validateSpendingPolicy(celo)).toEqual(celo);
    expect(() =>
      assertRequirement(
        celo,
        { ...requirement, network: celo.network, asset: celo.asset },
        celo.origin,
      ),
    ).not.toThrow();
    for (const network of ['eip155:44787', 'eip155:42220'])
      expect(() =>
        validateSpendingPolicy({ ...celo, network } as SpendingPolicy),
      ).toThrow();
    expect(() =>
      validateSpendingPolicy({ ...celo, asset: policy.asset }),
    ).toThrow();
  });
  it('accepts only exact approved testnet USDC requirements', () =>
    expect(() =>
      assertRequirement(policy, requirement, policy.origin + '/v1/analysis'),
    ).not.toThrow());
  it.each([
    { network: 'eip155:8453' },
    { payTo: '0x2222222222222222222222222222222222222222' },
    { asset: '0x0000000000000000000000000000000000000000' },
    { amount: '1001' },
    { amount: '-1' },
    { amount: '1e5' },
    { scheme: 'upto' },
    { maxTimeoutSeconds: 3600 },
  ])('rejects adversarial quote %j', (change) =>
    expect(() =>
      assertRequirement(policy, { ...requirement, ...change }, policy.origin),
    ).toThrow(),
  );
  it('rejects redirected origins and credential URLs', () => {
    expect(() =>
      assertRequirement(policy, requirement, 'https://other.example.com'),
    ).toThrow();
    expect(() =>
      assertRequirement(
        policy,
        requirement,
        'https://secret@payments.example.com',
      ),
    ).toThrow();
  });
  it('validates policy before storing it', () => {
    expect(validateSpendingPolicy(policy)).toEqual(policy);
    expect(() =>
      validateSpendingPolicy({ ...policy, origin: 'http://localhost' }),
    ).toThrow();
    expect(() =>
      validateSpendingPolicy({ ...policy, maxPaymentUnits: '0' }),
    ).toThrow();
  });
  it('never rounds fractional atomic amounts', () => {
    expect(() => positiveUnits('1.1')).toThrow();
    expect(positiveUnits('1000000000000000000000000')).toBe(
      1000000000000000000000000n,
    );
  });
});

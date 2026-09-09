import { WalletController } from '../wallet.controller';
const agentId = 'agent-one';
function setup() {
  const wallets = {
      assertAgentOwnership: jest.fn().mockResolvedValue(undefined),
      arcadeDeposit: jest.fn().mockResolvedValue({ transaction: 'tx' }),
      arcadeAction: jest.fn(),
      x402Fetch: jest.fn(),
    },
    sessions = { create: jest.fn() };
  return {
    wallets,
    sessions,
    controller: new WalletController(wallets as any, sessions as any),
  };
}
const req = (
  principalType: string,
  principalId: string,
  scopes: string[] = [],
) =>
  ({ headers: {}, principal: { principalType, principalId, scopes } }) as any;
it('blocks direct transfer as an alternative to a grant', async () => {
  const t = setup();
  await expect(
    t.controller.transfer('wallet', {} as any, req('agent', agentId)),
  ).rejects.toThrow('Direct transfers require');
  await expect(
    t.controller.transfer(
      'wallet',
      {} as any,
      req('service', 'editor', ['agents:write']),
    ),
  ).rejects.toThrow('Direct transfers require');
});
describe('payment authority differs from game edit permission', () => {
  it('does not let an agent mint its own budget', async () => {
    const t = setup();
    await expect(
      t.controller.createPaymentSession(
        agentId,
        {} as any,
        req('agent', agentId),
      ),
    ).rejects.toThrow('Only an authenticated owner');
    expect(t.sessions.create).not.toHaveBeenCalled();
  });
  it('requires exact owner authorization for creating a budget', async () => {
    const t = setup();
    await t.controller.createPaymentSession(
      agentId,
      {} as any,
      req('user', 'owner'),
    );
    expect(t.wallets.assertAgentOwnership).toHaveBeenCalledWith(
      agentId,
      'owner',
    );
    expect(t.sessions.create).toHaveBeenCalled();
  });
  it('lets only the named agent execute its existing grant', async () => {
    const t = setup();
    await t.controller.arcadeDeposit(agentId, {} as any, req('agent', agentId));
    expect(t.wallets.arcadeDeposit).toHaveBeenCalled();
    await expect(
      t.controller.arcadeDeposit(
        agentId,
        {} as any,
        req('agent', 'other-agent'),
      ),
    ).rejects.toThrow();
  });
  it('does not turn agents:write into wallet-spending authority', async () => {
    const t = setup();
    await expect(
      t.controller.arcadeDeposit(
        agentId,
        {} as any,
        req('service', 'editor', ['agents:write']),
      ),
    ).rejects.toThrow();
    expect(t.wallets.arcadeDeposit).not.toHaveBeenCalled();
  });
});

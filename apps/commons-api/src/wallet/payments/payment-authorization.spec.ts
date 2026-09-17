import { WalletController } from '../wallet.controller';
const agentId = 'agent-one';
function setup() {
  const wallets = {
      assertAgentOwnership: jest.fn().mockResolvedValue(undefined),
      arcadeDeposit: jest.fn().mockResolvedValue({ transaction: 'tx' }),
      arcadeAction: jest.fn(),
      arcadeAutoplay: jest.fn().mockResolvedValue({ autoplay: ['0'] }),
      x402Fetch: jest.fn(),
    },
    sessions = { create: jest.fn() },
    allowances = {
      create: jest.fn().mockResolvedValue({ id: 'allowance' }),
      revoke: jest.fn().mockResolvedValue({ revoked: true }),
    };
  return {
    wallets,
    sessions,
    allowances,
    controller: new WalletController(
      wallets as any,
      sessions as any,
      allowances as any,
    ),
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
  it('lets a named agent start autonomous play but rejects another agent or editor', async () => {
    const t = setup();
    await t.controller.arcadeAutoplay(
      agentId,
      {} as any,
      req('agent', agentId),
    );
    expect(t.wallets.arcadeAutoplay).toHaveBeenCalledTimes(1);
    await expect(
      t.controller.arcadeAutoplay(agentId, {} as any, req('agent', 'other')),
    ).rejects.toThrow();
    await expect(
      t.controller.arcadeAutoplay(
        agentId,
        {} as any,
        req('service', 'editor', ['agents:write']),
      ),
    ).rejects.toThrow();
    expect(t.wallets.arcadeAutoplay).toHaveBeenCalledTimes(1);
  });
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

describe('transfer allowances are owner-set', () => {
  const dto = {
    walletId: 'wallet',
    chainId: '84532',
    budget: '10',
    maxPerTransfer: '1',
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
  };
  it('rejects agents and delegated services, even with an owner header', async () => {
    const t = setup();
    const delegated = {
      ...req('service', 'app', ['agents:write']),
      headers: { 'x-owner-id': 'owner' },
    };
    for (const caller of [req('agent', agentId), delegated]) {
      await expect(
        t.controller.createTransferAllowance(agentId, dto, caller),
      ).rejects.toThrow('Only the agent owner');
      await expect(
        t.controller.revokeTransferAllowance(agentId, 'id', caller),
      ).rejects.toThrow('Only the agent owner');
    }
    expect(t.allowances.create).not.toHaveBeenCalled();
    expect(t.allowances.revoke).not.toHaveBeenCalled();
  });
  it('lets the signed-in owner create one', async () => {
    const t = setup();
    await t.controller.createTransferAllowance(
      agentId,
      dto,
      req('user', 'owner'),
    );
    expect(t.wallets.assertAgentOwnership).toHaveBeenCalledWith(
      agentId,
      'owner',
    );
    expect(t.allowances.create).toHaveBeenCalledWith(agentId, 'owner', dto);
  });
});

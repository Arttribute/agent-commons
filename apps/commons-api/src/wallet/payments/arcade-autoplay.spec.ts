import { WalletService } from '../wallet.service';
import { safeFetch } from '~/utils/safe-fetch';
import { verifyMessage } from 'viem';

jest.mock('~/utils/safe-fetch', () => ({ safeFetch: jest.fn() }));
const fetchMock = safeFetch as jest.Mock;
const key = `0x${'07'.repeat(32)}`;
const contract = `0x${'2'.repeat(40)}`;
const pool = `0x${'3'.repeat(64)}`;
function fixture() {
  const session = {
    wallet_id: 'wallet-one',
    expires_at: new Date(Date.now() + 60000),
    policy: {
      origin: 'https://payments.test',
      payTo: contract,
      arcade: {
        matchId: 'mat_game',
        poolId: pool,
        allowedOperations: ['stake'],
      },
    },
  };
  const service = {
    paymentSessions: { load: jest.fn().mockResolvedValue(session) },
    db: {
      query: {
        agentWallet: {
          findFirst: jest.fn().mockResolvedValue({
            encryptedPrivateKey: 'encrypted',
            walletType: 'eoa',
            provider: 'commons',
          }),
        },
      },
    },
    decryptKey: jest.fn().mockReturnValue(key),
  };
  const input = {
    paymentSessionId: 'grant-one',
    runtimeSessionId: 'runtime-one',
    enabled: true,
  };
  return {
    session,
    service,
    input,
    run: () =>
      WalletService.prototype.arcadeAutoplay.call(
        service as never,
        'agent-one',
        input,
      ),
  };
}
beforeEach(() => fetchMock.mockReset());
it('signs only a grant-bound game command with the agent wallet and caps its expiry', async () => {
  const f = fixture();
  fetchMock.mockResolvedValueOnce({
    ok: true,
    json: async () => ({
      pool,
      deployment: { contract },
      settlementDeadline: Math.floor(Date.now() / 1000) + 120,
    }),
  });
  fetchMock.mockResolvedValueOnce({
    ok: true,
    json: async () => ({ autoplay: ['0'] }),
  });
  expect(await f.run()).toEqual({ autoplay: ['0'] });
  expect(f.service.paymentSessions.load).toHaveBeenCalledWith(
    'agent-one',
    'grant-one',
    'runtime-one',
  );
  const [url, request] = fetchMock.mock.calls[1];
  expect(url).toBe(
    'https://payments.test/v1/economy/matches/mat_game/autoplay',
  );
  const { body, auth } = JSON.parse(request.body);
  expect(body).toEqual({
    enabled: true,
    expiresAt: f.session.expires_at.getTime(),
  });
  expect(
    await verifyMessage({
      address: auth.address,
      signature: auth.signature,
      message: JSON.stringify({
        domain: 'https://payments.test',
        matchId: 'mat_game',
        operation: 'autoplay',
        body,
        expiresAt: auth.expiresAt,
      }),
    }),
  ).toBe(true);
  expect(request.body).not.toContain(key);
});
it('rejects a different pool before signing or sending a command', async () => {
  const f = fixture();
  fetchMock.mockResolvedValueOnce({
    ok: true,
    json: async () => ({
      pool: `0x${'4'.repeat(64)}`,
      deployment: { contract },
    }),
  });
  await expect(f.run()).rejects.toThrow('approved budget');
  expect(f.service.decryptKey).toHaveBeenCalledTimes(1);
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
it('does not turn a spectator grant or a revoked grant into a player controller', async () => {
  const f = fixture();
  f.session.policy.arcade.allowedOperations = ['bet'];
  await expect(f.run()).rejects.toThrow('player budget');
  f.service.paymentSessions.load.mockRejectedValueOnce(
    new Error('Grant revoked'),
  );
  await expect(f.run()).rejects.toThrow('revoked');
  expect(fetchMock).not.toHaveBeenCalled();
});

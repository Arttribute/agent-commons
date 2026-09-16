import { payArcadeDeposit } from './arcade-payments';
import { payX402Challenge } from './x402-client';
import { safeFetch } from '~/utils/safe-fetch';
import {
  createPublicClient,
  createWalletClient,
  keccak256,
  toBytes,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
jest.mock('viem', () => ({
  ...jest.requireActual('viem'),
  createPublicClient: jest.fn(),
  createWalletClient: jest.fn(),
}));
jest.mock('./x402-client', () => ({ payX402Challenge: jest.fn() }));
jest.mock('~/utils/safe-fetch', () => ({ safeFetch: jest.fn() }));
const fetchMock = safeFetch as jest.Mock;
const payMock = payX402Challenge as jest.Mock;
beforeEach(() => {
  fetchMock.mockReset();
  payMock.mockReset();
  // Without an advertised gasless entry, deposits use the onchain path.
  fetchMock.mockResolvedValue(new Response('{}', { status: 404 }));
});
const key = `0x${'01'.repeat(32)}` as const;
const address = privateKeyToAccount(key).address;
const zero = `0x${'0'.repeat(40)}`;
function setup(amount = 100n, recipient = zero) {
  const pool = {
    status: 1,
    terms: {
      stake: amount,
      token: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
      fundingDeadline: BigInt(Math.floor(Date.now() / 1000) + 600),
    },
  };
  const values: Record<string, unknown> = {
    getMatch: pool,
    balanceOf: amount,
    recipient,
    openSeats: true,
    registeredSeat: true,
    seated: false,
  };
  const reader = {
    readContract: jest.fn(async ({ functionName }) => values[functionName]),
    call: jest.fn(),
    waitForTransactionReceipt: jest
      .fn()
      .mockResolvedValue({ status: 'success' }),
  };
  const wallet = {
    writeContract: jest.fn().mockResolvedValue('0xapproval'),
    sendTransaction: jest.fn().mockResolvedValue('0xentry'),
  };
  (createPublicClient as jest.Mock).mockReturnValue(reader);
  (createWalletClient as jest.Mock).mockReturnValue(wallet);
  const sessions = {
    reserve: jest.fn().mockResolvedValue('attempt'),
    reserveSeatJoin: jest.fn().mockResolvedValue('attempt'),
    finish: jest.fn(),
  };
  const session = {
    id: 'session',
    policy: {
      network: 'eip155:84532',
      payTo: escrow,
      origin: 'https://payments.test',
      maxPaymentUnits: '100',
      arcade: {
        poolId: `0x${'1'.repeat(64)}`,
        seatId: keccak256(toBytes('sea_player_2')),
        matchId: 'mat_test',
        allowedOperations: ['stake'],
      },
    },
  };
  const pay = () =>
    payArcadeDeposit(session as any, sessions as any, key, {
      operation: 'stake',
      idempotencyKey: 'join-test',
    });
  return { pay, values, reader, wallet, sessions, session };
}
const escrow = `0x${'e5'.repeat(20)}`;
/** The payment service advertises gasless entry for the granted pool. */
function advertise(
  method: 'x402' | 'signed-command',
  pool = `0x${'1'.repeat(64)}`,
) {
  const posts: { url: string; body: any }[] = [];
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
    if (!init?.method)
      return Response.json({
        pool,
        entry: {
          path: '/v1/economy/matches/mat_test/entry',
          method,
          payTo: escrow,
        },
      });
    posts.push({ url, body: JSON.parse(String(init.body)) });
    return method === 'x402'
      ? new Response('{}', { status: 402 })
      : Response.json({ seat: 2, transaction: '0xrelayed' });
  });
  return posts;
}
it('joins an open seat with exactly the approved entry and records the confirmed receipt', async () => {
  const t = setup();
  const paid = await t.pay();
  expect(t.sessions.reserve).toHaveBeenCalledWith(
    expect.anything(),
    'join-test',
    '100',
    'https://payments.test/mat_test/stake',
  );
  expect(t.wallet.writeContract).toHaveBeenCalledWith(
    expect.objectContaining({ functionName: 'approve', args: [escrow, 100n] }),
  );
  expect(paid).toMatchObject({ transaction: '0xentry', amountUnits: '100' });
  expect(t.sessions.finish).toHaveBeenCalledWith(
    'attempt',
    'settled',
    expect.objectContaining({ transaction: '0xentry' }),
  );
});
it.each(['openSeats', 'registeredSeat', 'seated'])(
  'rejects unavailable seats before signing (%s)',
  async (field) => {
    const t = setup();
    t.values[field] = field === 'seated';
    await expect(t.pay()).rejects.toThrow('not available');
    expect(t.wallet.writeContract).not.toHaveBeenCalled();
    expect(t.sessions.reserve).not.toHaveBeenCalled();
  },
);
it('retains legacy seat ownership checks and the per-payment cap', async () => {
  const owned = setup(100n, address);
  await owned.pay();
  expect(owned.reader.readContract).not.toHaveBeenCalledWith(
    expect.objectContaining({ functionName: 'openSeats' }),
  );
  const other = setup(100n, `0x${'3'.repeat(40)}`);
  await expect(other.pay()).rejects.toThrow('does not own');
  const over = setup(101n);
  await expect(over.pay()).rejects.toThrow('per-payment');
  expect(over.wallet.sendTransaction).not.toHaveBeenCalled();
});
it('records sponsored admission without a token approval or consuming USDC budget', async () => {
  const t = setup(0n);
  await t.pay();
  expect(t.sessions.reserveSeatJoin).toHaveBeenCalledWith(
    expect.anything(),
    'join-test',
  );
  expect(t.sessions.reserve).not.toHaveBeenCalled();
  expect(t.wallet.writeContract).not.toHaveBeenCalled();
  expect(t.wallet.sendTransaction).toHaveBeenCalledTimes(1);
  const legacy = setup(0n, address);
  await expect(legacy.pay()).rejects.toThrow('Only an open sponsored');
});
it('does not sign when reservation is rejected and retains ambiguous payments', async () => {
  const denied = setup();
  denied.sessions.reserve.mockRejectedValue(new Error('Budget exhausted'));
  await expect(denied.pay()).rejects.toThrow('Budget exhausted');
  expect(denied.wallet.writeContract).not.toHaveBeenCalled();
  const ambiguous = setup();
  ambiguous.wallet.sendTransaction.mockRejectedValue(
    new Error('Network unavailable'),
  );
  await expect(ambiguous.pay()).rejects.toThrow('Network unavailable');
  expect(ambiguous.sessions.finish).toHaveBeenCalledWith(
    'attempt',
    'unknown',
    expect.anything(),
  );
});

it('takes an advertised paid seat over x402 within the grant, with no approval or transaction', async () => {
  const t = setup();
  const posts = advertise('x402');
  payMock.mockImplementation(async (_url, _init, _challenge, execution) => {
    await execution.reserve('100');
    return Response.json({ seat: 2, transaction: '0xrelayed' });
  });
  const paid = await t.pay();
  expect(paid).toMatchObject({ transaction: '0xrelayed', amountUnits: '100' });
  expect(posts[0]).toEqual({
    url: 'https://payments.test/v1/economy/matches/mat_test/entry',
    body: { seat: 2, controller: address },
  });
  const [, , , execution] = payMock.mock.calls[0];
  expect(execution).toMatchObject({ policy: t.session.policy, address });
  expect(t.sessions.reserve).toHaveBeenCalledWith(
    expect.anything(),
    'join-test',
    '100',
    'https://payments.test/mat_test/stake',
  );
  expect(t.wallet.writeContract).not.toHaveBeenCalled();
  expect(t.wallet.sendTransaction).not.toHaveBeenCalled();
});

it('refuses an x402 quote that differs from the pool stake before reserving budget', async () => {
  const t = setup();
  advertise('x402');
  payMock.mockImplementation(async (_url, _init, _challenge, execution) => {
    await execution.reserve('101');
    return Response.json({});
  });
  await expect(t.pay()).rejects.toThrow('does not match the pool stake');
  expect(t.sessions.reserve).not.toHaveBeenCalled();
});

it('does not use gasless entry for a different pool or an unfunded wallet', async () => {
  const other = setup();
  advertise('x402', `0x${'9'.repeat(64)}`);
  await other.pay();
  expect(payMock).not.toHaveBeenCalled();
  expect(other.wallet.sendTransaction).toHaveBeenCalled();
  const broke = setup();
  broke.values.balanceOf = 99n;
  advertise('x402');
  await expect(broke.pay()).rejects.toThrow('not have enough USDC');
  expect(broke.sessions.reserve).not.toHaveBeenCalled();
});

it('takes an advertised sponsored seat with a signed request instead of a transaction', async () => {
  const t = setup(0n);
  const posts = advertise('signed-command');
  const paid = await t.pay();
  expect(paid).toMatchObject({ transaction: '0xrelayed', amountUnits: '0' });
  expect(t.sessions.reserveSeatJoin).toHaveBeenCalledWith(
    expect.anything(),
    'join-test',
  );
  expect(posts[0].body).toMatchObject({
    seat: 2,
    controller: address,
    auth: { address },
  });
  expect(t.wallet.sendTransaction).not.toHaveBeenCalled();
  expect(t.sessions.finish).toHaveBeenCalledWith(
    'attempt',
    'settled',
    expect.objectContaining({ gasless: true }),
  );
});

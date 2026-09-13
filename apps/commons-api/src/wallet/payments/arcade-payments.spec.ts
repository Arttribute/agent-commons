import { payArcadeDeposit } from './arcade-payments';
import { createPublicClient, createWalletClient } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
jest.mock('viem', () => ({
  ...jest.requireActual('viem'),
  createPublicClient: jest.fn(),
  createWalletClient: jest.fn(),
}));
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
      payTo: address,
      origin: 'https://payments.test',
      maxPaymentUnits: '100',
      arcade: {
        poolId: `0x${'1'.repeat(64)}`,
        seatId: `0x${'2'.repeat(64)}`,
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
  return { pay, values, reader, wallet, sessions };
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
    expect.objectContaining({ functionName: 'approve', args: [address, 100n] }),
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

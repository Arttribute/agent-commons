import {
  createPublicClient,
  createWalletClient,
  RpcRequestError,
  TimeoutError,
} from 'viem';
import { WalletService } from '../wallet.service';

jest.mock('viem', () => ({
  ...jest.requireActual('viem'),
  createPublicClient: jest.fn(),
  createWalletClient: jest.fn(),
}));

const recipient = '0x4413c8be289ea99935b02a934ceb5d3298260d86';
// Throwaway key used only to derive an address in tests.
const privateKey =
  '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d';

describe('agent USDC transfers', () => {
  const readContract = jest.fn();
  const simulateContract = jest.fn();
  const waitForTransactionReceipt = jest.fn();
  const writeContract = jest.fn();
  const allowances = {
    reserve: jest.fn(),
    markSent: jest.fn(),
    finish: jest.fn(),
  };
  let service: WalletService;

  beforeEach(() => {
    jest.clearAllMocks();
    (createPublicClient as jest.Mock).mockReturnValue({
      readContract,
      simulateContract,
      waitForTransactionReceipt,
    });
    (createWalletClient as jest.Mock).mockReturnValue({ writeContract });
    readContract.mockResolvedValue(5_000_000n);
    simulateContract.mockResolvedValue({
      request: { functionName: 'transfer' },
    });
    allowances.reserve.mockResolvedValue({
      transfer: {
        id: 't1',
        state: 'reserved',
        to_address: recipient,
        amount_units: '1000000',
        chain_id: '84532',
      },
      replayed: false,
    });
    service = Object.create(WalletService.prototype);
    Object.assign(service, {
      logger: { warn: jest.fn() },
      transferAllowances: allowances,
      db: {
        query: {
          agentWallet: {
            findFirst: jest.fn().mockResolvedValue({
              id: 'wallet',
              agentId: 'agent',
              address: '0x' + '1'.repeat(40),
              chainId: '84532',
              walletType: 'eoa',
              provider: 'commons_mpc',
              encryptedPrivateKey: privateKey,
            }),
          },
        },
      },
    });
  });

  const send = () =>
    service.agentTransfer({
      agentId: 'agent',
      to: recipient,
      amount: '1',
      chainId: '84532',
      idempotencyKey: 'run-1:call-1',
    });

  it('confirms a mined transfer and links the transaction', async () => {
    writeContract.mockResolvedValue('0xabc');
    waitForTransactionReceipt.mockResolvedValue({ status: 'success' });
    await expect(send()).resolves.toMatchObject({
      status: 'confirmed',
      amountUsdc: '1',
      txHash: '0xabc',
      explorerUrl: 'https://sepolia.basescan.org/tx/0xabc',
    });
    expect(allowances.finish).toHaveBeenCalledWith('t1', 'confirmed', {
      txHash: '0xabc',
      error: undefined,
    });
  });

  it('does not reserve budget when the wallet lacks USDC', async () => {
    readContract.mockResolvedValue(10n);
    await expect(send()).rejects.toThrow('Insufficient USDC');
    expect(allowances.reserve).not.toHaveBeenCalled();
    expect(writeContract).not.toHaveBeenCalled();
  });

  it('releases budget when the network rejects the transaction', async () => {
    writeContract.mockRejectedValue(
      new RpcRequestError({
        body: {},
        error: { code: -32000, message: 'nonce too low' },
        url: 'https://rpc',
      }),
    );
    await expect(send()).rejects.toThrow('Transfer was rejected');
    expect(allowances.finish).toHaveBeenCalledWith(
      't1',
      'failed',
      expect.any(Object),
    );
  });

  it('treats an unrecognised send error as unknown, keeping the budget', async () => {
    writeContract.mockRejectedValue(new Error('socket hang up'));
    await expect(send()).rejects.toThrow('did not confirm');
    expect(allowances.finish).toHaveBeenCalledWith(
      't1',
      'unknown',
      expect.any(Object),
    );
  });

  it('keeps budget reserved when the send outcome is unknown', async () => {
    writeContract.mockRejectedValue(
      new TimeoutError({ body: {}, url: 'https://rpc' }),
    );
    await expect(send()).rejects.toThrow('did not confirm');
    expect(allowances.finish).toHaveBeenCalledWith(
      't1',
      'unknown',
      expect.any(Object),
    );
  });

  it('refuses to pay its own wallet', async () => {
    await expect(
      service.agentTransfer({
        agentId: 'agent',
        to: '0x' + '1'.repeat(40),
        amount: '1',
        idempotencyKey: 'run-1:call-2',
      }),
    ).rejects.toThrow('own wallet');
    expect(allowances.reserve).not.toHaveBeenCalled();
  });
});

import { BadRequestException } from '@nestjs/common';
import { WalletService } from '../wallet.service';
import { createPublicClient } from 'viem';
jest.mock('viem', () => ({
  ...jest.requireActual('viem'),
  createPublicClient: jest.fn(),
}));
describe('wallet balances use the explicitly requested network', () => {
  const address = '0x1111111111111111111111111111111111111111';
  const db = { query: { agentWallet: { findFirst: jest.fn() } } };
  const getBalance = jest.fn(),
    readContract = jest.fn();
  let service: WalletService;
  beforeEach(() => {
    jest.clearAllMocks();
    db.query.agentWallet.findFirst.mockResolvedValue({
      id: 'wallet',
      address,
      chainId: '84532',
      provider: 'local',
    });
    (createPublicClient as jest.Mock).mockReturnValue({
      getBalance,
      readContract,
    });
    getBalance.mockResolvedValue(2500000000000000000n);
    readContract.mockResolvedValue(1234567n);
    service = Object.create(WalletService.prototype);
    Object.defineProperty(service, 'db', { value: db });
  });
  it.each(['84532', '5042002', '296', '11142220'])(
    'reads %s independently of the wallet default chain',
    async (chainId) => {
      expect(await service.getBalance('wallet', chainId)).toEqual({
        address,
        chainId,
        native: '2.5',
        usdc: '1.234567',
      });
      expect((createPublicClient as jest.Mock).mock.calls[0][0].chain.id).toBe(
        Number(chainId),
      );
    },
  );
  it('rejects an unsupported chain before calling an RPC', async () => {
    await expect(service.getBalance('wallet', '1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(createPublicClient).not.toHaveBeenCalled();
  });
  it('does not turn RPC failure into a zero balance', async () => {
    readContract.mockRejectedValue(new Error('RPC unavailable'));
    await expect(service.getBalance('wallet', '296')).rejects.toThrow(
      'RPC unavailable',
    );
  });
});

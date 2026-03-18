import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '~/modules/database/database.service';
import { EncryptionService } from '~/modules/encryption';
import * as schema from '#/models/schema';
import { eq, and } from 'drizzle-orm';
import { createPublicClient, http, formatUnits } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { baseSepolia } from '#/lib/baseSepolia';
import type { CreateWalletDto, WalletBalanceDto, WalletResponseDto } from './dto/wallet.dto';

/** Base Sepolia USDC contract address */
const USDC_ADDRESS_BASE_SEPOLIA = '0x036CbD53842c5426634e7929541eC2318f3dCF7e' as const;

const ERC20_BALANCE_ABI = [
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const;

@Injectable()
export class WalletService {
  private publicClient = createPublicClient({
    chain: baseSepolia,
    transport: http(),
  });

  constructor(
    private db: DatabaseService,
    private encryption: EncryptionService,
  ) {}

  /**
   * Create a new wallet for an agent.
   * - 'eoa': generates a fresh EOA keypair, stores encrypted private key
   * - 'external': records an owner-provided address (no key stored)
   * - 'erc4337': placeholder — session key flow to be implemented with ZeroDev
   */
  async createWallet(dto: CreateWalletDto): Promise<WalletResponseDto> {
    const { agentId, walletType = 'eoa', label = 'Primary', chainId = '84532' } = dto;

    let address: string;
    let encryptedPrivateKey: string | undefined;

    if (walletType === 'external') {
      if (!dto.externalAddress) {
        throw new BadRequestException('externalAddress is required for external wallets');
      }
      address = dto.externalAddress.toLowerCase();
    } else if (walletType === 'eoa' || walletType === 'erc4337') {
      // Generate a fresh EOA keypair
      const privateKey = generatePrivateKey();
      const account = privateKeyToAccount(privateKey);
      address = account.address.toLowerCase();
      encryptedPrivateKey = this.encryptKey(privateKey);
    } else {
      throw new BadRequestException(`Unsupported walletType: ${walletType}`);
    }

    const [wallet] = await this.db
      .insert(schema.agentWallet)
      .values({
        agentId,
        walletType,
        address,
        encryptedPrivateKey: encryptedPrivateKey ?? null,
        chainId,
        label,
        isActive: true,
      })
      .returning();

    return this.toResponse(wallet);
  }

  /**
   * List all wallets for an agent.
   */
  async listWallets(agentId: string): Promise<WalletResponseDto[]> {
    const wallets = await this.db.query.agentWallet.findMany({
      where: (w) => eq(w.agentId, agentId),
    });
    return wallets.map(this.toResponse);
  }

  /**
   * Get a specific wallet by ID.
   */
  async getWallet(walletId: string): Promise<WalletResponseDto> {
    const wallet = await this.db.query.agentWallet.findFirst({
      where: (w) => eq(w.id, walletId),
    });
    if (!wallet) throw new NotFoundException(`Wallet ${walletId} not found`);
    return this.toResponse(wallet);
  }

  /**
   * Get the active primary wallet for an agent.
   */
  async getPrimaryWallet(agentId: string): Promise<WalletResponseDto | null> {
    const wallet = await this.db.query.agentWallet.findFirst({
      where: (w) => and(eq(w.agentId, agentId), eq(w.isActive, true)),
    });
    return wallet ? this.toResponse(wallet) : null;
  }

  /**
   * Get USDC and native token balance for a wallet address on Base Sepolia.
   */
  async getBalance(walletId: string): Promise<WalletBalanceDto> {
    const wallet = await this.db.query.agentWallet.findFirst({
      where: (w) => eq(w.id, walletId),
    });
    if (!wallet) throw new NotFoundException(`Wallet ${walletId} not found`);

    const address = wallet.address as `0x${string}`;

    const [nativeBalance, usdcBalance] = await Promise.all([
      this.publicClient.getBalance({ address }),
      this.publicClient.readContract({
        address: USDC_ADDRESS_BASE_SEPOLIA,
        abi: ERC20_BALANCE_ABI,
        functionName: 'balanceOf',
        args: [address],
      }),
    ]);

    return {
      address: wallet.address,
      chainId: wallet.chainId,
      native: formatUnits(nativeBalance, 18),
      usdc: formatUnits(usdcBalance as bigint, 6),
    };
  }

  /**
   * Deactivate a wallet.
   */
  async deactivateWallet(walletId: string): Promise<void> {
    await this.db
      .update(schema.agentWallet)
      .set({ isActive: false })
      .where(eq(schema.agentWallet.id, walletId));
  }

  /* ─────────────────────────  PRIVATE HELPERS  ───────────────────────── */

  private encryptKey(privateKey: string): string {
    const { encryptedValue, iv, tag } = this.encryption.encrypt(privateKey);
    return `enc:${iv}:${tag}:${encryptedValue}`;
  }

  private toResponse(wallet: typeof schema.agentWallet.$inferSelect): WalletResponseDto {
    return {
      id: wallet.id,
      agentId: wallet.agentId,
      walletType: wallet.walletType as any,
      address: wallet.address,
      smartAccountAddress: wallet.smartAccountAddress,
      chainId: wallet.chainId,
      label: wallet.label,
      isActive: wallet.isActive,
      createdAt: wallet.createdAt,
    };
  }
}

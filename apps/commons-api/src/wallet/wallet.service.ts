import { Injectable, BadRequestException, Logger, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '~/modules/database/database.service';
import { EncryptionService } from '~/modules/encryption';
import * as schema from '#/models/schema';
import { eq, and } from 'drizzle-orm';
import { createPublicClient, createWalletClient, http, formatUnits, parseUnits, encodeFunctionData } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { baseSepolia } from '#/lib/baseSepolia';
import type { CreateWalletDto, WalletBalanceDto, WalletResponseDto } from './dto/wallet.dto';

export interface TransferDto {
  toAddress: string;
  amount: string;   // human-readable e.g. "10.5"
  tokenSymbol?: 'USDC' | 'ETH';
}

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
  private readonly logger = new Logger(WalletService.name);
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
   * Transfer USDC (or native ETH) from an EOA wallet to another address.
   * The wallet must have an encrypted private key stored (EOA type).
   */
  async transfer(walletId: string, dto: TransferDto): Promise<{ txHash: string }> {
    const wallet = await this.db.query.agentWallet.findFirst({
      where: (w) => eq(w.id, walletId),
    });
    if (!wallet) throw new NotFoundException(`Wallet ${walletId} not found`);
    if (!wallet.encryptedPrivateKey) {
      throw new BadRequestException('This wallet has no stored private key — only EOA wallets can send transactions');
    }

    const privateKey = this.decryptKey(wallet.encryptedPrivateKey) as `0x${string}`;
    const account = privateKeyToAccount(privateKey);
    const to = dto.toAddress as `0x${string}`;
    const tokenSymbol = dto.tokenSymbol ?? 'USDC';

    const walletClient = createWalletClient({
      account,
      chain: baseSepolia,
      transport: http(),
    });

    let txHash: `0x${string}`;

    if (tokenSymbol === 'ETH') {
      const amountWei = parseUnits(dto.amount, 18);
      txHash = await walletClient.sendTransaction({ to, value: amountWei });
    } else {
      // ERC-20 transfer
      const amountUnits = parseUnits(dto.amount, 6); // USDC has 6 decimals
      const data = encodeFunctionData({
        abi: [
          {
            name: 'transfer',
            type: 'function',
            inputs: [
              { name: 'to', type: 'address' },
              { name: 'value', type: 'uint256' },
            ],
            outputs: [{ name: '', type: 'bool' }],
          },
        ] as const,
        functionName: 'transfer',
        args: [to, amountUnits],
      });
      txHash = await walletClient.sendTransaction({
        to: USDC_ADDRESS_BASE_SEPOLIA,
        data,
      });
    }

    return { txHash };
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

  // ── x402 Payment Client ───────────────────────────────────────────────────

  /**
   * Fetch a URL, automatically handling x402 payment challenges.
   *
   * If the server responds with 402 + `accepts`, the agent's primary wallet
   * signs and attaches a payment header, then retries once.
   *
   * @param agentId  - Agent whose wallet will pay
   * @param url      - Target URL
   * @param init     - Standard fetch init (method, headers, body…)
   * @returns The final Response (after payment if required)
   */
  async x402Fetch(
    agentId: string,
    url: string,
    init: RequestInit = {},
  ): Promise<Response> {
    // First attempt — no payment header
    const firstRes = await fetch(url, init);

    if (firstRes.status !== 402) return firstRes;

    // Parse payment requirements from 402 body
    let body: any;
    try {
      body = await firstRes.json();
    } catch {
      throw new Error('x402: server returned 402 but body is not JSON');
    }

    const accepts: any[] = body?.accepts;
    if (!accepts?.length) {
      throw new Error('x402: 402 response has no `accepts` field');
    }

    // Load the agent's primary EOA wallet (raw DB row to access encrypted key)
    const wallet = await this.db.query.agentWallet.findFirst({
      where: (w) => and(eq(w.agentId, agentId), eq(w.isActive, true)),
    });
    if (!wallet?.encryptedPrivateKey) {
      throw new BadRequestException(
        `Agent ${agentId} has no EOA wallet to pay x402 requests`,
      );
    }

    const privateKey = this.decryptKey(wallet.encryptedPrivateKey) as `0x${string}`;
    const account = privateKeyToAccount(privateKey);

    // Build a viem wallet client for x402 signing
    const viemWalletClient = createWalletClient({
      account,
      chain: baseSepolia,
      transport: http(),
    });

    // Select the first matching payment requirement (prefer exact/base-sepolia)
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createPaymentHeader, selectPaymentRequirements } = require('x402/client');
    const requirements = selectPaymentRequirements(accepts);
    if (!requirements) {
      throw new Error('x402: no supported payment requirement in 402 response');
    }

    this.logger.log(
      `x402: paying ${requirements.maxAmountRequired} ${requirements.asset} on ${requirements.network} for ${agentId}`,
    );

    const paymentHeader = await createPaymentHeader(viemWalletClient, 1, requirements);

    // Retry with payment header
    const retryRes = await fetch(url, {
      ...init,
      headers: {
        ...((init.headers as Record<string, string>) ?? {}),
        'X-PAYMENT': paymentHeader,
      },
    });

    return retryRes;
  }

  /* ─────────────────────────  PRIVATE HELPERS  ───────────────────────── */

  private encryptKey(privateKey: string): string {
    const { encryptedValue, iv, tag } = this.encryption.encrypt(privateKey);
    return `enc:${iv}:${tag}:${encryptedValue}`;
  }

  private decryptKey(stored: string): string {
    if (!stored.startsWith('enc:')) return stored; // unencrypted legacy
    const [, iv, tag, encryptedValue] = stored.split(':');
    return this.encryption.decrypt(encryptedValue, iv, tag);
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

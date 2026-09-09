import { payArcadeDeposit } from './payments/arcade-payments';
import { walletChain } from './payments/chains';
import { PaymentSessionService } from './payments/payment-session.service';
import { payX402Challenge } from './payments/x402-client';
import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '~/modules/database/database.service';
import { EncryptionService } from '~/modules/encryption';
import * as schema from '#/models/schema';
import { eq, and } from 'drizzle-orm';
import {
  createPublicClient,
  createWalletClient,
  http,
  formatUnits,
  parseUnits,
  encodeFunctionData,
} from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { baseSepolia } from '#/lib/baseSepolia';
import { safeFetch } from '~/utils/safe-fetch';
import type {
  CreateWalletDto,
  WalletBalanceDto,
  WalletResponseDto,
} from './dto/wallet.dto';
import { CapabilityProviderService } from '~/provider';

export interface TransferDto {
  toAddress: string;
  amount: string; // human-readable e.g. "10.5"
  tokenSymbol?: 'USDC' | 'ETH';
}

/** Base Sepolia USDC contract address */
const USDC_ADDRESS_BASE_SEPOLIA =
  '0x036CbD53842c5426634e7929541eC2318f3dCF7e' as const;

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
    private capabilityProviders: CapabilityProviderService,
    private paymentSessions: PaymentSessionService,
  ) {}

  /**
   * Create a new wallet for an agent.
   * - 'eoa': generates a fresh EOA keypair, stores encrypted private key
   * - 'external': records an owner-provided address (no key stored)
   * - 'erc4337': placeholder — session key flow to be implemented with ZeroDev
   */
  async createWallet(dto: CreateWalletDto): Promise<WalletResponseDto> {
    const {
      agentId,
      walletType = 'eoa',
      label = 'Primary',
      chainId = '84532',
    } = dto;

    const agent = await this.db.query.agent.findFirst({
      where: (table) => eq(table.agentId, agentId),
      columns: { ownerUserId: true, owner: true },
    });
    const ownerId = agent?.ownerUserId ?? agent?.owner;
    const configured = ownerId
      ? await this.capabilityProviders.resolve(ownerId, 'wallet')
      : null;

    if (configured?.provider === 'custom') {
      const remote = await this.customWalletRequest<{
        walletId?: string;
        id?: string;
        address: string;
        smartAccountAddress?: string;
      }>(configured, 'POST', '/wallets', { agentId, label, chainId });
      if (!remote.address) {
        throw new BadRequestException(
          'Custom wallet provider did not return an address',
        );
      }
      const [wallet] = await this.db
        .insert(schema.agentWallet)
        .values({
          agentId,
          walletType: 'external',
          provider: 'custom',
          providerWalletId: remote.walletId ?? remote.id ?? remote.address,
          address: remote.address.toLowerCase(),
          smartAccountAddress: remote.smartAccountAddress ?? null,
          chainId,
          label,
          isActive: true,
        })
        .returning();
      return this.toResponse(wallet);
    }
    if (configured?.provider === 'external' && walletType !== 'external') {
      throw new BadRequestException(
        'The selected wallet provider requires an owner-connected external address',
      );
    }

    let address: string;
    let encryptedPrivateKey: string | undefined;

    if (walletType === 'external') {
      if (!dto.externalAddress) {
        throw new BadRequestException(
          'externalAddress is required for external wallets',
        );
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
        provider: configured?.provider ?? 'commons_mpc',
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
   * Assert that the caller owns the agent before wallet operations that are
   * not covered by a route-param OwnerGuard (e.g. create, where the agent id
   * arrives in the body).
   */
  async assertAgentOwnership(agentId: string, callerId: string): Promise<void> {
    const agent = await this.db.query.agent.findFirst({
      where: (a) => eq(a.agentId, agentId),
    });
    if (!agent) throw new NotFoundException(`Agent ${agentId} not found`);
    const caller = callerId.toLowerCase();
    const owns =
      agent.ownerUserId?.toLowerCase() === caller ||
      agent.owner?.toLowerCase() === caller;
    if (!owns) {
      throw new ForbiddenException('You do not own this agent');
    }
  }

  /**
   * List all wallets for an agent.
   */
  async runtimeSessions(agentId: string) {
    return this.db.query.session.findMany({
      where: (s) => eq(s.agentId, agentId),
      columns: { sessionId: true, title: true, createdAt: true },
      limit: 50,
      orderBy: (s, { desc }) => [desc(s.createdAt)],
    });
  }

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
  async getBalance(
    walletId: string,
    chainId?: string,
  ): Promise<WalletBalanceDto> {
    const wallet = await this.db.query.agentWallet.findFirst({
      where: (w) => eq(w.id, walletId),
    });
    if (!wallet) throw new NotFoundException(`Wallet ${walletId} not found`);

    if (wallet.provider === 'custom') {
      if (chainId && chainId !== wallet.chainId)
        throw new BadRequestException(
          'Custom provider network switching requires its own adapter',
        );
      const configured = await this.customProviderForWallet(wallet);
      return this.customWalletRequest<WalletBalanceDto>(
        configured,
        'GET',
        `/wallets/${encodeURIComponent(
          wallet.providerWalletId ?? wallet.address,
        )}/balance`,
      );
    }

    const address = wallet.address as `0x${string}`;
    const network = walletChain(chainId ?? wallet.chainId);
    const publicClient = createPublicClient({
      chain: network.chain,
      transport: http(),
    });

    const [nativeBalance, usdcBalance] = await Promise.all([
      publicClient.getBalance({ address }),
      publicClient.readContract({
        address: network.token,
        abi: ERC20_BALANCE_ABI,
        functionName: 'balanceOf',
        args: [address],
      }),
    ]);

    return {
      address: wallet.address,
      chainId: String(network.chain.id),
      native: formatUnits(nativeBalance, 18),
      usdc: formatUnits(usdcBalance as bigint, 6),
    };
  }

  /**
   * Transfer USDC (or native ETH) from an EOA wallet to another address.
   * The wallet must have an encrypted private key stored (EOA type).
   */
  async transfer(
    walletId: string,
    dto: TransferDto,
  ): Promise<{ txHash: string }> {
    const wallet = await this.db.query.agentWallet.findFirst({
      where: (w) => eq(w.id, walletId),
    });
    if (!wallet) throw new NotFoundException(`Wallet ${walletId} not found`);
    if (!wallet.isActive) throw new BadRequestException('Wallet is inactive');
    if (wallet.provider === 'custom') {
      const configured = await this.customProviderForWallet(wallet);
      return this.customWalletRequest<{ txHash: string }>(
        configured,
        'POST',
        `/wallets/${encodeURIComponent(
          wallet.providerWalletId ?? wallet.address,
        )}/transfer`,
        dto,
      );
    }
    if (!wallet.encryptedPrivateKey) {
      throw new BadRequestException(
        'This wallet has no stored private key — only EOA wallets can send transactions',
      );
    }

    const privateKey = this.decryptKey(
      wallet.encryptedPrivateKey,
    ) as `0x${string}`;
    const account = privateKeyToAccount(privateKey);
    const to = dto.toAddress as `0x${string}`;
    const tokenSymbol = dto.tokenSymbol ?? 'USDC';
    const network = walletChain(wallet.chainId);
    if (
      !/^0x[0-9a-fA-F]{40}$/.test(dto.toAddress) ||
      !/^(0|[1-9]\d*)(\.\d{1,6})?$/.test(dto.amount) ||
      parseUnits(dto.amount, 6) <= 0n
    )
      throw new BadRequestException('Invalid address or positive amount');
    if (
      !['ETH', 'USDC'].includes(tokenSymbol) ||
      (tokenSymbol === 'ETH' && network.chain.nativeCurrency.symbol !== 'ETH')
    )
      throw new BadRequestException('Token does not match network');

    const walletClient = createWalletClient({
      account,
      chain: network.chain,
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
        to: network.token,
        data,
      });
    }

    const receipt = await createPublicClient({
      chain: network.chain,
      transport: http(),
    }).waitForTransactionReceipt({ hash: txHash, confirmations: 2 });
    if (receipt.status !== 'success')
      throw new BadRequestException(`Transfer reverted: ${txHash}`);
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
  async arcadeDeposit(
    agentId: string,
    input: {
      paymentSessionId: string;
      runtimeSessionId: string;
      idempotencyKey: string;
      operation: 'stake' | 'bounty' | 'bet';
      amountUnits?: string;
    },
  ) {
    const session = await this.paymentSessions.load(
      agentId,
      input.paymentSessionId,
      input.runtimeSessionId,
    );
    const wallet = await this.db.query.agentWallet.findFirst({
      where: (w) =>
        and(
          eq(w.id, session.wallet_id),
          eq(w.agentId, agentId),
          eq(w.isActive, true),
        ),
    });
    if (
      !wallet?.encryptedPrivateKey ||
      wallet.walletType !== 'eoa' ||
      wallet.provider === 'custom'
    )
      throw new BadRequestException('Supported active EOA required');
    return payArcadeDeposit(
      session,
      this.paymentSessions,
      this.decryptKey(wallet.encryptedPrivateKey) as `0x${string}`,
      input,
    );
  }

  async arcadeAction(
    agentId: string,
    input: {
      paymentSessionId: string;
      runtimeSessionId: string;
      actionId: string;
      sequence: number;
      type?: 'hit' | 'stand';
      payload?: unknown;
    },
  ) {
    const session = await this.paymentSessions.load(
      agentId,
      input.paymentSessionId,
      input.runtimeSessionId,
    );
    const grant = session.policy.arcade;
    if (
      !grant ||
      (input.payload === undefined &&
        !['hit', 'stand'].includes(input.type ?? '')) ||
      (input.payload !== undefined && input.type !== undefined) ||
      JSON.stringify(input.payload ?? {}).length > 16384 ||
      !Number.isSafeInteger(input.sequence) ||
      input.sequence < 0 ||
      !/^[0-9a-f-]{36}$/i.test(input.actionId)
    )
      throw new BadRequestException('Invalid Arcade action');
    const wallet = await this.db.query.agentWallet.findFirst({
      where: (w) =>
        and(
          eq(w.id, session.wallet_id),
          eq(w.agentId, agentId),
          eq(w.isActive, true),
        ),
    });
    if (
      !wallet?.encryptedPrivateKey ||
      wallet.walletType !== 'eoa' ||
      wallet.provider === 'custom'
    )
      throw new BadRequestException('Supported active EOA required');
    const account = privateKeyToAccount(
      this.decryptKey(wallet.encryptedPrivateKey) as `0x${string}`,
    );
    const body = {
        actionId: input.actionId,
        sequence: input.sequence,
        ...(input.payload !== undefined
          ? { payload: input.payload }
          : { type: input.type }),
      },
      expiresAt = Date.now() + 60000;
    const signature = await account.signMessage({
      message: JSON.stringify({
        domain: session.policy.origin,
        matchId: grant.matchId,
        operation: 'action',
        body,
        expiresAt,
      }),
    });
    const response = await safeFetch(
      `${session.policy.origin}/v1/economy/matches/${grant.matchId}/actions`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          body,
          auth: { address: account.address, expiresAt, signature },
        }),
        redirect: 'error',
        signal: AbortSignal.timeout(60000),
      },
    );
    return { status: response.status, body: await response.json() };
  }

  async arcadeObservation(
    agentId: string,
    input: { paymentSessionId: string; runtimeSessionId: string },
  ) {
    const session = await this.paymentSessions.load(
      agentId,
      input.paymentSessionId,
      input.runtimeSessionId,
    );
    const grant = session.policy.arcade;
    if (!grant) throw new BadRequestException('Match grant required');
    const wallet = await this.db.query.agentWallet.findFirst({
      where: (w) =>
        and(
          eq(w.id, session.wallet_id),
          eq(w.agentId, agentId),
          eq(w.isActive, true),
        ),
    });
    if (
      !wallet?.encryptedPrivateKey ||
      wallet.walletType !== 'eoa' ||
      wallet.provider === 'custom'
    )
      throw new BadRequestException('Supported active EOA required');
    const account = privateKeyToAccount(
        this.decryptKey(wallet.encryptedPrivateKey) as `0x${string}`,
      ),
      expiresAt = Date.now() + 60000;
    const signature = await account.signMessage({
      message: JSON.stringify({
        domain: session.policy.origin,
        matchId: grant.matchId,
        operation: 'observation',
        body: {},
        expiresAt,
      }),
    });
    const response = await safeFetch(
      `${session.policy.origin}/v1/economy/matches/${grant.matchId}/observation`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          address: account.address,
          expiresAt,
          signature,
        }),
        redirect: 'error',
        signal: AbortSignal.timeout(60000),
      },
    );
    return { status: response.status, body: await response.json() };
  }

  async x402Fetch(
    agentId: string,
    url: string,
    init: RequestInit = {},
    grant?: {
      paymentSessionId: string;
      runtimeSessionId: string;
      idempotencyKey: string;
    },
  ): Promise<Response> {
    const headers = new Headers(init.headers);
    headers.delete('PAYMENT-SIGNATURE');
    headers.delete('X-PAYMENT');
    const request = {
      ...init,
      headers,
      redirect: 'error' as const,
      signal: AbortSignal.timeout(60000),
    };
    const firstRes = await safeFetch(url, request);
    if (firstRes.status !== 402) return firstRes;
    if (!grant)
      throw new BadRequestException(
        'An explicit owner-approved payment session is required before spending',
      );
    const session = await this.paymentSessions.load(
      agentId,
      grant.paymentSessionId,
      grant.runtimeSessionId,
    );
    if (session.policy.arcade)
      throw new BadRequestException(
        'An Arcade deposit grant cannot pay x402 service fees',
      );
    if (new URL(url).origin !== session.policy.origin)
      throw new ForbiddenException('URL outside payment session');
    const wallet = await this.db.query.agentWallet.findFirst({
      where: (w) =>
        and(
          eq(w.id, session.wallet_id),
          eq(w.agentId, agentId),
          eq(w.isActive, true),
        ),
    });
    if (
      !wallet?.encryptedPrivateKey ||
      wallet.walletType !== 'eoa' ||
      wallet.provider === 'custom'
    )
      throw new BadRequestException(
        'Payment session requires a supported active EOA signer',
      );
    return payX402Challenge(url, request, firstRes, {
      policy: session.policy,
      privateKey: this.decryptKey(wallet.encryptedPrivateKey) as `0x${string}`,
      address: wallet.address,
      reserve: (amount) =>
        this.paymentSessions.reserve(
          session,
          grant.idempotencyKey,
          amount,
          url,
        ),
      finish: (id, state, receipt) =>
        this.paymentSessions.finish(id, state, receipt),
    });
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

  private async customProviderForWallet(
    wallet: typeof schema.agentWallet.$inferSelect,
  ) {
    const agent = await this.db.query.agent.findFirst({
      where: (table) => eq(table.agentId, wallet.agentId),
      columns: { ownerUserId: true, owner: true },
    });
    const ownerId = agent?.ownerUserId ?? agent?.owner;
    const configured = ownerId
      ? await this.capabilityProviders.resolve(ownerId, 'wallet')
      : null;
    if (!configured || configured.provider !== 'custom') {
      throw new BadRequestException(
        'The custom wallet adapter is no longer configured',
      );
    }
    return configured;
  }

  private async customWalletRequest<T>(
    provider: Awaited<ReturnType<CapabilityProviderService['resolve']>> & {},
    method: 'GET' | 'POST',
    path: string,
    body?: unknown,
  ): Promise<T> {
    const endpoint = provider?.endpointUrl?.replace(/\/$/, '');
    if (!endpoint)
      throw new BadRequestException('Custom wallet endpoint is missing');
    const response = await fetch(`${endpoint}${path}`, {
      method,
      headers: {
        Accept: 'application/json',
        ...(provider.credentials.apiKey
          ? { Authorization: `Bearer ${provider.credentials.apiKey}` }
          : {}),
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
    });
    const payload: any = await response.json().catch(() => null);
    if (!response.ok) {
      throw new BadRequestException(
        payload?.message ||
          payload?.error ||
          `Wallet provider returned ${response.status}`,
      );
    }
    return payload as T;
  }

  private toResponse(
    wallet: typeof schema.agentWallet.$inferSelect,
  ): WalletResponseDto {
    return {
      id: wallet.id,
      agentId: wallet.agentId,
      walletType: wallet.walletType as any,
      provider: wallet.provider,
      providerWalletId: wallet.providerWalletId,
      address: wallet.address,
      smartAccountAddress: wallet.smartAccountAddress,
      chainId: wallet.chainId,
      label: wallet.label,
      isActive: wallet.isActive,
      createdAt: wallet.createdAt,
    };
  }
}

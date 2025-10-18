// src/liaison/liaison.service.ts
import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { DatabaseService } from '~/modules/database/database.service';
import { AgentService } from '~/agent/agent.service';
import { eq } from 'drizzle-orm';
import * as crypto from 'crypto';
import * as schema from '#/models/schema';
import { CoinbaseService } from '~/modules/coinbase/coinbase.service';
import { AGENT_REGISTRY_ABI } from 'lib/abis/AgentRegistryABI';
import { AGENT_REGISTRY_ADDRESS } from 'lib/addresses';
import {
  createPublicClient,
  createWalletClient,
  getContract,
  http,
  parseUnits,
} from 'viem';
import { baseSepolia } from '#/lib/baseSepolia';
import { privateKeyToAccount } from 'viem/accounts';
import { isObservable, lastValueFrom } from 'rxjs';

const API_SECRET_HASH_KEY =
  process.env.API_SECRET_HASH_KEY || 'default_api_secret_hash_key';

@Injectable()
export class LiaisonService {
  private publicClient = createPublicClient({
    chain: baseSepolia,
    transport: http(),
  });

  constructor(
    private db: DatabaseService,
    private coinbase: CoinbaseService,
    private agentService: AgentService,
  ) {}

  /**
   * Helper to convert a value that might be a Promise or an RxJS Observable
   * into a resolved value. This ensures callers get a concrete result instead
   * of an Observable object.
   */
  private async resolveMaybeObservable<T>(
    input: T | Promise<T> | any,
  ): Promise<T> {
    const awaited: any = await input;
    if (isObservable(awaited)) {
      return await lastValueFrom(awaited as any);
    }
    return awaited as T;
  }

  /**
   * Creates a new liaison agent.
   * Generates a random liaison_secret, computes its HMAC-SHA256 hash,
   * and stores the hash in the DB. Returns the new agent record plus the raw liaison_secret.
   */
  async createLiaisonAgent(props: {
    name: string;
    owner: string;
    externalOwner: string;
    persona?: string;
    instructions?: string;
    externalUrl?: string;
    externalEndpoint?: string;
  }) {
    // 1) Create a wallet for the new liaison agent.
    const wallet = await this.coinbase.createDeveloperManagedWallet();
    const faucetTx = await wallet.faucet();
    await faucetTx.wait();

    // 2) Use the wallet's default address as the agentId.
    const agentAddress = (await wallet.getDefaultAddress())
      ?.getId()
      .toLowerCase();
    if (!agentAddress) {
      throw new BadRequestException('Failed to retrieve agent address');
    }

    // 3) Generate a random liaison_secret (32 bytes hex string).
    const liaisonKey = crypto.randomBytes(32).toString('hex');

    // 4) Compute the HMAC-SHA256 hash of the liaison_secret.
    const liaisonKeyHash = crypto
      .createHmac('sha256', API_SECRET_HASH_KEY)
      .update(liaisonKey)
      .digest('hex');

    // 5) Insert the new liaison agent into the DB.
    const [inserted] = await this.db
      .insert(schema.agent)
      .values({
        agentId: agentAddress,
        owner: props.owner,
        wallet: wallet.export(),
        name: props.name,
        persona: props.persona ?? '',
        instructions: props.instructions ?? '',
        isLiaison: true,
        liaisonKeyHash,
        externalUrl: props.externalUrl ?? '',
        externalEndpoint: props.externalEndpoint ?? '',
      })
      .returning();

    // 6) Register the new liaison agent on-chain.
    const commonsWallet = createWalletClient({
      account: privateKeyToAccount(
        `0x${process.env.WALLET_PRIVATE_KEY!}` as `0x${string}`,
      ),
      chain: baseSepolia,
      transport: http(),
    });
    const contract = getContract({
      abi: AGENT_REGISTRY_ABI,
      address: AGENT_REGISTRY_ADDRESS,
      client: commonsWallet,
    });

    const metadata =
      'https://coral-abstract-dolphin-257.mypinata.cloud/ipfs/bafkreiewjk5fizidkxejplpx34fjva7f6i6azcolanwgtzptanhre6twui';

    const isCommonAgent = false;

    const txHash = await contract.write.registerAgent([
      agentAddress,
      metadata,
      isCommonAgent,
    ]);
    await this.publicClient.waitForTransactionReceipt({ hash: txHash });
    return { agent: inserted, liaisonKey };
  }

  /**
   * Retrieves a liaison agent and ensures it is flagged as a liaison.
   */
  async getLiaisonAgent(agentId: string) {
    const agent = await this.db.query.agent.findFirst({
      where: (a) => eq(a.agentId, agentId),
    });
    if (!agent || !agent.isLiaison) {
      throw new BadRequestException(`Liaison agent "${agentId}" not found.`);
    }
    return agent;
  }

  /**
   * Verifies the provided liaison_secret against the stored hash.
   */
  async verifyLiaisonKey(agentId: string, providedKey: string) {
    const agent = await this.getLiaisonAgent(agentId);
    if (!agent.liaisonKeyHash) {
      throw new BadRequestException('No liaison key set for this agent.');
    }
    const providedHash = crypto
      .createHmac('sha256', API_SECRET_HASH_KEY)
      .update(providedKey)
      .digest('hex');

    if (providedHash !== agent.liaisonKeyHash) {
      throw new UnauthorizedException('Invalid liaison_key.');
    }
    return true;
  }

  /**
   * Interacts with the liaison agent.
   * Verifies the liaison_secret and, if valid, delegates the request to AgentService.
   */
  async interactWithLiaison(
    agentId: string,
    providedKey: string,
    message?: string,
  ) {
    await this.verifyLiaisonKey(agentId, providedKey);
    console.log('Liaison key verified successfully.');
    console.log('Message:', message);
    // runAgent may return an Observable (for streaming). Since we set stream:false,
    // unwrap any Observable to return a concrete value to the caller.
    const result = await this.resolveMaybeObservable(
      this.agentService.runAgent({
        agentId,
        messages: message ? [{ role: 'user', content: message }] : [],
        stream: false, // non-streaming: expect a single result
        initiator: 'liaison',
      }),
    );
    return result;
  }
}

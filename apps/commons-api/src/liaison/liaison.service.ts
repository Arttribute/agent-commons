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
import { v4 as uuidv4 } from 'uuid';
import { isObservable, lastValueFrom } from 'rxjs';
import { WalletService } from '~/wallet/wallet.service';

const API_SECRET_HASH_KEY =
  process.env.API_SECRET_HASH_KEY || 'default_api_secret_hash_key';

@Injectable()
export class LiaisonService {
  constructor(
    private db: DatabaseService,
    private agentService: AgentService,
    private walletService: WalletService,
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
    const agentId = uuidv4();

    // Generate a random liaison_secret (32 bytes hex string).
    const liaisonKey = crypto.randomBytes(32).toString('hex');

    // Compute the HMAC-SHA256 hash of the liaison_secret.
    const liaisonKeyHash = crypto
      .createHmac('sha256', API_SECRET_HASH_KEY)
      .update(liaisonKey)
      .digest('hex');

    // Insert the new liaison agent into the DB.
    const [inserted] = await this.db
      .insert(schema.agent)
      .values({
        agentId,
        owner: props.owner,
        name: props.name,
        persona: props.persona ?? '',
        instructions: props.instructions ?? '',
        isLiaison: true,
        liaisonKeyHash,
        externalUrl: props.externalUrl ?? '',
        externalEndpoint: props.externalEndpoint ?? '',
      })
      .returning();

    // Auto-provision a primary EOA wallet for the liaison agent
    await this.walletService.createWallet({
      agentId,
      walletType: 'eoa',
      label: 'Primary',
    }).catch((err) =>
      console.error(`[LiaisonService] Failed to create wallet for liaison ${agentId}:`, err),
    );

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

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

const API_SECRET_HASH_KEY =
  process.env.API_SECRET_HASH_KEY || 'default_api_secret_hash_key';

@Injectable()
export class LiaisonService {
  createDeveloperManagedWallet() {
    throw new Error('Method not implemented.');
  }
  constructor(
    private db: DatabaseService,
    private coinbase: CoinbaseService,
    private agentService: AgentService,
  ) {}

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
    const liaisonSecret = crypto.randomBytes(32).toString('hex');

    // 4) Compute the HMAC-SHA256 hash of the liaison_secret.
    const liaisonSecretHash = crypto
      .createHmac('sha256', API_SECRET_HASH_KEY)
      .update(liaisonSecret)
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
        liaisonSecretHash,
        externalUrl: props.externalUrl ?? '',
        externalEndpoint: props.externalEndpoint ?? '',
      })
      .returning();

    return { agent: inserted, liaisonSecret };
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
  async verifyLiaisonSecret(agentId: string, providedSecret: string) {
    const agent = await this.getLiaisonAgent(agentId);
    if (!agent.liaisonSecretHash) {
      throw new BadRequestException('No liaison secret set for this agent.');
    }
    const providedHash = crypto
      .createHmac('sha256', API_SECRET_HASH_KEY)
      .update(providedSecret)
      .digest('hex');

    if (providedHash !== agent.liaisonSecretHash) {
      throw new UnauthorizedException('Invalid liaison_secret.');
    }
    return true;
  }

  /**
   * Interacts with the liaison agent.
   * Verifies the liaison_secret and, if valid, delegates the request to AgentService.
   */
  async interactWithLiaison(
    agentId: string,
    providedSecret: string,
    message?: string,
  ) {
    await this.verifyLiaisonSecret(agentId, providedSecret);
    const result = await this.agentService.runAgent({
      agentId,
      messages: message ? [{ role: 'user', content: message }] : [],
    });
    return result;
  }
}

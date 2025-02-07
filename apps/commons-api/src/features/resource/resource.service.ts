import { COMMON_RESOURCE_ABI } from '#/lib/abis/CommonResourceABI';
import { COMMON_RESOURCE_ADDRESS } from '#/lib/addresses';
import { baseSepolia } from '#/lib/baseSepolia';
import { forwardRef, Inject, Injectable } from '@nestjs/common';
import {
  createPublicClient,
  createWalletClient,
  getContract,
  http,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import * as schema from '#/models/schema';
import { AgentService } from '~/features/agent/agent.service';
import { DatabaseService } from '~/modules/database/database.service';
import { EmbeddingService } from '~/embedding/embedding.service';
import { EmbeddingType } from '~/embedding/dto/embedding.dto';

@Injectable()
export class ResourceService {
  private publicClient = createPublicClient({
    chain: baseSepolia,
    transport: http(),
  });
  constructor(
    private db: DatabaseService,
    @Inject(forwardRef(() => AgentService)) private agent: AgentService,
    private embedding: EmbeddingService,
  ) {}

  getHello(): string {
    return 'Hello World!';
  }

  async createResource(props: {
    agentId: string;
    resourceMetadata: string;
    resourceFile: string;
    type: EmbeddingType;
    requiredReputation: bigint;
    usageCost: bigint;
    contributors: `0x${string}`[];
    shares: bigint[];
    isCoreResource: false;
  }) {
    const {
      agentId,
      resourceFile,
      resourceMetadata,
      type,
      requiredReputation = 0n,
      usageCost = 0n,
      contributors = [agentId],
      shares = [100],
    } = props;

    const agent = await this.agent.getAgent({ agentId });

    const privateKey = this.agent.seedToPrivateKey(agent.wallet.seed);

    const wallet = createWalletClient({
      account: privateKeyToAccount(`0x${privateKey}` as `0x${string}`),
      chain: baseSepolia,
      transport: http(),
    });

    const actualCreator = agentId;

    const isCoreResource = false;

    const contract = getContract({
      address: COMMON_RESOURCE_ADDRESS,
      abi: COMMON_RESOURCE_ABI,

      client: wallet,
    });

    const txHash = await contract.write.createResource([
      actualCreator,
      resourceMetadata,
      resourceFile,
      BigInt(requiredReputation),
      BigInt(usageCost),
      contributors,
      shares.map(BigInt),
      isCoreResource,
    ]);

    const receipt = await this.publicClient.waitForTransactionReceipt({
      hash: txHash,
    });
    console.log('createResource txHash:', txHash);

    const log = receipt.logs.find(
      (log) =>
        log.topics[0] ===
        '0xc3d58168c5ae7397731d063d5bbf3d657854427343f4c083240f7aacaa2d0f62',
    );
    console.log('createResource log:', log);
    const id = BigInt(log!.data.slice(2, 64 + 2));

    const resource = this.embedding.create({
      resourceId: id.toString(),
      content: resourceFile,
      type,
    });

    return resource;
  }

  textToDataURLBase64(text: string) {
    const mimeType = 'text/plain'; // MIME type for plain text
    const base64Text = btoa(encodeURIComponent(text));
    return `data:${mimeType};base64,${base64Text}`;
  }

  findResources(props: { query: string; resourceType: EmbeddingType }) {
    const { query, resourceType } = props;
    const resources = this.embedding.find({
      content: query,
      type: resourceType,
    });
    return resources;
  }
}

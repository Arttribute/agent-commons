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
import { AgentService } from '~/agent/agent.service';
import { DatabaseService } from '~/modules/database/database.service';
import { EmbeddingService } from '~/embedding/embedding.service';
import { EmbeddingType, ResourceType } from '~/embedding/dto/embedding.dto';
import { hexToBigInt } from 'viem';
import { eq } from 'drizzle-orm';
import { ToolSchema } from '~/tool/dto/tool.dto';

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
    resourceType: ResourceType;
    embeddingType: EmbeddingType;
    schema?: ToolSchema;
    tags: string[];
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
      resourceType,
      embeddingType,
      schema,
      tags,
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
    const id = hexToBigInt(`0x${log!.data.slice(2, 64 + 2)}`);
    console.log('Resource ID:', id);

    const resource = this.embedding.create({
      resourceId: id.toString(),
      content: resourceFile || 'does not require resource file',
      resourceType: resourceType,
      embeddingType: embeddingType,
      schema,
      tags,
      resourceFile,
    });
    console.log('Resource created:', resource);

    return resource;
  }

  textToDataURLBase64(text: string) {
    const mimeType = 'text/plain'; // MIME type for plain text
    const base64Text = btoa(encodeURIComponent(text));
    return `data:${mimeType};base64,${base64Text}`;
  }

  findResources(props: { query: string; embeddingType: EmbeddingType }) {
    const { query, embeddingType } = props;
    const resources = this.embedding.find({
      content: query,
      embeddingType: embeddingType,
    });
    return resources;
  }

  async getResourceById(resourceId: string) {
    return this.db.query.resource.findFirst({
      where: (r) => eq(r.resourceId, resourceId),
    });
  }
}

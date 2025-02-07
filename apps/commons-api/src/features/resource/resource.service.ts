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
import { AgentService } from '~/features/agent/agent.service';

@Injectable()
export class ResourceService {
  private publicClient = createPublicClient({
    chain: baseSepolia,
    transport: http(),
  });
  constructor(
    @Inject(forwardRef(() => AgentService)) private agent: AgentService,
  ) {}

  getHello(): string {
    return 'Hello World!';
  }

  async createResource(props: {
    agentId: string;
    requiredReputation: bigint;
    usageCost: bigint;
    contributors: `0x${string}`[];
    shares: bigint[];
    isCoreResource: false;
  }) {
    const {
      agentId,
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
    const resourceMetadata =
      'https://coral-abstract-dolphin-257.mypinata.cloud/ipfs/bafkreibpxnfvqblz7x5q3sheky2gme3fcivtb5qroi5cxb32bt4mw4cvpu';
    const resourceFile =
      'https://coral-abstract-dolphin-257.mypinata.cloud/ipfs/bafybeifrq3n5h4onservz3jlcwaeodiy5izwodbxs3ce4z6x5k4i2z4qwy';

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

    await this.publicClient.waitForTransactionReceipt({ hash: txHash });
    console.log('createResource txHash:', txHash);
  }
}

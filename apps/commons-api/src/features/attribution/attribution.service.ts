import { ATTRIBUTION_ABI } from '#/lib/abis/AttributionABI';
import { ATTRIBUTION_ADDRESS } from '#/lib/addresses';
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
export class AttributionService {
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

  async createAttribution(props: {
    agentId: string;
    resourceId: string;
    parentResources: string[];
    relationTypes: string[];
    descriptions: string[];
  }) {
    const {
      agentId,
      resourceId,
      parentResources = [],
      relationTypes = [],
      descriptions = [],
    } = props;

    const agent = await this.agent.getAgent({ agentId });

    const privateKey = this.agent.seedToPrivateKey(agent.wallet.seed);

    const wallet = createWalletClient({
      account: privateKeyToAccount(`0x${privateKey}` as `0x${string}`),
      chain: baseSepolia,
      transport: http(),
    });

    const contract = getContract({
      address: ATTRIBUTION_ADDRESS,
      abi: ATTRIBUTION_ABI,

      client: wallet,
    });

    const txHash = await contract.write.recordAttribution([
      resourceId,
      parentResources,
      relationTypes,
      descriptions,
    ]);

    await this.publicClient.waitForTransactionReceipt({ hash: txHash });
    console.log('recordAttribution txHash:', txHash);
  }
}

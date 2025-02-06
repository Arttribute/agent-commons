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

export interface ResourceTool {
  createResource(props: {
    requiredReputation: number;
    usageCost: number;
    contributors: `0x${string}`[];
    shares: number[];
  }): any;
}

@Injectable()
export class ResourceToolService implements ResourceTool {
  private publicClient = createPublicClient({
    chain: baseSepolia,
    transport: http(),
  });

  constructor(
    @Inject(forwardRef(() => AgentService)) private agentService: AgentService,
  ) {}

  // @ts-expect-error
  async createResource(
    props: {
      requiredReputation: bigint;
      usageCost: bigint;
      contributors: `0x${string}`[];
      shares: bigint[];
    },
    metadata: { agentId: string; privateKey: string },
  ) {
    const wallet = createWalletClient({
      account: privateKeyToAccount(`0x${metadata.privateKey}` as `0x${string}`),
      chain: baseSepolia,
      transport: http(),
    });

    const actualCreator = metadata.agentId;
    const resourceMetadata =
      'https://coral-abstract-dolphin-257.mypinata.cloud/ipfs/bafkreibpxnfvqblz7x5q3sheky2gme3fcivtb5qroi5cxb32bt4mw4cvpu';
    const resourceFile =
      'https://coral-abstract-dolphin-257.mypinata.cloud/ipfs/bafybeifrq3n5h4onservz3jlcwaeodiy5izwodbxs3ce4z6x5k4i2z4qwy';

    const {
      requiredReputation = 0n,
      usageCost = 0n,
      contributors = [],
      shares = [],
    } = props;

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
      BigInt(0),
      BigInt(0),
      [],
      shares.map((_) => BigInt(0)),
      isCoreResource,
    ]);

    await this.publicClient.waitForTransactionReceipt({ hash: txHash });
    console.log('createResource txHash:', txHash);
  }
  catch(err: any) {
    // setError(err.message);
    console.error(err);
  }
}

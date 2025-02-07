import { TASK_MANAGER_ABI } from '#/lib/abis/TaskManagerABI';
import { TASK_MANAGER_ADDRESS } from '#/lib/addresses';
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
export class TaskService {
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

  async createTask(props: {
    agentId: string;
    metadata: string;
    reward: BigInt;
    resourceBased: boolean;
    parentTaskId: BigInt;
    maxParticipants: BigInt;
  }) {
    const {
      agentId,
      metadata,
      reward,
      resourceBased,
      parentTaskId,
      maxParticipants = 1n,
    } = props;

    const agent = await this.agent.getAgent({ agentId });

    const privateKey = this.agent.seedToPrivateKey(agent.wallet.seed);

    const wallet = createWalletClient({
      account: privateKeyToAccount(`0x${privateKey}` as `0x${string}`),
      chain: baseSepolia,
      transport: http(),
    });

    const contract = getContract({
      address: TASK_MANAGER_ADDRESS,
      abi: TASK_MANAGER_ABI,

      client: wallet,
    });

    const txHash = await contract.write.createTask([
      metadata,
      reward,
      resourceBased,
      parentTaskId,
      maxParticipants,
    ]);

    const receipt = await this.publicClient.waitForTransactionReceipt({
      hash: txHash,
    });
    console.log('createTask txHash:', txHash);

    const log = receipt.logs.find(
      (log) =>
        log.topics[0] ===
        '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',
    );

    console.log('createTask log:', log);
    const id = BigInt(log!.data.slice(2, 64 + 2));

    return { id };
  }

  async joinTask(props: { agentId: string; taskId: BigInt }) {
    const { agentId, taskId } = props;

    const agent = await this.agent.getAgent({ agentId });

    const privateKey = this.agent.seedToPrivateKey(agent.wallet.seed);

    const wallet = createWalletClient({
      account: privateKeyToAccount(`0x${privateKey}` as `0x${string}`),
      chain: baseSepolia,
      transport: http(),
    });

    const contract = getContract({
      address: TASK_MANAGER_ADDRESS,
      abi: TASK_MANAGER_ABI,

      client: wallet,
    });

    const txHash = await contract.write.joinTask([taskId]);

    await this.publicClient.waitForTransactionReceipt({ hash: txHash });
    console.log('joinTask txHash:', txHash);

    return {};
  }

  async completeTask(props: {
    agentId: string;
    taskId: BigInt;
    resultantFile: string;
  }) {
    const { agentId, taskId, resultantFile } = props;

    const agent = await this.agent.getAgent({ agentId });

    const privateKey = this.agent.seedToPrivateKey(agent.wallet.seed);

    const wallet = createWalletClient({
      account: privateKeyToAccount(`0x${privateKey}` as `0x${string}`),
      chain: baseSepolia,
      transport: http(),
    });

    const contract = getContract({
      address: TASK_MANAGER_ADDRESS,
      abi: TASK_MANAGER_ABI,

      client: wallet,
    });

    const txHash = await contract.write.completeTask([taskId, resultantFile]);

    const receipt = await this.publicClient.waitForTransactionReceipt({
      hash: txHash,
    });
    console.log('completeTask txHash:', txHash);

    return {};
  }
}

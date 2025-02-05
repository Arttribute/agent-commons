import * as schema from '#/models/schema';
import { Injectable } from '@nestjs/common';
import { InferInsertModel, InferSelectModel } from 'drizzle-orm';
import ethers from 'ethers';
import { first, map } from 'lodash';
import { ChatCompletionTool } from 'openai/resources/chat/completions';
import { CoinbaseService } from '~/modules/coinbase/coinbase.service';
import { DatabaseService } from '~/modules/database/database.service';
import { OpenAIService } from '~/modules/openai/openai.service';
import { Except } from 'type-fest';
import typia from 'typia';
import { AGENT_REGISTRY_ABI } from 'lib/abis/AgentRegistryABI';
import { AGENT_REGISTRY_ADDRESS } from 'lib/addresses';
import { EthereumTool } from '../tool/tools/ethereum-tool.service';

const app = typia.llm.application<EthereumTool, 'chatgpt'>();

@Injectable()
export class AgentService {
  constructor(
    private db: DatabaseService,
    private openAI: OpenAIService,
    private coinbase: CoinbaseService,
  ) {}

  async createAgent(props: {
    value: Except<InferInsertModel<typeof schema.agent>, 'wallet' | 'agentId'>;
    commonsOwned?: boolean;
  }) {
    const wallet = await this.coinbase.createDeveloperManagedWallet();
    await wallet.faucet();

    const agentEntry = this.db
      .insert(schema.agent)
      .values({
        ...props.value,
        agentId: (await wallet.getDefaultAddress())?.toString(),
        wallet: wallet.export(),
      })
      .returning()
      .then(first<InferSelectModel<typeof schema.agent>>);

    if (props.commonsOwned) {
      const rpcUrl = 'https://sepolia.base.org';
      const provider = new ethers.JsonRpcProvider(rpcUrl);
      const commonsWallet = new ethers.Wallet(
        process.env.WALLET_PRIVATE_KEY!,
        provider,
      );
      // createWalletClient({});
      const contract = new ethers.Contract(
        AGENT_REGISTRY_ADDRESS,
        AGENT_REGISTRY_ABI,
        commonsWallet,
      );

      const metadata =
        'https://coral-abstract-dolphin-257.mypinata.cloud/ipfs/bafkreiewjk5fizidkxejplpx34fjva7f6i6azcolanwgtzptanhre6twui';

      const isCommonAgent = true;

      const tx = await contract.registerAgent(
        (await wallet.getDefaultAddress())?.toString(),
        metadata,
        isCommonAgent,
      );
      await tx.wait();
    }

    return agentEntry;
  }

  triggerAgent() {
    this.runAgent({});
  }

  async runAgent(props: { messages?: [] }) {
    // Get the agent

    // Check if the agent has tokens

    // cron: triggerAgent(id: string)

    const response = await this.openAI.chat.completions.create({
      messages: [{ role: 'system', content: 'You are a helpful assistant.' }], // Get from db
      tools: map(
        app.functions,
        (_) =>
          ({
            type: 'function',
            function: _,
          }) as unknown as ChatCompletionTool,
      ),
      model: 'gpt-4o-mini',
    });
  }
}

import * as schema from '#/models/schema';
import { BadRequestException, Injectable } from '@nestjs/common';
import { eq, InferInsertModel, InferSelectModel } from 'drizzle-orm';
import * as ethers from 'ethers';
import { first, map, toSafeInteger } from 'lodash';
import { ChatCompletionTool } from 'openai/resources/chat/completions';
import { CoinbaseService } from '~/modules/coinbase/coinbase.service';
import { DatabaseService } from '~/modules/database/database.service';
import { OpenAIService } from '~/modules/openai/openai.service';
import { Except } from 'type-fest';
import typia from 'typia';
import { AGENT_REGISTRY_ABI } from 'lib/abis/AgentRegistryABI';
import { AGENT_REGISTRY_ADDRESS, COMMON_TOKEN_ADDRESS } from 'lib/addresses';
import { EthereumTool } from '../tool/tools/ethereum-tool.service';
import dedent from 'dedent';
import { baseSepolia } from '#/lib/baseSepolia';
import {
  createWalletClient,
  custom,
  parseUnits,
  http,
  Transaction,
} from 'viem';
import { Coinbase, Wallet } from '@coinbase/coinbase-sdk';

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
    const faucetTx = await wallet.faucet();
    await faucetTx.wait();

    const agentEntry = this.db
      .insert(schema.agent)
      .values({
        ...props.value,
        agentId: (await wallet.getDefaultAddress())?.getId().toLowerCase(),
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
        (await wallet.getDefaultAddress())?.getId(),
        metadata,
        isCommonAgent,
      );
      await tx.wait();
    }

    return agentEntry;
  }

  triggerAgent(props: { agentId: string }) {
    this.runAgent({ agentId: props.agentId });
  }

  async purchaseCommons(props: { agentId: string; amountInCommon: string }) {
    const { agentId, amountInCommon } = props;
    const agent = await this.db.query.agent.findFirst({
      where: (t) => eq(t.agentId, agentId),
    });

    if (!agent) {
      throw new BadRequestException('Agent not found');
    }

    const wallet = await Wallet.import(agent.wallet);

    const amountInWei = BigInt(parseUnits(amountInCommon, 18)) / 100000n;

    // const tx = await wallet.createTransfer({
    //   amount: amountInWei,
    //   destination: COMMON_TOKEN_ADDRESS.toLowerCase(),
    //   assetId: Coinbase.assets.Wei,
    //   gasless: false,
    // });

    await createWalletClient({
      transport: http(baseSepolia.rpcUrls.default.http[0]),
      chain: baseSepolia,
    }).sendTransaction({
      to: COMMON_TOKEN_ADDRESS.toLowerCase() as `0x${string}`,
      value: amountInWei,
      account: (await wallet.getDefaultAddress())!
        .getId()
        .toLowerCase() as `0x${string}`,
      chain: undefined,
      // chain: baseSepolia,
      // assetId: Coinbase.assets.Wei,

      // gasless: false,
    });
  }

  async runAgent(props: { agentId: string; messages?: [] }) {
    const { agentId } = props;

    const agent = await this.db.query.agent.findFirst({
      where: (t) => eq(t.agentId, agentId),
    });

    if (!agent) {
      throw new BadRequestException('Agent not found');
    }

    // Get the agent

    // Check if the agent has tokens

    const wallet = await Wallet.import(agent.wallet);

    await this.purchaseCommons({ agentId, amountInCommon: '10' });

    const commonsBalance = await wallet.getBalance(COMMON_TOKEN_ADDRESS);

    console.log(commonsBalance);

    // cron: triggerAgent(id: string)

    const response = await this.openAI.chat.completions.create({
      messages: [
        {
          role: 'system',
          content: dedent`The following is the persona you are meant to adopt:
        ${agent.persona}

        The following are the instructions you are meant to follow:
        ${agent.instructions}
        `,
        },
        ...(props.messages || []),
      ], // Get from db
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

    return response.choices[0].message;
  }
}

import { baseSepolia } from '#/lib/baseSepolia';
import * as schema from '#/models/schema';
import { Wallet } from '@coinbase/coinbase-sdk';
import {
  BadRequestException,
  forwardRef,
  Inject,
  Injectable,
} from '@nestjs/common';
import { HDKey } from '@scure/bip32';
import crypto from 'crypto';
import dedent from 'dedent';
import { eq, InferInsertModel, InferSelectModel } from 'drizzle-orm';
import { AGENT_REGISTRY_ABI } from 'lib/abis/AgentRegistryABI';
import { AGENT_REGISTRY_ADDRESS, COMMON_TOKEN_ADDRESS } from 'lib/addresses';
import { first, map, omit } from 'lodash';
import {
  ChatCompletion,
  ChatCompletionCreateParamsNonStreaming,
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from 'openai/resources/chat/completions';
import { Except } from 'type-fest';
import typia from 'typia';
import {
  createPublicClient,
  createWalletClient,
  getContract,
  http,
  parseUnits,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { CoinbaseService } from '~/modules/coinbase/coinbase.service';
import { DatabaseService } from '~/modules/database/database.service';
import { OpenAIService } from '~/modules/openai/openai.service';
import {
  EthereumTool,
  EthereumToolService,
} from '../tool/tools/ethereum-tool.service';
import {
  CommonTool,
  CommonToolService,
} from '../tool/tools/common-tool.service';

const app = typia.llm.application<EthereumTool & CommonTool, 'chatgpt'>();

@Injectable()
export class AgentService {
  private publicClient = createPublicClient({
    chain: baseSepolia,
    transport: http(),
  });
  constructor(
    private db: DatabaseService,
    private openAI: OpenAIService,
    private coinbase: CoinbaseService,

    @Inject(forwardRef(() => EthereumToolService))
    private ethereumToolService: EthereumToolService,
    @Inject(forwardRef(() => CommonToolService))
    private commonToolService: CommonToolService,
  ) {}

  async createAgent(props: {
    value: Except<InferInsertModel<typeof schema.agent>, 'wallet' | 'agentId'>;
    commonsOwned?: boolean;
  }) {
    const wallet = await this.coinbase.createDeveloperManagedWallet();
    const faucetTx = await wallet.faucet();
    await faucetTx.wait();

    const agentId = (await wallet.getDefaultAddress())?.getId().toLowerCase();

    const agentEntry = this.db
      .insert(schema.agent)
      .values({
        ...props.value,
        agentId,
        wallet: wallet.export(),
      })
      .returning()
      .then(first<InferSelectModel<typeof schema.agent>>);

    if (props.commonsOwned) {
      const commonsWallet = createWalletClient({
        account: privateKeyToAccount(
          process.env.WALLET_PRIVATE_KEY! as `0x${string}`,
        ),
        chain: baseSepolia,
        transport: http(),
      });

      const contract = getContract({
        abi: AGENT_REGISTRY_ABI,
        address: AGENT_REGISTRY_ADDRESS,

        client: commonsWallet,
      });

      const metadata =
        'https://coral-abstract-dolphin-257.mypinata.cloud/ipfs/bafkreiewjk5fizidkxejplpx34fjva7f6i6azcolanwgtzptanhre6twui';

      const isCommonAgent = true;

      const txHash = await contract.write.registerAgent([
        agentId,
        metadata,
        isCommonAgent,
      ]);

      await this.publicClient.waitForTransactionReceipt({ hash: txHash });
    }

    return agentEntry;
  }

  async getAgent(props: { agentId: string }) {
    const agent = await this.db.query.agent.findFirst({
      where: (t) => eq(t.agentId, props.agentId),
    });

    if (!agent) {
      throw new BadRequestException('Agent not found');
    }

    return agent;
  }

  triggerAgent(props: { agentId: string }) {
    this.runAgent({ agentId: props.agentId });
  }

  public seedToPrivateKey(seed: string) {
    const seedBuffer = Buffer.from(seed, 'hex');
    const hmac = crypto.createHmac('sha512', 'Bitcoin seed');
    hmac.update(seedBuffer);

    const node = HDKey.fromMasterSeed(seedBuffer);
    const childNode = node.derive("m/44'/60'/0'/0/0"); // Standard Ethereum path
    const privateKey = Buffer.from(childNode.privateKey!).toString('hex');
    return privateKey;
  }

  async purchaseCommons(props: { agentId: string; amountInCommon: string }) {
    const { agentId, amountInCommon } = props;
    const agent = await this.db.query.agent.findFirst({
      where: (t) => eq(t.agentId, agentId),
    });

    if (!agent) {
      throw new BadRequestException('Agent not found');
    }

    const amountInWei = BigInt(parseUnits(amountInCommon, 18)) / 100000n;

    // Hack to get transaction to work
    // Since transaction on CDP had limited gas, transaction was always failing
    // Needed to use another provider to send the transaction

    const privateKey = this.seedToPrivateKey(agent.wallet.seed);

    const wallet = createWalletClient({
      account: privateKeyToAccount(`0x${privateKey}` as `0x${string}`),
      chain: baseSepolia,
      transport: http(),
    });
    const txHash = await wallet.sendTransaction({
      to: COMMON_TOKEN_ADDRESS.toLowerCase() as `0x${string}`,
      value: amountInWei,
      chain: undefined,
    });

    await this.publicClient.waitForTransactionReceipt({ hash: txHash });
  }

  async checkCommonsBalance(props: { agentId: string }) {
    const { agentId } = props;

    const agent = await this.db.query.agent.findFirst({
      where: (t) => eq(t.agentId, agentId),
    });

    if (!agent) {
      throw new BadRequestException('Agent not found');
    }

    const wallet = await Wallet.import(agent.wallet);
    const commonsBalance = await wallet.getBalance(COMMON_TOKEN_ADDRESS);

    return commonsBalance.toNumber();
  }

  async runAgent(props: {
    agentId: string;
    messages?: ChatCompletionMessageParam[];
  }) {
    const { agentId } = props;

    const agent = await this.db.query.agent.findFirst({
      where: (t) => eq(t.agentId, agentId),
    });

    if (!agent) {
      throw new BadRequestException('Agent not found');
    }

    // Check if the agent has tokens

    const wallet = await Wallet.import(agent.wallet).catch((e) => {
      console.log(e);
      throw e;
    });
    const privateKey = this.seedToPrivateKey(agent.wallet.seed);

    const commonsBalance = await wallet.getBalance(COMMON_TOKEN_ADDRESS);

    if (commonsBalance.lte(0)) {
      throw new BadRequestException('Agent has no tokens');
    }

    console.log(commonsBalance);

    const messages: ChatCompletionMessageParam[] = [
      {
        role: 'system',
        content: dedent`You are the following agent:
      ${JSON.stringify(omit(agent, ['instructions', 'persona', 'wallet']))}
      Use any tools nessecary to get information in order to perform the task.

      The following is the persona you are meant to adopt:
      ${agent.persona}

      The following are the instructions you are meant to follow:
      ${agent.instructions}`,
      },
      ...(props.messages || []),
    ];

    const tools = map(
      app.functions,
      (_) =>
        ({
          type: 'function',
          function: _,
        }) as unknown as ChatCompletionTool,
    );

    console.log(app.functions[0]);

    let chatGPTResponse: ChatCompletion;
    // let sessionId: string | undefined = body.sessionId;

    const prompt: ChatCompletionCreateParamsNonStreaming = {
      messages,
      tools,
      tool_choice: 'auto',
      parallel_tool_calls: true,
      model: 'gpt-4o-mini',
    };

    do {
      // Execute the tools
      console.log('Prompt', prompt);
      chatGPTResponse = await this.openAI.chat.completions.create(prompt);

      const toolCalls = chatGPTResponse.choices[0].message.tool_calls;

      if (toolCalls?.length) {
        await Promise.all(
          toolCalls.map(async (toolCall) => {
            if (toolCall.type === 'function') {
              const args = JSON.parse(toolCall.function.arguments);
              const metadata = { agentId, privateKey };

              console.log('Tool Call', { toolCall, toolCallArgs: args });

              const toolWithMethod = [
                this.commonToolService,
                this.ethereumToolService,
                // @ts-expect-error
              ].find((tool) => tool[toolCall.function.name]);

              // console.log('Tool with method', toolWithMethod);

              // @ts-expect-error
              const data = await toolWithMethod[toolCall.function.name](
                args,
                metadata,
              );

              prompt.messages.push(chatGPTResponse.choices[0].message);

              prompt.messages.push({
                // append result message
                role: 'tool',
                tool_call_id: toolCall.id,
                content: JSON.stringify(data),
              });

              return data;
            }
            return null;
          }),
        );
      }
    } while (chatGPTResponse.choices[0].message.tool_calls?.length);

    // Charge for running the agent

    const tx = await wallet.createTransfer({
      amount: 1,
      assetId: COMMON_TOKEN_ADDRESS,
      destination: '0xd9303dfc71728f209ef64dd1ad97f5a557ae0fab',
    });

    await tx.wait();

    return chatGPTResponse.choices[0].message;
  }
  //get agent by id
  async getAgentById(agentId: string) {
    const agent = await this.db.query.agent.findFirst({
      where: (t) => eq(t.agentId, agentId),
    });
    if (!agent) {
      throw new BadRequestException('Agent not found');
    }
    return agent;
  }

  //get all agents
  async getAgents() {
    const agents = await this.db.query.agent.findMany();
    return agents;
  }
}

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
import { find, first, map, omit } from 'lodash';
import {
  ChatCompletion,
  ChatCompletionCreateParams,
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
import { name } from 'typia/lib/reflect';
import { SessionService } from '~/session/session.service';

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
    private session: SessionService,
  ) {}

  async createAgent(props: {
    value: Except<InferInsertModel<typeof schema.agent>, 'wallet' | 'agentId'>;
    commonsOwned?: boolean;
  }) {
    const wallet = await this.coinbase.createDeveloperManagedWallet();
    const faucetTx = await wallet.faucet();
    await faucetTx.wait();

    const agentId = (await wallet.getDefaultAddress())?.getId().toLowerCase();
    let agentOwner = '0xD9303DFc71728f209EF64DD1AD97F5a557AE0Fab';
    if (!props.commonsOwned) {
      agentOwner = props.value.owner as string;
    }

    const agentEntry = this.db
      .insert(schema.agent)
      .values({
        ...props.value,
        agentId,
        owner: agentOwner,
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

  private async createAgentSession(agentId: string) {
    const agent = await this.db.query.agent.findFirst({
      where: (t) => eq(t.agentId, agentId),
    });

    if (!agent) {
      throw new BadRequestException('Agent not found');
    }

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
      // ...(props.messages || []),
    ];

    const tools = map(
      app.functions,
      (_) =>
        ({
          type: 'function',
          function: _,
          endpoint: `http://localhost:${process.env.PORT}/v1/agents/tools`, // should be a self endpoint
        }) as unknown as ChatCompletionTool & { endpoint: string },
    );

    const completionBody: ChatCompletionCreateParams = {
      messages,
      // ...body,
      tools,
      tool_choice: 'auto',
      parallel_tool_calls: true,
      model: 'gpt-4o-mini',
    };

    const session = await this.session.createSession({
      value: { query: completionBody },
    });
    return session;
  }

  async runAgent(props: {
    agentId: string;
    messages?: ChatCompletionMessageParam[];
    sessionId?: string;
  }) {
    const { agentId, sessionId } = props;

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

    const commonsBalance = await wallet.getBalance(COMMON_TOKEN_ADDRESS);

    if (commonsBalance.lte(0)) {
      throw new BadRequestException('Agent has no tokens');
    }

    console.log(commonsBalance);

    let session;
    if (!sessionId) {
      session = await this.createAgentSession(agentId);
    } else {
      session = await this.session.getSession({ id: sessionId });
    }

    const completionBody: ChatCompletionCreateParamsNonStreaming = {
      ...(session?.query as ChatCompletionCreateParamsNonStreaming),
      model: 'gpt-4o-mini',
    };

    completionBody.messages = completionBody.messages.concat(
      props.messages || [],
    );

    console.log(app.functions[0]);

    const tools = map(
      app.functions,
      (_) =>
        ({
          type: 'function',
          function: _,
          endpoint: `http://localhost:${process.env.PORT}/v1/agents/tools`, // should be a self endpoint
        }) as unknown as ChatCompletionTool & { endpoint: string },
    );

    let chatGPTResponse: ChatCompletion;
    // let sessionId: string | undefined = body.sessionId;

    do {
      // Execute the tools
      console.log('Prompt', completionBody);
      chatGPTResponse =
        await this.openAI.chat.completions.create(completionBody);

      const toolCalls = chatGPTResponse.choices[0].message.tool_calls;

      completionBody.messages.push(chatGPTResponse.choices[0].message);

      if (toolCalls?.length) {
        console.log('Tool Calls', toolCalls);
        await Promise.all(
          toolCalls.map(async (toolCall) => {
            if (toolCall.type === 'function') {
              const args = JSON.parse(toolCall.function.arguments);
              const metadata = { agentId };

              console.log('Tool Call', { toolCall, toolCallArgs: args });

              const rawToolCall = find(tools, {
                function: { name: toolCall.function.name },
              });

              if (!rawToolCall?.endpoint) {
                throw new BadRequestException('Tool endpoint not found');
              }

              const response = await fetch(rawToolCall?.endpoint, {
                method: 'POST',
                body: JSON.stringify({ toolCall, metadata }),
                headers: {
                  'Content-Type': 'application/json',
                },
              });

              const toolCallResponse = await response.json();

              completionBody.messages.push({
                // append result message
                role: 'tool',
                tool_call_id: toolCall.id,
                content: JSON.stringify(toolCallResponse),
              });

              return toolCallResponse;
            }
            return null;
          }),
        );
      }

      await this.session.updateSession({
        id: session!.sessionId,
        delta: { query: completionBody },
      });
    } while (chatGPTResponse.choices[0].message.tool_calls?.length);

    // Charge for running the agent

    const tx = await wallet.createTransfer({
      amount: 1,
      assetId: COMMON_TOKEN_ADDRESS,
      destination: '0xd9303dfc71728f209ef64dd1ad97f5a557ae0fab',
    });

    await tx.wait();

    return {
      ...chatGPTResponse.choices[0].message,
      sessionId: session?.sessionId,
    };
  }

  /**
   * Update an existing agent
   */
  async updateAgent(
    agentId: string,
    updateData: Partial<InferSelectModel<typeof schema.agent>>,
  ) {
    // 1) Ensure agent exists
    const existingAgent = await this.db.query.agent.findFirst({
      where: (t) => eq(t.agentId, agentId),
    });
    if (!existingAgent) {
      throw new BadRequestException('Agent not found');
    }

    // 2) Update record
    // Omit fields that are not allowed to be updated or are sensitive
    const allowedUpdates = omit(updateData, ['wallet', 'agentId', 'createdAt']);
    const [updated] = await this.db
      .update(schema.agent)
      .set(allowedUpdates)
      .where(eq(schema.agent.agentId, agentId))
      .returning();
    return updated;
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

  // Return agents by owner
  async getAgentsByOwner(owner: string) {
    return this.db.query.agent.findMany({
      where: (t) => eq(t.owner, owner),
    });
  }
}

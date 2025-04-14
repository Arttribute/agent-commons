import { baseSepolia } from '#/lib/baseSepolia';
import * as schema from '#/models/schema';
import { Wallet } from '@coinbase/coinbase-sdk';
import { tool } from '@langchain/core/tools';
import {
  END,
  Messages,
  MessagesAnnotation,
  START,
  StateGraph,
} from '@langchain/langgraph';
import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres';
import { ToolNode } from '@langchain/langgraph/prebuilt';
import { ChatOpenAI } from '@langchain/openai';
import { BadRequestException, Injectable, OnModuleInit } from '@nestjs/common';
import { HDKey } from '@scure/bip32';
import crypto from 'crypto';
import dedent from 'dedent';
import {
  eq,
  and,
  InferInsertModel,
  InferSelectModel,
  inArray,
  sql,
} from 'drizzle-orm';
import { AGENT_REGISTRY_ABI } from 'lib/abis/AgentRegistryABI';
import { AGENT_REGISTRY_ADDRESS, COMMON_TOKEN_ADDRESS } from 'lib/addresses';
import { compact, find, first, get, map, omit } from 'lodash';
import {
  ChatCompletionCreateParams,
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from 'openai/resources/chat/completions';
import { Except } from 'type-fest';
import typia from 'typia';
import { v4 } from 'uuid';
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
import { SessionService } from '~/session/session.service';
import { ToolService } from '~/tool/tool.service';
import { CommonTool } from '../tool/tools/common-tool.service';
import { EthereumTool } from '../tool/tools/ethereum-tool.service';
import { LangChainCallbackHandler } from '@posthog/ai';
import { IChatGptSchema } from '@samchon/openapi';
import { inspect } from 'util';
import { getPosthog } from '~/helpers/posthog';
import { LogService } from '~/log/log.service';
const got = import('got');

const app = typia.llm.application<EthereumTool & CommonTool, 'chatgpt'>();

@Injectable()
export class AgentService implements OnModuleInit {
  private publicClient = createPublicClient({
    chain: baseSepolia,
    transport: http(),
  });
  constructor(
    private db: DatabaseService,
    private openAI: OpenAIService,
    private coinbase: CoinbaseService,
    private session: SessionService,
    private toolService: ToolService,
    private logService: LogService,
  ) {}

  async onModuleInit() {
    const checkpointer = PostgresSaver.fromConnString(
      `postgresql://${process.env.POSTGRES_USER}:${process.env.POSTGRES_PASSWORD}@${process.env.POSTGRES_HOST}:${process.env.POSTGRES_PORT}/${process.env.POSTGRES_DATABASE}`,
    );

    await checkpointer.setup();
  }

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

    const agentEntry = await this.db
      .insert(schema.agent)
      .values({
        ...props.value,
        agentId,
        owner: agentOwner,
        wallet: wallet.export(),
        isLiaison: false,
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

    // TODO: Work on interval
    // @ts-expect-error
    const interval = props.interval || 10;

    await this.db.execute(
      sql`SELECT cron.schedule(FORMAT('agent:%s:schedule', ${agentEntry?.agentId}),'*/${interval} * * * *', FORMAT('SELECT trigger_agent(%L)', ${agentEntry?.agentId}))`,
    );

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

  async triggerAgent(props: { agentId: string }) {
    // if agent should run

    // Check if agent should run

    // cronId = cron(*/5 * * * * *, SELECT triggerAgent("agentId"))

    return await this.runAgent({ agentId: props.agentId });
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

  async transferTokensToWallet(props: {
    agentId: string;
    address: string;
    amount: number;
  }) {
    const { agentId, address, amount } = props;

    const agent = await this.db.query.agent.findFirst({
      where: (t) => eq(t.agentId, agentId),
    });

    if (!agent) {
      throw new BadRequestException('Agent not found');
    }

    const wallet = await Wallet.import(agent.wallet).catch((e) => {
      console.log(e);
      throw e;
    });

    const tx = await wallet.createTransfer({
      amount,
      assetId: COMMON_TOKEN_ADDRESS,
      destination: address,
    });

    await tx.wait();
    const commonsBalance = await wallet.getBalance(COMMON_TOKEN_ADDRESS);

    return { balance: commonsBalance.toNumber(), txHash: tx };
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
      Use any tools necessary to get information in order to perform the task.
      Ensure that the arguments provided to the tools are correct and as accurate as possible.

      The following is the persona you are meant to adopt:
      ${agent.persona}

      The following are the instructions you are meant to follow:
      ${agent.instructions}`,
      },
      // ...(props.messages || []),
    ];

    // 3) Retrieve all dynamic tools from DB

    const storedTools = await this.toolService.getAllTools();

    // 4) Convert them to ChatCompletionTool array

    //(B) Resource-based tools -> find by resourceId in agent.common_tools
    const resourceIds = agent.commonTools ?? [];
    console.log('Resource IDs', resourceIds);
    const resourceTools = await this.db.query.resource.findMany({
      where: (r) => inArray(r.resourceId, resourceIds),
    });
    console.log('Resource Tools', resourceTools);
    const resourceBasedTools = resourceTools
      .filter((res) => !!res.schema) // must have `schema`
      .map((res) => {
        const toolSchema = res.schema as ChatCompletionTool;
        // We'll rename the function for uniqueness:
        const resourceFunctionName = `resourceTool_${res.resourceId}`;
        return {
          type: 'function' as const,
          function: { ...toolSchema, name: resourceFunctionName },
          endpoint: `http://localhost:${process.env.PORT}/v1/agents/tools`,
        };
      });
    console.log('Resource-based tools', resourceBasedTools);

    const dynamicTools = storedTools.map((dbTool) => ({
      type: 'function' as const,
      function: { ...dbTool.schema, name: dbTool.name },
      endpoint: `http://localhost:${process.env.PORT}/v1/agents/tools`,
    }));

    console.log('Dynamic tools', dynamicTools);
    const staticTools = map(
      app.functions,
      (_) =>
        ({
          type: 'function',
          function: _,
          endpoint: `http://localhost:${process.env.PORT}/v1/agents/tools`, // should be a self endpoint
        }) as unknown as ChatCompletionTool & { endpoint: string },
    );

    const tools = [...dynamicTools, ...resourceBasedTools, ...staticTools];

    const completionBody: ChatCompletionCreateParams = {
      messages,
      // ...body,
      tools,
      tool_choice: 'auto',
      parallel_tool_calls: true,
      model: 'gpt-4o-mini',
    };

    return completionBody;

    // const session = await this.session.createSession({
    //   value: { query: completionBody },
    // });
    // return session;
  }

  async runAgent(props: {
    agentId: string;
    messages?: ChatCompletionMessageParam[];
    sessionId?: string;
  }) {
    const startTime = performance.now();
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

    const checkpointer = PostgresSaver.fromConnString(
      `postgresql://${process.env.POSTGRES_USER}:${process.env.POSTGRES_PASSWORD}@${process.env.POSTGRES_HOST}:${process.env.POSTGRES_PORT}/${process.env.POSTGRES_DATABASE}`,
    );

    const llm = new ChatOpenAI({
      model: 'gpt-4o-mini',
      temperature: 0,
      supportsStrictToolCalling: true,
      apiKey: process.env.OPENAI_API_KEY,
    });

    // 3) Retrieve all dynamic tools from DB
    const storedTools = await this.toolService.getAllTools();
    //console.log('Stored tools', storedTools);
    // 4) Convert them to ChatCompletionTool array
    const dynamicTools = storedTools.map(
      (dbTool) =>
        ({
          type: 'function' as const,
          function: { ...dbTool.schema, name: dbTool.name },
          endpoint: `http://localhost:${process.env.PORT}/v1/agents/tools`,
        }) as ChatCompletionTool & { endpoint: string },
    );

    //(B) Resource-based tools -> find by resourceId in agent.common_tools
    const resourceIds = agent.commonTools ?? [];
    const resourceTools = await this.db.query.resource.findMany({
      where: (r) => inArray(r.resourceId, resourceIds),
    });
    console.log('Resource Tools', resourceTools);
    const resourceBasedTools = resourceTools
      .filter((res) => !!res.schema) // must have `schema`
      .map((res) => {
        const toolSchema = res.schema as ChatCompletionTool;
        // We'll rename the function for uniqueness:
        const resourceFunctionName = `resourceTool_${res.resourceId}`;
        return {
          type: 'function' as const,
          function: { ...toolSchema, name: resourceFunctionName },
          endpoint: `http://localhost:${process.env.PORT}/v1/agents/tools`,
        } as ChatCompletionTool & { endpoint: string };
      });

    console.log('Resource-based tools', resourceBasedTools);

    // const tools = [...dynamicTools, ...resourceBasedTools, ...staticTools];

    let toolDefinitions = app.functions.map((_) => {
      // @ts-expect-error
      return {
        type: 'function' as const,
        function: _,
        endpoint: `http://localhost:${process.env.PORT}/v1/agents/tools`, // should be a self endpoint
      } as ChatCompletionTool & { endpoint: string };
    });
    let toolRunners = map(app.functions, (_) => {
      return tool(
        async (args, config) => {
          const data = await got.then((_) =>
            _.got
              .post(`http://localhost:${process.env.PORT}/v1/agents/tools`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                json: {
                  args,
                  config: omit(config, ['configurable']),
                  toolCall: config.toolCall,
                  metadata: { agentId },
                },
              })
              .json<any>()
              .catch((e: typeof _.HTTPError) => {
                if (e instanceof _.HTTPError) {
                  // console.log(e);
                  console.log(e.response.body);
                }
                throw e;
              }),
          );

          return { toolData: data };
        },
        { schema: _.parameters, name: _.name, description: _.description },
      );
    });
    // tools = app.functions

    const additionalTools = [...dynamicTools, ...resourceBasedTools];

    toolDefinitions = toolDefinitions.concat(...additionalTools);

    const toolUsage: Array<{
      name: string;
      status: string;
      summary?: string;
      duration?: number;
    }> = [];

    toolRunners = toolRunners.concat(
      map(additionalTools, (_) => {
        // console.log({ function: inspect(_, { depth: null }) });
        return tool(
          async (args, config) => {
            // const toolCall: ChatCompletionMessageToolCall
            const functionName = config.toolCall?.function?.name;
            const callStart = performance.now();
            const data = await got
              .then((_) =>
                _.got
                  .post(
                    `http://localhost:${process.env.PORT}/v1/agents/tools`,
                    {
                      method: 'POST',
                      headers: {
                        'Content-Type': 'application/json',
                      },
                      json: {
                        args,
                        config: omit(config, ['configurable']),
                        toolCall: config.toolCall,
                        metadata: { agentId },
                      },
                    },
                  )
                  .json<any>()
                  .catch((e: typeof _.HTTPError) => {
                    if (e instanceof _.HTTPError) {
                      // console.log(e);
                      console.log(e.response.body);
                    }
                    throw e;
                  }),
              )
              .then((_) => {
                toolUsage.push({
                  name: functionName,
                  status: 'success',
                  summary: `Executed ${functionName}`,
                  duration: performance.now() - callStart,
                });

                return _;
              })
              .catch((_) => {
                toolUsage.push({
                  name: functionName,
                  status: 'error',
                  summary: 'Error executing tool',
                  duration: performance.now() - callStart,
                });
                throw _;
              });

            return { toolData: data };
          },
          {
            schema: _.function.parameters,
            name: _.function.name,
            description: _.function.description,
          },
        ) as any;
      }),
    );

    // Find a way to use tools from other services
    // console.log(toolDefinitions);
    let toolNode = new ToolNode(toolRunners);
    const strict = false;
    let llmWithTools = llm.bindTools(toolDefinitions, {
      parallel_tool_calls: true,
      strict,
      recursionLimit: 5,
    });

    const conversationId = v4();

    const posthogCallback = new LangChainCallbackHandler({
      client: getPosthog(),
      // distinctId: 'user_123', // optional
      // traceId: 'trace_456', // optional
      properties: { conversationId }, // optional
      // groups: { company: 'company_id_in_your_db' }, // optional
      privacyMode: false, // optional
      debug: false, // optional - when true, logs all events to console
    });

    // Define the function that calls the model
    const callModel = async (state: typeof MessagesAnnotation.State) => {
      // llmWithTools.
      const llmResponse = await llmWithTools.invoke(state.messages, {
        callbacks: [posthogCallback],
      });
      return { messages: llmResponse };
    };

    const shouldContinue = (state: typeof MessagesAnnotation.State) => {
      const { messages } = state;
      const lastMessage = messages[messages.length - 1];

      if (
        'tool_calls' in lastMessage &&
        Array.isArray(lastMessage.tool_calls) &&
        lastMessage.tool_calls?.length
      ) {
        return 'tools';
      }
      return END;
    };

    const updateTools = async (state: typeof MessagesAnnotation.State) => {
      // Check if got a resource that has a tool
      // Find resource
      const lastMassageContent = state.messages.at(-1)?.content;
      if (typeof lastMassageContent == 'string') {
        let toolContent;

        try {
          toolContent = JSON.parse(lastMassageContent);
        } catch (err) {
          return 'model';
        }

        const toolData = Array.isArray(toolContent.toolData)
          ? toolContent.toolData
          : [toolContent.toolData];

        toolRunners.push(
          ...toolData
            .filter((_: any) => 'schema' in _ && _.schema)
            .map((_: any) => {
              const { schema } = _;

              console.log('Added tool from response of tool call', schema.name);

              return tool(
                async (args, config) => {
                  const functionName = config.toolCall?.function?.name;
                  const callStart = performance.now();
                  const data = await got
                    .then((_) =>
                      _.got
                        .post(schema.endpoint, {
                          method: 'POST',
                          headers: {
                            'Content-Type': 'application/json',
                          },
                          json: {
                            // args,
                            toolCall: config.toolCall,
                            // config: omit(config, ['configurable']),
                            metadata: { agentId },
                          },
                        })
                        .json<any>()
                        .catch((e: typeof _.HTTPError) => {
                          if (e instanceof _.HTTPError) {
                            // console.log(e);
                            console.log(e.response.body);
                          }
                          throw e;
                        }),
                    )
                    .then((_) => {
                      toolUsage.push({
                        name: functionName,
                        status: 'success',
                        summary: `Executed ${functionName}`,
                        duration: performance.now() - callStart,
                      });

                      return _;
                    })
                    .catch((_) => {
                      toolUsage.push({
                        name: functionName,
                        status: 'error',
                        summary: 'Error executing tool',
                        duration: performance.now() - callStart,
                      });
                      throw _;
                    });

                  return { toolData: data };
                },
                {
                  name: `resourceTool_${_.resourceId}`,
                  description: schema.description,
                  schema: schema.parameters as IChatGptSchema.IParameters,
                },
              );
            }),
        );
        toolDefinitions.push(
          ...toolData
            .filter((_: any) => 'schema' in _ && _.schema)
            .map((_: any) => ({
              type: 'function' as const,
              function: { ..._.schema, name: `resourceTool_${_.resourceId}` },
              endpoint: `http://localhost:${process.env.PORT}/v1/agents/tools`,
            })),
        );

        toolNode = new ToolNode(toolRunners);
        llmWithTools = llm.bindTools(toolDefinitions, {
          parallel_tool_calls: true,
          strict,
          recursionLimit: 5,
        });
      }

      // Condition to check if content has tool call attached
      // toolContent.toolData.jsonSchema

      // Create new tools for langchain
      // tools.push(tool())

      // model({messgaes: [toolContent], tools: tools + newTools}) => make

      return 'model';
    };

    // Define a new graph
    const workflow = new StateGraph(MessagesAnnotation)
      // Define the node and edge
      .addNode('model', callModel)
      .addNode('tools', toolNode)
      .addEdge(START, 'model')
      .addConditionalEdges('model', shouldContinue, ['tools', END])
      .addConditionalEdges('tools', updateTools, ['model']);
    // .addEdge('model', END);

    const graph = workflow.compile({ checkpointer });

    const config: Parameters<typeof graph.invoke>[1] = {
      configurable: { thread_id: conversationId },
    };

    let messages: Messages = [];
    if (!sessionId) {
      const session = await this.createAgentSession(agentId);
      messages = session.messages.map((_) => ({
        ..._,
        type: _.role,
        content: _.content as string,
      }));
    }
    messages = messages.concat(
      props.messages?.map((_) => ({
        ..._,
        type: _.role,
        content: _.content as string,
      })) || [],
    );

    // console.log(messages);

    // message => Reminder you are an event assistant
    // message => Reminder ensure that tools are properly called
    // message => user content

    const llmResponse = await graph.invoke({ messages }, config);

    const content = llmResponse.messages.at(-1)?.content;

    let finalAIContent;

    if (Array.isArray(content)) {
      finalAIContent = compact(map(content, (_) => get(_, 'text'))).join(
        '\n\n',
      );
    } else {
      finalAIContent = content || '(No content)';
    }

    // parse "###ACTION_SUMMARY: " from finalAIContent
    let actionSummary = 'misc request';
    const match = finalAIContent.match(/###ACTION_SUMMARY:\s*(.+)/i);
    if (match && match[1]) {
      actionSummary = match[1].trim();
    }

    const totalTime = performance.now() - startTime;

    const snippet = finalAIContent.slice(0, 512);

    // single log
    await this.logService.createLogEntry({
      agentId,
      sessionId: conversationId,
      action: actionSummary,
      message: snippet,
      status: 'success',
      responseTime: totalTime,
      tools: toolUsage,
    });

    // Charge for running the agent

    // const tx = await wallet.createTransfer({
    //   amount: 1,
    //   assetId: COMMON_TOKEN_ADDRESS,
    //   destination: '0xd9303dfc71728f209ef64dd1ad97f5a557ae0fab',
    // });

    // await tx.wait();

    console.log(llmResponse);

    return {
      ...llmResponse.messages.at(-1)?.toDict(),
      sessionId: conversationId,
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

    // TODO: Check if interval has changed
    // Update cron job schedule

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

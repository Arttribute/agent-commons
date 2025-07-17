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
import {
  BadRequestException,
  Injectable,
  OnModuleInit,
  forwardRef,
  Inject,
} from '@nestjs/common';
import { HDKey } from '@scure/bip32';
import crypto from 'crypto';
import dedent from 'dedent';
import {
  eq,
  InferInsertModel,
  InferSelectModel,
  inArray,
  sql,
  desc,
} from 'drizzle-orm';
import { AGENT_REGISTRY_ABI } from 'lib/abis/AgentRegistryABI';
import { AGENT_REGISTRY_ADDRESS, COMMON_TOKEN_ADDRESS } from 'lib/addresses';
import { compact, first, get, map, omit } from 'lodash';
import {
  ChatCompletionCreateParams,
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from 'openai/resources/chat/completions';
import { Except } from 'type-fest';
import typia from 'typia';
import { v4 as uuidv4 } from 'uuid';
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
import { BaseCallbackHandler } from '@langchain/core/callbacks/base';
import { IChatGptSchema } from '@samchon/openapi';
import { getPosthog } from '~/helpers/posthog';
import { LogService } from '~/log/log.service';
import { GoalService } from '~/goal/goal.service';
import { TaskService } from '~/task/task.service';
import { Observable } from 'rxjs';
import { SpaceService } from '~/space/space.service';
import { SpaceBusService } from '~/space/space-bus.service';

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
    /* NEW injections */
    @Inject(forwardRef(() => GoalService)) private goals: GoalService,
    @Inject(forwardRef(() => TaskService)) private tasks: TaskService,
    private spaceService: SpaceService,
    private spaceBusService: SpaceBusService,
  ) {}

  /* ─────────────────────────  INIT  ───────────────────────── */
  async onModuleInit() {
    await PostgresSaver.fromConnString(
      `postgresql://${process.env.POSTGRES_USER}:${process.env.POSTGRES_PASSWORD}@${process.env.POSTGRES_HOST}:${process.env.POSTGRES_PORT}/${process.env.POSTGRES_DATABASE}`,
    ).setup();
  }

  /* ─────────────────────────  CREATE & GET AGENT (unchanged)  ───────────────────────── */
  async createAgent(props: {
    value: Except<InferInsertModel<typeof schema.agent>, 'wallet' | 'agentId'>;
    commonsOwned?: boolean;
  }) {
    const wallet = await this.coinbase.createDeveloperManagedWallet();
    await (await wallet.faucet()).wait();

    const agentId = (await wallet.getDefaultAddress())?.getId().toLowerCase();
    let agentOwner = props.commonsOwned
      ? '0xD9303DFc71728f209EF64DD1AD97F5a557AE0Fab'
      : (props.value.owner as string);

    const [agentEntry] = await this.db
      .insert(schema.agent)
      .values({
        ...props.value,
        agentId,
        owner: agentOwner,
        wallet: wallet.export(),
        isLiaison: false,
      })
      .returning();

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
      await this.publicClient.waitForTransactionReceipt({
        hash: await contract.write.registerAgent([
          agentId,
          'ipfs://placeholder',
          true,
        ]),
      });
    }

    /* default 10‑min cron */
    //await this.db.execute(
    //  sql`SELECT cron.schedule(FORMAT('agent:%s:schedule', ${agentId}),'*/10 * * * *', FORMAT('SELECT trigger_agent(%L)', ${agentId}))`,
    //);

    return agentEntry;
  }

  async getAgent(props: { agentId: string }) {
    const agent = await this.db.query.agent.findFirst({
      where: (t) => eq(t.agentId, props.agentId),
    });
    if (!agent) throw new BadRequestException('Agent not found');
    return agent;
  }

  /* ─────────────────────────  UTIL  ───────────────────────── */
  public seedToPrivateKey(seed: string) {
    const node = HDKey.fromMasterSeed(Buffer.from(seed, 'hex'));
    return Buffer.from(node.derive("m/44'/60'/0'/0/0").privateKey!).toString(
      'hex',
    );
  }

  /* purchaseCommons / checkCommonsBalance / transferTokensToWallet (unchanged) */

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

  /* ─────────────────────────  SPACE UTILITIES  ───────────────────────── */

  /**
   * Setup agent for shared space collaboration
   */
  private async setupAgentForSharedSpace(
    agentId: string,
    spaceId?: string,
    collaboratorAgentIds: string[] = [],
  ): Promise<string> {
    let actualSpaceId = spaceId;

    if (!actualSpaceId) {
      // Create a new space if none provided
      const newSpace = await this.spaceService.createSpace({
        name: `Agent Collaboration Space - ${new Date().toISOString()}`,
        description: `Shared space for agents: ${[agentId, ...collaboratorAgentIds].join(', ')}`,
        createdBy: agentId,
        createdByType: 'agent' as const,
      });
      actualSpaceId = newSpace.spaceId;

      // Add collaborator agents to the space
      for (const collaboratorId of collaboratorAgentIds) {
        try {
          await this.spaceService.addMember({
            spaceId: actualSpaceId,
            memberId: collaboratorId,
            memberType: 'agent' as const,
            role: 'member',
          });
        } catch (error) {
          // Ignore "Member already exists" errors - this is expected behavior
          if (
            error instanceof Error &&
            error.message !== 'Member already exists in this space'
          ) {
            throw error; // Re-throw other errors
          }
        }
      }
    } else {
      // Add current agent to existing space
      try {
        await this.spaceService.addMember({
          spaceId: actualSpaceId,
          memberId: agentId,
          memberType: 'agent' as const,
          role: 'member',
        });
      } catch (error) {
        // Ignore "Member already exists" errors - this is expected behavior
        if (
          error instanceof Error &&
          error.message !== 'Member already exists in this space'
        ) {
          throw error; // Re-throw other errors
        }
      }
    }

    return actualSpaceId;
  }

  /* ─────────────────────────  SESSION BOOTSTRAP  ───────────────────────── */
  private async createAgentSession(
    agentId: string,
    sessionId: string,
    useSharedSpace = false,
    spaceId?: string,
    collaboratorAgentIds: string[] = [],
  ) {
    const agent = await this.getAgent({ agentId });
    const currentTime = new Date();

    // Get existing child sessions for this agent
    const childSessions = await this.getChildSessions(sessionId);

    const childSessionsInfo =
      childSessions.length > 0
        ? `\n\nEXISTING CHILD SESSIONS:\nYou have the following ongoing conversations with other agents. Use these sessionIds to continue existing conversations instead of starting new ones:\n${childSessions.map((cs) => `- Agent ${cs.childAgentId}: ${cs.title || 'Untitled conversation'} (sessionId=${cs.childSessionId}, started: ${cs.createdAt})`).join('\n')}`
        : '';
    console.log('childSessionsInfo:', childSessionsInfo);
    console.log('sessiond id from createsession', sessionId);

    const spaceCollaborationInfo =
      useSharedSpace && spaceId
        ? `

          **SHARED SPACE MODE**: You are collaborating in a shared space (${spaceId}) with other agents: ${collaboratorAgentIds.join(', ')}.
          
          In this mode:
          • Use the sendBusMessage and subscribeToSpaceBus tools to communicate with other agents in the space
          • Messages are shared in real-time with all agents in the space
          • The system will automatically handle message routing and persistence
          • You can send different types of messages: question, answer, update, request, response, notification
          • This is a single collaborative session - complete your contribution then await human follow-up
          • Focus on collaborative problem-solving and knowledge sharing
          
          `
        : '';

    const messages: ChatCompletionMessageParam[] = [
      {
        role: 'system',
        content: dedent`You are the following agent:
          ${JSON.stringify(omit(agent, ['instructions', 'persona', 'wallet']))}
              Persona:
          ${agent.persona}

          Instructions:
          ${agent.instructions}
          

          The current date and time is ${currentTime.toISOString()}.
           **SESSION ID**: ${sessionId}
          
          ${useSharedSpace ? spaceCollaborationInfo : `Note that you can interact and engage with other agents using the interactWithAgent tool. Once you initiate a conversation with another agent, you can continue the conversation by calling the interactWithAgent tool again with the sessionId provided in the result of running the interactWithAgent tool. This will allow you to continue the conversation with the other agent.${childSessionsInfo}`}

          STRICTLY ABIDE BY THE FOLLOWING:
          • If a request is simple and does not require complex plannind give an immediate response.
          • If a request is complex and requires multiple steps, call createGoal which creates a goal and then get the goal id and use createTask to create tasks for the goal with the necessary details.
          • In the process of creating a goal, think very deeply and critically about it. Break it down and detail every single paart of it. Set a SMART(Specific, Measureble, Achievable, Relevant and Time-bound) goal with a clear description. Consider all factors and create a well thought out plan of action and include it in the goal description. This should now guide the tasks to be created. Include the tasks breakdown in the goal description as well.The tasks to be created should match the tasks breakdown in the goal description. If no exact timelines are provided for the goal set the goal deadline to the current time.
          • Similarly, when creating tasks, think very deeply and critically about it. Set a SMART(Specific, Measureble, Achievable, Relevant and Time-bound) task with a clear description. Consider all factors and create a well thought out plan of action and include it in the task description. Remember some tasks may be dependent on each other. Think about what tools might be needed to accomplish the task and include them in the task description and task tools.
          • For every task specify the context of the task. The context should contain all the necessary information that are either needed or would be beneficial for the task.
          • Before starting the execution make sure that the goal and all its tasks are fully created .
          • STRCTLY DO NOT start execution of a task or update any task using updateTaskProgress until the user specifically asks you to do so.
          ## ONLY DO THESE ONCE THE GOAL AND TASKS ARE FULLY CREATED AND THE USER ASKS YOU TO DO SO:
          • As you execute tasks, update tasks progress accordingly with all the necessary information, call the updateTaskProgress  with the necessary details.Provide the actual result content of the task and the summary of the task.
          • If tasks require the use of tools, include the needed tools in the task and use the tools to execute the tasks.
          • For each task, perform the task and produce the content expected for the task given by the expectedOutputType in the task context. The result content should be the actual conent produced. For example if the task was to generate code, the result content should contain the code generated. If the task was to fetch data, the result content should contain the data fetched. If the task was to generate a report, the result content should contain the report generated. If the task was to generate an image, the result content should contain the image generated. If the task was to generate a video, the result content should contain the video generated. If the task was to generate a text, the result content should contain the text generated. If the task was to generate a pdf, the result content should contain the pdf generated.
          • Unless given specific completion deadlines and schedules, all goals and tasks should be completed immediately.
          • In case of any new information that is relevant to the task, update the task and task context with the new information. 
          • If you are unable to complete a task, call the updateTaskProgress with the necessary details and provide a summary of the failure.
        `,
      },
    ];

    /* build tool definitions exactly like before */
    const storedTools = await this.toolService.getAllTools();
    const dynamicTools = storedTools.map((dbTool) => ({
      type: 'function',
      function: { ...dbTool.schema, name: dbTool.name },
      endpoint: `http://localhost:${process.env.PORT}/v1/agents/tools`,
    }));
    const resourceIds = agent.commonTools ?? [];
    const resTools = await this.db.query.resource.findMany({
      where: (r) => inArray(r.resourceId, resourceIds),
    });
    const resourceBased = resTools
      .filter((r) => !!r.schema)
      .map((r) => ({
        type: 'function',
        function: {
          ...(r.schema as any),
          name: `resourceTool_${r.resourceId}`,
        },
        endpoint: `http://localhost:${process.env.PORT}/v1/agents/tools`,
      }));
    const staticTools = map(app.functions, (_) => ({
      type: 'function',
      function: {
        ..._,
        parameters:
          _?.parameters as unknown as ChatCompletionTool['function']['parameters'],
      },
      endpoint: `http://localhost:${process.env.PORT}/v1/agents/tools`,
    })) as (ChatCompletionTool & { endpoint: string })[];

    const completionBody: ChatCompletionCreateParams = {
      messages,
      tools: [
        ...dynamicTools.map((tool) => ({ ...tool, type: 'function' as const })),
        ...resourceBased.map((tool) => ({
          ...tool,
          type: 'function' as const,
        })),
        ...staticTools.map((tool) => ({ ...tool, type: 'function' as const })),
      ],
      tool_choice: 'auto',
      parallel_tool_calls: true,
      model: 'gpt-4o-mini',
    };
    return completionBody;
  }

  /* ─────────────────────────  CHILD SESSION TRACKING  ───────────────────────── */
  async getChildSessions(parentSessionId: string) {
    const sessions = await this.db.query.session.findMany({
      where: (s) => eq(s.parentSessionId, parentSessionId),
    });
    console.log(
      `Found ${sessions.length} child sessions for parent ${parentSessionId}`,
    );

    return sessions.map((session) => ({
      childSessionId: session.sessionId,
      childAgentId: session.agentId,
      title: session.title,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
    }));
  }

  /* ─────────────────────────  CRON TRIGGER  ───────────────────────── */
  async triggerAgent(props: { agentId: string; sessionId?: string }) {
    console.log('Triggering agent', props.agentId);
    //if autonomous mode is not enabled then do not trigger the agent
    const agent = await this.getAgent({ agentId: props.agentId });
    if (!agent.autonomyEnabled) {
      console.log('Agent is not autonomous, skipping trigger');
      return;
    }
    //get next executable goal
    const nextGoal = await this.goals.getNextExecutableGoal(props.agentId);
    if (!nextGoal) {
      console.log('No executable goal found, pausing agent');
      //actually pause the agent
      return;
    }
    //get session from goal
    const goalsessionId = nextGoal.sessionId;
    if (goalsessionId) {
      console.log('Goal session:', goalsessionId);
      return this.runAgent({
        agentId: props.agentId,
        messages: [
          {
            role: 'user',
            content: `⫷⫷AUTOMATED_USER_TRIGGER⫸⫸:
              This is an automated trigger.Do not perform any action or update any task, unless the user specifically asks you to do so.`,
          },
        ],
        sessionId: goalsessionId, //This will give the agent a rough idea on which task to execute. i.e - it will execute the tasks with the same sessionId
        initiator: agent.agentId,
      });
    }
  }

  /* ─────────────────────────  MAIN RUN  ───────────────────────── */

  public runAgent(props: {
    agentId: string;
    messages?: ChatCompletionMessageParam[];
    sessionId?: string;
    initiator: string;
    parentSessionId?: string;
    stream?: boolean; // ✅ stream flag
    // Space configuration
    spaceId?: string;
    useSharedSpace?: boolean;
    collaboratorAgentIds?: string[];
  }): Observable<any> {
    return new Observable<any>((subscriber) => {
      const run = async () => {
        const tStart = performance.now();
        const {
          agentId,
          sessionId,
          initiator,
          parentSessionId,
          stream = false, // default false
          spaceId,
          useSharedSpace = false,
          collaboratorAgentIds = [],
        } = props;

        try {
          const agent = await this.getAgent({ agentId });

          const wallet = await Wallet.import(agent.wallet);
          if ((await wallet.getBalance(COMMON_TOKEN_ADDRESS)).lte(0)) {
            throw new BadRequestException('Agent has no tokens');
          }

          let currentSessionId = sessionId;
          let isNewSession = false;
          if (!currentSessionId) {
            const newSession = await this.session.createSession({
              value: {
                sessionId: uuidv4(),
                agentId,
                initiator: initiator,
                model: {
                  name: 'gpt-4o-mini',
                  temperature: agent.temperature || 0.7,
                  maxTokens: agent.maxTokens || 2000,
                  topP: agent.topP || 1,
                  presencePenalty: agent.presencePenalty || 0,
                  frequencyPenalty: agent.frequencyPenalty || 0,
                },
                createdAt: new Date(),
                updatedAt: new Date(),
              },
              parentSessionId,
            });
            currentSessionId = newSession.sessionId;
            isNewSession = true;
          }

          // Handle space creation/joining when using shared space mode
          if (useSharedSpace) {
            const actualSpaceId = await this.setupAgentForSharedSpace(
              agentId,
              spaceId,
              collaboratorAgentIds,
            );

            // Subscribe to space bus for real-time communication
            this.spaceBusService.subscribeToSpace(
              actualSpaceId,
              (message: any) => {
                if (stream) {
                  subscriber.next({
                    type: 'spaceMessage',
                    spaceId: actualSpaceId,
                    message,
                    timestamp: new Date().toISOString(),
                  });
                }
              },
            );

            // Update props with actual space ID
            props.spaceId = actualSpaceId;
          }

          const storedTools = await this.toolService.getAllTools();
          const dynamicDefs = storedTools.map((dbTool) => ({
            type: 'function',
            function: { ...dbTool.schema, name: dbTool.name },
            endpoint: `http://localhost:${process.env.PORT}/v1/agents/tools`,
          }));

          const resTools = await this.db.query.resource.findMany({
            where: (r) => inArray(r.resourceId, agent.commonTools ?? []),
          });

          const resourceDefs = resTools
            .filter((r) => !!r.schema)
            .map((r) => ({
              type: 'function',
              function: {
                ...(r.schema as any),
                name: `resourceTool_${r.resourceId}`,
              },
              endpoint: `http://localhost:${process.env.PORT}/v1/agents/tools`,
            }));

          const staticDefs = map(app.functions, (_) => ({
            type: 'function',
            function: {
              ..._,
              parameters:
                _?.parameters as unknown as ChatCompletionTool['function']['parameters'],
            },
            endpoint: `http://localhost:${process.env.PORT}/v1/agents/tools`,
          })) as (ChatCompletionTool & { endpoint: string })[];

          const toolDefs = [...dynamicDefs, ...resourceDefs, ...staticDefs];

          const toolUsage: {
            name: string;
            status: string;
            duration?: number;
          }[] = [];
          const executedCalls: any[] = [];

          let accumulatedTokens = ''; // Complete message sent at completion

          const callbackHandler = BaseCallbackHandler.fromMethods({
            handleLLMNewToken: async (token: string) => {
              if (stream) {
                const tokenMessage = {
                  type: 'token',
                  role: 'ai',
                  content: token,
                  timestamp: new Date().toISOString(),
                };

                subscriber.next(tokenMessage);

                // Accumulate tokens for space bus
                if (useSharedSpace && spaceId) {
                  accumulatedTokens += token;
                }
              }
            },
            handleLLMEnd: async (output: any) => {
              // Send complete accumulated message to space bus when LLM completes
              if (useSharedSpace && spaceId && accumulatedTokens.trim()) {
                try {
                  await this.spaceBusService.sendMessage({
                    spaceId,
                    senderId: agentId,
                    senderType: 'agent',
                    content: accumulatedTokens,
                    messageType: 'text',
                    targetType: 'broadcast',
                    metadata: {
                      type: 'acc_tokens',
                      sessionId: currentSessionId,
                      isComplete: true,
                    },
                  });
                  accumulatedTokens = ''; // Reset after sending
                } catch (error) {
                  console.error(
                    'Failed to send complete message to space bus:',
                    error,
                  );
                }
              }
            },
            handleToolStart: async (tool: any, input: string) => {
              const toolStartMessage = {
                type: 'toolStart',
                toolName: tool.name,
                input,
                timestamp: new Date().toISOString(),
              };

              subscriber.next(toolStartMessage);

              // Send tool start to space bus if in shared space mode
              if (useSharedSpace && spaceId) {
                try {
                  await this.spaceBusService.sendMessage({
                    spaceId,
                    senderId: agentId,
                    senderType: 'agent',
                    content: `Starting tool: ${tool.name}`,
                    messageType: 'command',
                    targetType: 'broadcast',
                    metadata: {
                      type: 'toolStart',
                      toolName: tool.name,
                      input,
                      sessionId: currentSessionId,
                    },
                  });
                } catch (error) {
                  console.error(
                    'Failed to send tool start to space bus:',
                    error,
                  );
                }
              }
            },
            handleToolEnd: async (output: any) => {
              const toolEndMessage = {
                type: 'toolEnd',
                output,
                timestamp: new Date().toISOString(),
              };

              subscriber.next(toolEndMessage);

              // Send tool end to space bus if in shared space mode
              if (useSharedSpace && spaceId) {
                try {
                  await this.spaceBusService.sendMessage({
                    spaceId,
                    senderId: agentId,
                    senderType: 'agent',
                    content: `Tool completed with output: ${JSON.stringify(output).slice(0, 200)}`,
                    messageType: 'response',
                    targetType: 'broadcast',
                    metadata: {
                      type: 'toolEnd',
                      output,
                      sessionId: currentSessionId,
                    },
                  });
                } catch (error) {
                  console.error('Failed to send tool end to space bus:', error);
                }
              }
            },
          });

          const llm = new ChatOpenAI({
            model: 'gpt-4o-mini',
            temperature: 0,
            supportsStrictToolCalling: true,
            apiKey: process.env.OPENAI_API_KEY,
            streaming: stream, // ✅ use flag
          });

          const llmWithTools = llm.bindTools(toolDefs, {
            parallel_tool_calls: true,
            strict: false,
            callbacks: [callbackHandler],
          });

          const makeRunner = (def: ChatCompletionTool & { endpoint: string }) =>
            tool(
              async (args, config) => {
                const fn = config.toolCall?.name ?? 'unknown';
                const t0 = performance.now();
                const got_ = await got;
                const data = await got_.default
                  .post(
                    `http://localhost:${process.env.PORT}/v1/agents/tools`,
                    {
                      json: {
                        args,
                        toolCall: config.toolCall,
                        metadata: {
                          agentId,
                          sessionId: currentSessionId,
                          spaceId: useSharedSpace ? props.spaceId : undefined,
                          useSharedSpace,
                          collaboratorAgentIds,
                        },
                      },
                      headers: { 'Content-Type': 'application/json' },
                    },
                  )
                  .json<any>()
                  .catch((e: any) => {
                    toolUsage.push({
                      name: fn,
                      status: 'error',
                      duration: performance.now() - t0,
                    });
                    throw e;
                  });

                toolUsage.push({
                  name: fn,
                  status: 'success',
                  duration: performance.now() - t0,
                });

                const callObj = {
                  role: 'tool',
                  name: fn,
                  status: 'success',
                  duration: performance.now() - t0,
                  args,
                  result: data,
                  timestamp: new Date().toISOString(),
                };

                executedCalls.push(callObj);

                subscriber.next({
                  type: 'tool',
                  ...callObj,
                });

                return { toolData: data };
              },
              {
                name: def.function.name,
                description: def.function.description,
                schema: def.function
                  .parameters as unknown as IChatGptSchema.IParameters,
              },
            );

          const toolRunners = toolDefs.map((def) =>
            makeRunner(def as ChatCompletionTool & { endpoint: string }),
          );

          const toolNode = new ToolNode(toolRunners);
          const collectedToolCalls = executedCalls;

          const callModel = async (s: typeof MessagesAnnotation.State) => ({
            messages: await llmWithTools.invoke(s.messages),
          });

          const shouldCont = (s: typeof MessagesAnnotation.State) => {
            const last = s.messages.at(-1);
            return last &&
              'tool_calls' in last &&
              Array.isArray(last.tool_calls) &&
              last.tool_calls.length
              ? 'tools'
              : END;
          };

          const graph = new StateGraph(MessagesAnnotation)
            .addNode('model', callModel)
            .addNode('tools', toolNode)
            .addEdge(START, 'model')
            .addConditionalEdges('model', shouldCont, ['tools', END])
            .addEdge('tools', 'model')
            .compile({
              checkpointer: PostgresSaver.fromConnString(
                `postgresql://${process.env.POSTGRES_USER}:${process.env.POSTGRES_PASSWORD}@${process.env.POSTGRES_HOST}:${process.env.POSTGRES_PORT}/${process.env.POSTGRES_DATABASE}`,
              ),
            });

          let messages: Messages = [];

          if (!sessionId) {
            const boot = await this.createAgentSession(
              agentId,
              currentSessionId,
              useSharedSpace,
              spaceId,
              collaboratorAgentIds,
            );
            messages.push(
              ...boot.messages.map((m) => ({
                ...m,
                type: m.role,
                content: m.content ?? '',
              })),
            );
          } else {
            // ✅ For existing sessions, inject updated system message
            const currentTime = new Date();

            if (useSharedSpace) {
              // For shared space mode, provide space collaboration context
              const spaceCollaborationInfo = `

          **SHARED SPACE MODE**: You are collaborating in a shared space (${props.spaceId}) with other agents: ${collaboratorAgentIds.join(', ')}
          
          In this mode:
          • Use the sendBusMessage and subscribeToSpaceBus tools to communicate with other agents in the space
          • Messages are shared in real-time with all agents in the space
          • The system will automatically handle message routing and persistence
          • You can send different types of messages: question, answer, update, request, response, notification
          • This is a single collaborative session - complete your contribution then await human follow-up
          • Focus on collaborative problem-solving and knowledge sharing
          
          `;

              messages.push({
                type: 'system',
                role: 'system',
                content: spaceCollaborationInfo,
              } as any);
            } else {
              // For P2P mode, provide child session context
              const childSessions =
                await this.getChildSessions(currentSessionId);

              const childSessionsInfo =
                childSessions.length > 0
                  ? `\n\nEXISTING CHILD SESSIONS:\nYou have the following ongoing conversations with other agents. Use these sessionIds to continue existing conversations instead of starting new ones:\n${childSessions.map((cs) => `- Agent ${cs.childAgentId}: ${cs.title || 'Untitled conversation'} (sessionId=${cs.childSessionId}, started: ${cs.createdAt})`).join('\n')}`
                  : '';

              console.log(
                'Updated childSessionsInfo for existing session:',
                childSessionsInfo,
              );

              // Add updated system message with current child session info
              messages.push({
                type: 'system',
                role: 'system',
                content: `
              REMEMBER:
          
              When using the interactWithAgent tool you can only use sessionIds from the following list when continuing conversations: ${childSessionsInfo}`,
              } as any);
              console.log('Child sessions after update:', childSessionsInfo);
            }
          }

          if (props.messages?.length) {
            messages.push(
              ...props.messages.map((m) => ({
                ...m,
                type: m.role,
                content: m.content ?? '',
              })),
            );
          }

          let loop = 0;
          let max_recurssion = agent.autonomyEnabled ? 2 : 4;
          let finalResult = null;

          while (loop++ < max_recurssion) {
            const nextTask = await this.tasks.getNextExecutable(
              agentId,
              currentSessionId,
            );
            if (nextTask) {
              await this.tasks.start(nextTask.taskId);
              messages.push({
                type: 'user',
                role: 'user',
                content: `##TASK_INSTRUCTION: ${nextTask.description}`,
              } as any);
            }

            const result = await graph.invoke(
              { messages },
              { configurable: { thread_id: currentSessionId } },
            );

            messages = result.messages;
            finalResult = result;

            const pending = await this.tasks.getNextExecutable(
              agentId,
              currentSessionId,
            );
            if (!pending) break;
          }

          const toolCalls = collectedToolCalls.filter(
            (call) => call.name !== 'interactWithAgent',
          );

          const rawAgenCalls: any = collectedToolCalls.filter(
            (call) => call.name === 'interactWithAgent',
          );

          // Process agent interactions - use shared space only if explicitly configured
          let resolvedAgentCalls: any[] = [];

          if (useSharedSpace && props.spaceId) {
            // User explicitly chose shared space mode
            const collaboratingAgentIds = rawAgenCalls
              .filter(
                (call: any) => call.name === 'interactWithAgent' && call.args,
              )
              .map((call: any) => call.args.agentId);

            console.log(
              `Using shared space collaboration with ${collaboratingAgentIds.length} agents:`,
              collaboratingAgentIds,
            );

            // Start all agents in the existing shared space (concurrent)
            const sharedSpaceSessions = collaboratingAgentIds.map(
              (collaboratorId: string) => {
                const relevantCall = rawAgenCalls.find(
                  (call: any) => call.args?.agentId === collaboratorId,
                );
                const initialMessage =
                  relevantCall?.args?.messages?.[0]?.content ||
                  "Let's collaborate!";

                return this.runAgent({
                  agentId: collaboratorId,
                  messages: [{ role: 'user', content: initialMessage }],
                  initiator: agentId,
                  useSharedSpace: true,
                  spaceId: props.spaceId,
                  collaboratorAgentIds: [
                    agentId,
                    ...collaboratingAgentIds.filter(
                      (id: string) => id !== collaboratorId,
                    ),
                  ],
                  stream: false,
                });
              },
            );

            // Wait for all shared space sessions to complete
            resolvedAgentCalls = await Promise.all(
              sharedSpaceSessions.map(async (session: any, index: number) => {
                let lastData: any;
                await new Promise<void>((resolve, reject) => {
                  session.subscribe({
                    next: (chunk: any) => {
                      lastData = chunk;
                    },
                    error: reject,
                    complete: resolve,
                  });
                });

                return {
                  agentId: collaboratingAgentIds[index],
                  message:
                    rawAgenCalls.find(
                      (call: any) =>
                        call.args?.agentId === collaboratingAgentIds[index],
                    )?.args?.messages?.[0]?.content || '',
                  response: lastData,
                  sessionId: lastData?.sessionId,
                  sharedSpaceId: props.spaceId,
                };
              }),
            );

            console.log(
              `Shared space collaboration completed in space: ${props.spaceId}`,
            );
          } else {
            // Default P2P behavior for agent interactions (sequential)
            const agentCalls = rawAgenCalls
              .filter(
                (call: any) => call.name === 'interactWithAgent' && call.args,
              )
              .map(async (call: any) => {
                const args = call.args;
                const sessionIdToUse = args.sessionId || undefined;
                const childSession$ = this.runAgent({
                  agentId: args.agentId,
                  messages: args.messages,
                  sessionId: sessionIdToUse,
                  initiator: agentId,
                  parentSessionId: currentSessionId,
                });

                let lastData: any;
                await new Promise<void>((resolve, reject) => {
                  childSession$.subscribe({
                    next: (chunk) => {
                      lastData = chunk;
                    },
                    error: reject,
                    complete: resolve,
                  });
                });

                return {
                  agentId: args.agentId,
                  message: args.messages?.[0]?.content || '',
                  response: lastData,
                  sessionId: lastData?.sessionId,
                };
              });

            resolvedAgentCalls = await Promise.all(agentCalls);
          }

          const messageHistories =
            finalResult?.messages?.filter(
              (m) => m.toDict().type !== 'system',
            ) || [];

          const currentSession = await this.session.getSession({
            id: currentSessionId,
          });
          if (!currentSession) {
            throw new BadRequestException('Session not found');
          }

          let sessionTitle = 'New Session';
          if (isNewSession && props.messages?.length) {
            const firstUserMessage = props.messages.find(
              (m) => m.role === 'user',
            );
            if (firstUserMessage?.content) {
              sessionTitle = await this.generateSessionTitle(
                firstUserMessage.content as string,
              );
            }
          }

          await this.session.updateSession({
            id: currentSessionId,
            delta: {
              endedAt: new Date(),
              title: isNewSession
                ? sessionTitle
                : currentSession.title || sessionTitle,
              metrics: {
                totalTokens: toolUsage.reduce(
                  (acc, tool) => acc + (tool.duration || 0),
                  0,
                ),
                toolCalls: toolUsage.length,
                errorCount: toolUsage.filter((t) => t.status === 'error')
                  .length,
              },
              history: messageHistories.map((m) => ({
                role: m.toDict().type,
                content:
                  typeof m.content === 'string'
                    ? m.content
                    : JSON.stringify(m.content),
                timestamp: new Date().toISOString(),
                metadata: {
                  toolCalls:
                    m.toDict().type === 'assistant' ? toolCalls : undefined,
                  agentCalls:
                    m.toDict().type === 'assistant'
                      ? resolvedAgentCalls
                      : undefined,
                },
              })),
              updatedAt: new Date(),
            },
          });

          const last = messages.at(-1)!;
          const finalText =
            typeof last === 'object' &&
            last !== null &&
            'content' in last &&
            typeof last.content === 'string'
              ? last.content
              : typeof last === 'object' && 'content' in last
                ? compact(
                    map((last as any).content, (_) => get(_, 'text')),
                  ).join('\n')
                : '';

          await this.logService.createLogEntry({
            agentId,
            sessionId: currentSessionId,
            action: 'run',
            message: finalText.slice(0, 512),
            status: 'success',
            responseTime: performance.now() - tStart,
            tools: toolUsage,
          });

          const lastMessage = finalResult?.messages?.at(-1)?.toDict() ?? {};

          // Explicitly mark the final message
          const finalMessage = {
            type: 'final',
            messageType: 'final', // Explicitly set final message type
            payload: {
              ...lastMessage,
              sessionId: currentSessionId,
              title: sessionTitle,
              metadata: {
                toolCalls,
                agentCalls: resolvedAgentCalls,
              },
            },
          };

          subscriber.next(finalMessage);

          // Send to space bus if in shared space mode
          if (useSharedSpace && spaceId) {
            try {
              await this.spaceBusService.sendMessage({
                spaceId,
                senderId: agentId,
                senderType: 'agent',
                content: finalText,
                messageType: 'final',
                targetType: 'broadcast',
                metadata: {
                  sessionId: currentSessionId,
                  title: sessionTitle,
                  toolCalls,
                  agentCalls: resolvedAgentCalls,
                },
              });
            } catch (error) {
              console.error('Failed to send message to space bus:', error);
            }
          }

          subscriber.complete();
        } catch (err) {
          subscriber.error(err);
        }
      };

      run();
    });
  }

  private async generateSessionTitle(userMessage: string): Promise<string> {
    try {
      // Truncate message if too long
      const truncatedMessage =
        userMessage.length > 200
          ? userMessage.substring(0, 200) + '...'
          : userMessage;

      // Use LangChain ChatOpenAI for title generation
      const titleLlm = new ChatOpenAI({
        model: 'gpt-4o-mini', // original
        temperature: 0.3,
        maxTokens: 20,
        apiKey: process.env.OPENAI_API_KEY,
      });

      const response = await titleLlm.invoke([
        {
          role: 'system',
          content:
            "Generate a short, descriptive title (max 6 words) for this conversation based on the user's message. Do not use quotes or special characters.",
        },
        {
          role: 'user',
          content: truncatedMessage,
        },
      ]);

      const title = response.content?.toString()?.trim();
      return title && title.length > 0 ? title : 'New Conversation';
    } catch (error) {
      console.error('Failed to generate session title:', error);
      // Fallback: use first few words of user message
      const words = userMessage.split(' ').slice(0, 4);
      return words.join(' ') || 'New Conversation';
    }
  }

  /* ─────────────────────────  updateAgent / getters ───────────────────────── */
  async updateAgent(
    agentId: string,
    updateData: Partial<InferSelectModel<typeof schema.agent>>,
  ) {
    const [updated] = await this.db
      .update(schema.agent)
      .set(omit(updateData, ['wallet', 'agentId', 'createdAt']))
      .where(eq(schema.agent.agentId, agentId))
      .returning();
    return updated;
  }

  async getAgentById(agentId: string) {
    const agent = await this.db.query.agent.findFirst({
      where: (t) => eq(t.agentId, agentId),
    });
    if (!agent) throw new BadRequestException('Agent not found');
    return agent;
  }
  async getAgents() {
    return this.db.query.agent.findMany();
  }
  async getAgentsByOwner(owner: string) {
    return this.db.query.agent.findMany({ where: (t) => eq(t.owner, owner) });
  }

  //get agent session full chat
  async getAgentChatSession(sessionId: string) {
    const session = await this.session.getSession({ id: sessionId });
    if (!session) throw new BadRequestException('Session not found');
    return session;
  }

  // ──────────────── AGENT KNOWLEDGEBASE ────────────────
  async getAgentKnowledgebase(agentId: string) {
    const agent = await this.getAgent({ agentId });
    return agent.knowledgebase || [];
  }
  async updateAgentKnowledgebase(agentId: string, knowledgebase: any[]) {
    const [updated] = await this.db
      .update(schema.agent)
      .set({ knowledgebase })
      .where(eq(schema.agent.agentId, agentId))
      .returning();
    return updated.knowledgebase;
  }

  // ──────────────── AGENT PREFERRED CONNECTIONS ────────────────
  async getPreferredConnections(agentId: string) {
    return this.db.query.agentPreferredConnection.findMany({
      where: (t) => eq(t.agentId, agentId),
    });
  }
  async addPreferredConnection(
    agentId: string,
    preferredAgentId: string,
    usageComments?: string,
  ) {
    const [inserted] = await this.db
      .insert(schema.agentPreferredConnection)
      .values({ agentId, preferredAgentId, usageComments })
      .returning();
    return inserted;
  }
  async removePreferredConnection(id: string) {
    await this.db
      .delete(schema.agentPreferredConnection)
      .where(eq(schema.agentPreferredConnection.id, id));
    return { success: true };
  }

  // ──────────────── AGENT TOOLS ────────────────
  async getAgentTools(agentId: string) {
    return this.db.query.agentTool.findMany({
      where: (t) => eq(t.agentId, agentId),
    });
  }
  async addAgentTool(
    agentId: string,
    toolId: string,
    usageComments?: string,
    secureKeyRef?: string,
  ) {
    const [inserted] = await this.db
      .insert(schema.agentTool)
      .values({ agentId, toolId, usageComments, secureKeyRef })
      .returning();
    return inserted;
  }
  async removeAgentTool(id: string) {
    await this.db.delete(schema.agentTool).where(eq(schema.agentTool.id, id));
    return { success: true };
  }
}

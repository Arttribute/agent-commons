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
import { SpaceConductor } from '~/space/space-conductor.service';
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
import { AgentEvent } from '~/space/space-context';

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
    private readonly spaceConductor: SpaceConductor,
    private toolService: ToolService,
    private logService: LogService,
    /* NEW injections */
    @Inject(forwardRef(() => GoalService)) private goals: GoalService,
    @Inject(forwardRef(() => TaskService)) private tasks: TaskService,
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

  /* ─────────────────────────  SESSION BOOTSTRAP  ───────────────────────── */
  private async createAgentSession(agentId: string, sessionId: string) {
    const agent = await this.getAgent({ agentId });
    const currentTime = new Date();

    console.log('session id from createsession', sessionId);
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
          
          Note that you can interact and engage with other agents using the interactWithAgent tool. All agent interactions will be handled within this shared session context.

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
      model: 'gpt-4o',
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
    stream?: boolean; // ✅ stream flag
  }): Observable<any> {
    return new Observable<any>((subscriber) => {
      const run = async () => {
        const tStart = performance.now();
        const {
          agentId,
          sessionId,
          initiator,
          stream = false, // default false
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
                  name: 'gpt-4o',
                  temperature: agent.temperature || 0.7,
                  maxTokens: agent.maxTokens || 2000,
                  topP: agent.topP || 1,
                  presencePenalty: agent.presencePenalty || 0,
                  frequencyPenalty: agent.frequencyPenalty || 0,
                },
                createdAt: new Date(),
                updatedAt: new Date(),
              },
            });
            currentSessionId = newSession.sessionId;
            isNewSession = true;
          }

          /**
           * SHARED SESSION CONTEXT APPROACH:
           * - All agents in a session share the same context (spaceContext)
           * - No recursive child sessions are created
           * - Agent interactions are handled via the shared event bus
           * - All messages, tool calls, and agent interactions are tracked in one place
           */

          // Get or create the shared session context
          const spaceContext =
            this.spaceConductor.getOrCreateContext(currentSessionId);

          // Set up auto-save for the session context
          // this.autoSaveSharedContext(currentSessionId); // TODO: Autosave Shared Context - might be expensive for now

          // Initialize the session context if it's a new session
          if (isNewSession) {
            // push initial message to the session context
            const bootMsgs = await this.createAgentSession(
              agentId,
              currentSessionId,
            );
            bootMsgs.messages.forEach((msg) => {
              spaceContext.bus.next({
                type: 'message',
                agentId,
                payload: msg,
                timestamp: Date.now(),
              });
            });
          }

          // Add the initial messages to the session context
          if (props.messages) {
            props.messages.forEach((msg) => {
              spaceContext.bus.next({
                type: 'message',
                agentId,
                payload: msg,
                timestamp: Date.now(),
              });
            });
          }

          // Set up callbacks to handle events
          let accumulatedContent = '';
          const callbackHandler = BaseCallbackHandler.fromMethods({
            handleLLMNewToken: async (token: string) => {
              if (stream) {
                accumulatedContent += token;
                // Only emit the token to the subscriber for real-time display
                // Don't add individual tokens to spaceContext
                subscriber.next({
                  type: 'token',
                  timestamp: new Date().toISOString(),
                  role: 'ai',
                  content: token,
                });
              }
            },
            handleLLMEnd: async () => {
              // Add the complete accumulated message to spaceContext when LLM finishes
              if (stream && accumulatedContent) {
                const event: AgentEvent = {
                  type: 'message',
                  agentId,
                  payload: {
                    role: 'ai',
                    content: accumulatedContent,
                  },
                  timestamp: Date.now(),
                };
                spaceContext.bus.next(event);
                accumulatedContent = ''; // Reset for next message
              }
            },
            handleToolStart: async (tool: any, input: string) => {
              spaceContext.bus.next({
                type: 'tool',
                agentId,
                payload: {
                  type: 'toolStart',
                  toolName: tool.name,
                  input,
                },
                timestamp: Date.now(),
              });
            },
            handleToolEnd: async (output: any) => {
              spaceContext.bus.next({
                type: 'tool',
                agentId,
                payload: {
                  type: 'toolEnd',
                  output,
                },
                timestamp: Date.now(),
              });
            },
          });

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

          const llm = new ChatOpenAI({
            model: 'gpt-4o',
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
                        metadata: { agentId },
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

                // Emit different event types based on tool name
                if (fn === 'interactWithAgent') {
                  // For agent interactions, emit as agentCall event
                  const agentArgs = args as any;
                  spaceContext.bus.next({
                    type: 'agentCall',
                    agentId: agentArgs.agentId, // target agent ID
                    payload: {
                      initiator: agentId,
                      message: agentArgs.messages?.[0]?.content || '',
                      sessionId: currentSessionId,
                      timestamp: Date.now(),
                    },
                    timestamp: Date.now(),
                  });
                } else {
                  // For regular tools, emit as tool event
                  spaceContext.bus.next({
                    type: 'tool',
                    agentId,
                    payload: callObj,
                    timestamp: Date.now(),
                  });
                }

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

          // Use shared context messages instead of reconstructing from graph
          let messages: Messages = spaceContext.getMessages().map((m) => ({
            ...m,
            type: m.role,
            content: m.content ?? '',
          }));

          if (!sessionId) {
            const boot = await this.createAgentSession(
              agentId,
              currentSessionId,
            );
            messages.push(
              ...boot.messages.map((m) => ({
                ...m,
                type: m.role,
                content: m.content ?? '',
              })),
            );
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

            // Extract the assistant's response and add it to spaceContext
            // This handles both streaming and non-streaming cases
            const lastMessage = result.messages?.at(-1);
            if (
              lastMessage &&
              lastMessage.toDict().type === 'assistant' &&
              !stream
            ) {
              // For non-streaming, add the complete assistant message to context
              const messageContent =
                typeof lastMessage.content === 'string'
                  ? lastMessage.content
                  : compact(
                      map(lastMessage.content as any[], (_) => get(_, 'text')),
                    ).join('\n');

              if (messageContent) {
                spaceContext.bus.next({
                  type: 'message',
                  agentId,
                  payload: {
                    role: 'assistant',
                    content: messageContent,
                  },
                  timestamp: Date.now(),
                });
              }
            }

            const pending = await this.tasks.getNextExecutable(
              agentId,
              currentSessionId,
            );
            if (!pending) break;
          }

          const toolCalls = collectedToolCalls.filter(
            (call) => call.name !== 'interactWithAgent',
          );

          const agentInteractions = collectedToolCalls.filter(
            (call) => call.name === 'interactWithAgent',
          );

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
                      ? agentInteractions
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

          // Emit final result to shared session context
          const finalPayload = {
            ...lastMessage,
            sessionId: currentSessionId,
            title: sessionTitle,
            metadata: {
              toolCalls,
              agentCalls: agentInteractions,
            },
          };

          spaceContext.bus.next({
            type: 'final',
            agentId,
            payload: finalPayload,
            timestamp: Date.now(),
          });

          // Save shared context to database
          await this.spaceConductor.saveSharedContextToDB(currentSessionId);

          subscriber.next({
            type: 'final',
            payload: finalPayload,
          });

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
        model: 'gpt-4o-mini',
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

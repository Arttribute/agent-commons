import * as schema from '#/models/schema';
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
import {
  BadRequestException,
  Injectable,
  OnModuleInit,
  forwardRef,
  Inject,
} from '@nestjs/common';
import { ModelProviderFactory } from '~/modules/model-provider';
import crypto from 'crypto';
import dedent from 'dedent';
import {
  eq,
  InferInsertModel,
  InferSelectModel,
  inArray,
  sql,
} from 'drizzle-orm';
import { compact, first, get, map, omit } from 'lodash';
import {
  ChatCompletionCreateParams,
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from 'openai/resources/chat/completions';
import { Except } from 'type-fest';
import typia from 'typia';
import { v4 as uuidv4 } from 'uuid';
import { DatabaseService } from '~/modules/database/database.service';
import { EncryptionService } from '~/modules/encryption';
import { SessionService } from '~/session/session.service';
import { ToolService } from '~/tool/tool.service';
import { CommonTool } from '../tool/tools/common-tool.service';
import { BaseCallbackHandler } from '@langchain/core/callbacks/base';
import { IChatGptSchema } from '@samchon/openapi';
import { getPosthog } from '~/helpers/posthog';
import { LogService } from '~/log/log.service';
import { TaskService } from '~/task/task.service';
import { TaskExecutionService } from '~/task/task-execution.service';
import { ToolLoaderService } from '~/tool/tool-loader.service';
import { Observable, of } from 'rxjs';
import { SpaceToolsService } from '~/space/space-tools.service';
import { UsageService } from '~/modules/usage/usage.service';
import { calculateCost } from '~/modules/model-provider/model-registry';
import { MemoryService } from '~/memory/memory.service';
import { WalletService } from '~/wallet/wallet.service';

const got = import('got');

const app = typia.llm.application<CommonTool, 'chatgpt'>();

@Injectable()
export class AgentService implements OnModuleInit {
  constructor(
    private db: DatabaseService,
    private session: SessionService,
    private toolService: ToolService,
    private logService: LogService,
    private modelProviderFactory: ModelProviderFactory,
    private encryption: EncryptionService,
    private usageService: UsageService,
    private memoryService: MemoryService,
    private walletService: WalletService,
    @Inject(forwardRef(() => TaskService)) private tasks: TaskService,
    @Inject(forwardRef(() => TaskExecutionService))
    private taskExecution: TaskExecutionService,
    @Inject(forwardRef(() => ToolLoaderService))
    private toolLoader: ToolLoaderService,
    @Inject(forwardRef(() => SpaceToolsService))
    private spaceTools: SpaceToolsService,
  ) {}

  /* ─────────────────────────  INIT  ───────────────────────── */
  async onModuleInit() {
    await PostgresSaver.fromConnString(
      `postgresql://${process.env.POSTGRES_USER}:${process.env.POSTGRES_PASSWORD}@${process.env.POSTGRES_HOST}:${process.env.POSTGRES_PORT}/${process.env.POSTGRES_DATABASE}`,
    ).setup();
  }

  /* ─────────────────────────  CREATE & GET AGENT  ───────────────────────── */
  async createAgent(props: {
    value: Except<InferInsertModel<typeof schema.agent>, 'agentId'>;
    commonsOwned?: boolean;
  }) {
    const agentId = uuidv4();
    const agentOwner = props.commonsOwned
      ? '0xD9303DFc71728f209EF64DD1AD97F5a557AE0Fab'
      : (props.value.owner as string);

    const insertValue = { ...props.value };
    if (insertValue.modelApiKey) {
      insertValue.modelApiKey = this.encryptApiKey(insertValue.modelApiKey);
    }

    const [agentEntry] = await this.db
      .insert(schema.agent)
      .values({
        ...insertValue,
        agentId,
        owner: agentOwner,
        isLiaison: false,
      })
      .returning();

    // Auto-provision a primary EOA wallet for every new agent
    await this.walletService.createWallet({
      agentId,
      walletType: 'eoa',
      label: 'Primary',
    }).catch((err) =>
      console.error(`[AgentService] Failed to create wallet for agent ${agentId}:`, err),
    );

    return agentEntry;
  }

  async getAgent(props: { agentId: string }) {
    const agent = await this.db.query.agent.findFirst({
      where: (t) => eq(t.agentId, props.agentId),
    });
    if (!agent) throw new BadRequestException('Agent not found');
    return agent;
  }

  /* ─────────────────────────  TTS VOICES  ───────────────────────── */
  async getTtsVoices(args: {
    provider: 'openai' | 'elevenlabs';
    q?: string;
  }): Promise<Array<{ id: string; name: string; provider: string }>> {
    const { provider, q } = args;
    if (provider === 'elevenlabs') {
      const apiKey = process.env.ELEVENLABS_API_KEY;
      if (!apiKey) return [];
      try {
        const gotMod = await import('got');
        const httpc: any = (gotMod as any).default || gotMod;
        // Prefer search endpoint when query provided; otherwise list voices
        const url = q
          ? `https://api.elevenlabs.io/v1/voices/search?query=${encodeURIComponent(q)}`
          : `https://api.elevenlabs.io/v1/voices`;
        const res = await httpc.get(url, {
          headers: { 'xi-api-key': apiKey },
          responseType: 'json',
        });
        const body: any = res.body;
        const voices: any[] = body?.voices || body || [];
        return voices
          .filter((v) => v && (v.voice_id || v.voiceId) && v.name)
          .map((v) => ({
            id: String(v.voice_id || v.voiceId),
            name: String(v.name),
            provider: 'elevenlabs',
          }));
      } catch (e) {
        console.warn('Failed to fetch ElevenLabs voices:', e);
        return [];
      }
    }

    // OpenAI: no official list API yet; allow env override or fallback to a curated set from docs
    const envList = (process.env.OPENAI_TTS_VOICES || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const defaultVoices = envList.length
      ? envList
      : ['alloy', 'coral', 'verse'];
    const filtered = q
      ? defaultVoices.filter((v) => v.toLowerCase().includes(q.toLowerCase()))
      : defaultVoices;
    return filtered.map((v) => ({ id: v, name: v, provider: 'openai' }));
  }

  /* ─────────────────────────  ENCRYPTION HELPERS  ───────────────────────── */
  private encryptApiKey(plaintext: string): string {
    const { encryptedValue, iv, tag } = this.encryption.encrypt(plaintext);
    return `enc:${iv}:${tag}:${encryptedValue}`;
  }

  private decryptApiKey(stored: string): string {
    if (!stored.startsWith('enc:')) return stored; // plaintext (legacy)
    const [, iv, tag, encryptedValue] = stored.split(':');
    return this.encryption.decrypt(encryptedValue, iv, tag);
  }

  /* ─────────────────────────  SYSTEM PROMPT  ───────────────────────── */
  private buildSystemPrompt(
    agent: { agentId: string; persona?: string | null; instructions?: string | null; [key: string]: any },
    sessionId: string,
    childSessionsInfo: string,
    memoryBlock = '',
  ): string {
    const currentTime = new Date();
    return dedent`You are the following agent:
      ${JSON.stringify(omit(agent, ['instructions', 'persona', 'wallet', 'modelApiKey']))}
      Persona:
      ${agent.persona}

      Instructions:
      ${agent.instructions}

      The current date and time is ${currentTime.toISOString()}.
      **SESSION ID**: ${sessionId}

      ${memoryBlock}Note that you can interact and engage with other agents using the interactWithAgent tool. This tool allows you to interact with other agents one at a time. Once you initiate a conversation with another agent, you can continue the conversation by calling the interactWithAgent tool again with the sessionId provided in the result of running the interactWithAgent tool. This will allow you to continue the conversation with the other agent.${childSessionsInfo}
      It is also possible to interact with a group of agents in spaces. You can use the createSpace tool to create a new space and can add other agents to the space using addAgentToSpace tool. Once in a space, you can send meassages to the space using the sendMessageToSpace tool. To get the context of the interactions on space, you can use the getSpaceMessages tool before sending messagesto the space. You can also join spaces created by other entities using the joinSpace tool.
      To unsubscribe from a space, you can use the unsubscribeFromSpace tool. To subscribe to a space, you can use the subscribeToSpace tool.
      If your response involves multiple tasks, let them know by sending a message before creating the tasks.
      If you have a session id, provide it as an arg when sending a message to a space.
      When getting live audio streams from a space, you can respond with voice using the speakInSpace tool which allows you to speak in the space.
      While monitoring webcast streams you can interact with the webcast stream using the given space tools for that specific stream.

      STRICTLY ABIDE BY THE FOLLOWING:
      • If a request is simple and does not require complex planning, give an immediate response.
      • If a request is complex and requires multiple steps, use createTask to create tasks with clear descriptions and dependencies.
      • When creating tasks, think very deeply and critically. Set a SMART (Specific, Measurable, Achievable, Relevant, and Time-bound) task with a clear description. Consider all factors and create a well thought-out plan of action in the task description.
      • For tasks with dependencies, use the dependsOn parameter to specify which tasks must complete first.
      • For every task, specify the context which should contain all necessary information that are either needed or beneficial for the task.
      • Specify the tools needed for each task in the tools parameter. If specific tools are required, set toolConstraintType to 'hard' to restrict the task to only those tools. Use 'soft' for recommendations.
      • You can add toolInstructions to provide guidance like "If you encounter X, use tool Y" to help task execution.
      • For recurring tasks, use the isRecurring and cronExpression parameters. Set recurringSessionMode to 'same' to keep tasks in the current session, or 'new' to create a new session for each recurrence.
      • For workflow-based tasks, set executionMode to 'workflow' and provide the workflowId and workflowInputs.
      • STRICTLY DO NOT start execution of a task or update any task using updateTaskProgress until the user specifically asks you to do so.
      ## ONLY DO THESE ONCE THE TASKS ARE FULLY CREATED AND THE USER ASKS YOU TO DO SO:
      • As you execute tasks, update task progress accordingly with all the necessary information using updateTaskProgress with the necessary details. Provide the actual result content of the task and the summary.
      • If tasks require the use of tools, use the specified tools to execute the tasks. Follow any toolInstructions provided.
      • For each task, perform the task and produce the content expected. The result content should be the actual content produced (code, data, reports, images, videos, text, PDFs, etc.).
      • Unless given specific completion deadlines and schedules, all tasks should be completed immediately.
      • If you encounter new information relevant to a task, update the task and task context with the new information.
      • If you are unable to complete a task, call updateTaskProgress with the necessary details and provide a summary of the failure.
    `;
  }

  /* ─────────────────────────  SESSION BOOTSTRAP  ───────────────────────── */
  private async createAgentSession(agentId: string, sessionId: string, firstUserMessage = '') {
    const [agent, childSessions, memoryBlock] = await Promise.all([
      this.getAgent({ agentId }),
      this.getChildSessions(sessionId),
      firstUserMessage
        ? this.memoryService.buildMemoryBlock(agentId, firstUserMessage).catch(() => '')
        : Promise.resolve(''),
    ]);
    const childSessionsInfo =
      childSessions.length > 0
        ? `\n\nEXISTING CHILD SESSIONS:\nYou have the following ongoing conversations with other agents. Use these sessionIds to continue existing conversations instead of starting new ones:\n${childSessions.map((cs) => `- Agent ${cs.childAgentId}: ${cs.title || 'Untitled conversation'} (sessionId=${cs.childSessionId}, started: ${cs.createdAt})`).join('\n')}`
        : '';

    const messages: ChatCompletionMessageParam[] = [
      {
        role: 'system',
        content: this.buildSystemPrompt(agent, sessionId, childSessionsInfo, memoryBlock),
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
    const agent = await this.getAgent({ agentId: props.agentId });
    if (!agent.autonomyEnabled) return;

    const pendingTasks = await this.taskExecution.listAgentTasks(props.agentId);
    const tasksToExecute = pendingTasks.filter((t) => t.status === 'pending');

    if (!tasksToExecute || tasksToExecute.length === 0) return;

    const nextTask = tasksToExecute.sort(
      (a, b) => (b.priority || 0) - (a.priority || 0),
    )[0];
    const taskSessionId = nextTask.sessionId;

    if (taskSessionId) {
      return this.runAgent({
        agentId: props.agentId,
        messages: [
          {
            role: 'user',
            content: `⫷⫷AUTOMATED_USER_TRIGGER⫸⫸:
              This is an automated trigger. Execute pending tasks as needed.`,
          },
        ],
        sessionId: taskSessionId,
        initiator: agent.agentId,
      });
    }
  }

  /* ─────────────────────────  MAIN RUN  ───────────────────────── */

  public runAgent(props: {
    agentId: string;
    messages?: ChatCompletionMessageParam[];
    sessionId?: string;
    spaceId?: string;
    initiator: string;
    parentSessionId?: string;
    stream?: boolean; // ✅ stream flag
    turnCount?: number;
    maxTurns?: number;
  }): Observable<any> {
    return new Observable<any>((subscriber) => {
      // Keep SSE connection alive through proxies
      const heartbeat = setInterval(() => subscriber.next({ type: 'heartbeat' }), 15_000);

      const run = async () => {
        const tStart = performance.now();
        /** Trace ID — one UUID per top-level runAgent() invocation. Links all
         *  LLM calls (including tool sub-calls) in a single run. Passed to
         *  usageService.record() and emitted in the `final` SSE event. */
        const traceId = uuidv4();
        const {
          agentId,
          sessionId,
          spaceId,
          initiator,
          parentSessionId,
          stream = false, // default false
          turnCount = 0, // default 0
          maxTurns = 3, // default 3
        } = props;

        if (turnCount >= maxTurns) {
          return of({
            type: 'final',
            payload: {
              sessionId,
              info: `Max turns (${maxTurns}) reached – no further replies.`,
            },
          });
        }

        try {
          const agent = await this.getAgent({ agentId });

          let currentSessionId = sessionId;
          let isNewSession = false;
          if (!currentSessionId) {
            if (!spaceId) {
              const newSession = await this.session.createSession({
                value: {
                  sessionId: uuidv4(),
                  agentId,
                  initiator: initiator,
                  model: {
                    name: agent.modelId ?? 'gpt-4o',          // legacy compat
                    provider: agent.modelProvider ?? 'openai',
                    modelId: agent.modelId ?? 'gpt-4o',
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
            } else {
              // In a space: reuse or create a single agent-space session
              const { session: spSession, created } =
                await this.session.getOrCreateAgentSpaceSession({
                  agentId,
                  spaceId,
                  initiator,
                  parentSessionId: parentSessionId ?? undefined,
                  model: {
                    name: agent.modelId ?? 'gpt-4o',
                    provider: agent.modelProvider ?? 'openai',
                    modelId: agent.modelId ?? 'gpt-4o',
                    temperature: agent.temperature || 0.7,
                    maxTokens: agent.maxTokens || 2000,
                    topP: agent.topP || 1,
                    presencePenalty: agent.presencePenalty || 0,
                    frequencyPenalty: agent.frequencyPenalty || 0,
                  },
                });
              currentSessionId = spSession.sessionId;
              isNewSession = created;
            }
          }

          // ✅ Load tools using centralized ToolLoaderService
          const staticDefs = map(app.functions, (_) => ({
            type: 'function',
            function: {
              ..._,
              parameters:
                _?.parameters as unknown as ChatCompletionTool['function']['parameters'],
            },
          })) as ChatCompletionTool[];

          // Load space-specific tools if in a space
          let spaceToolDefs: ChatCompletionTool[] = [];
          if (spaceId) {
            const spaceToolSpecs = this.spaceTools.getToolsForSpace(spaceId);
            spaceToolDefs = spaceToolSpecs.map((spec) => ({
              type: 'function',
              function: {
                name: spec.name,
                description: spec.description || 'Space provided tool',
                parameters: spec.parameters || {
                  type: 'object',
                  properties: {},
                },
              },
            })) as ChatCompletionTool[];
          }

          const toolDefs = await this.toolLoader.loadToolsForAgent({
            agentId,
            userId: agent.owner ?? undefined,
            spaceId,
            staticToolDefs: staticDefs,
            spaceToolDefs: spaceToolDefs,
            endpoint: `http://localhost:${process.env.PORT}/v1/agents/tools`,
          });

          const toolUsage: {
            name: string;
            status: string;
            duration?: number;
          }[] = [];
          const executedCalls: any[] = [];

          const callbackHandler = BaseCallbackHandler.fromMethods({
            handleLLMNewToken: async (token: string) => {
              if (stream) {
                subscriber.next({
                  type: 'token',
                  role: 'ai',
                  content: token,
                  timestamp: new Date().toISOString(),
                });
              }
            },
            handleToolStart: async (tool: any, input: string) => {
              subscriber.next({
                type: 'toolStart',
                toolName: tool.name,
                input,
                timestamp: new Date().toISOString(),
              });
            },
            handleToolEnd: async (output: any) => {
              subscriber.next({
                type: 'toolEnd',
                output,
                timestamp: new Date().toISOString(),
              });
            },
            /** Structured trace log — parseable by log aggregators (CloudWatch, Datadog, etc.) */
            handleLLMEnd: async (result: any, runId: string) => {
              const usage = result?.llmOutput?.tokenUsage ?? result?.llmOutput?.usage ?? {};
              console.log(JSON.stringify({
                level: 'info',
                event: 'llm_call',
                traceId,
                langchainRunId: runId,
                agentId,
                sessionId: currentSessionId,
                inputTokens:  usage.prompt_tokens    ?? usage.input_tokens  ?? 0,
                outputTokens: usage.completion_tokens ?? usage.output_tokens ?? 0,
                ts: new Date().toISOString(),
              }));
            },
          });

          // ── Build LLM from agent/session model config (provider-agnostic) ──
          const sessionRecord = await this.session.getSession({ id: currentSessionId });
          const decryptedApiKey = agent.modelApiKey
            ? this.decryptApiKey(agent.modelApiKey)
            : undefined;
          const sessionModel = SessionService.decryptModelApiKey(
            sessionRecord?.model as any,
            this.encryption,
          );
          const llm = this.modelProviderFactory.buildFromSessionModel(
            sessionModel,
            {
              provider: (agent.modelProvider as any) ?? 'openai',
              modelId: agent.modelId ?? 'gpt-4o',
              apiKey: decryptedApiKey,
              baseUrl: agent.modelBaseUrl ?? undefined,
              temperature: agent.temperature ?? 0,
              maxTokens: agent.maxTokens ?? undefined,
              topP: agent.topP ?? undefined,
              presencePenalty: agent.presencePenalty ?? undefined,
              frequencyPenalty: agent.frequencyPenalty ?? undefined,
            },
          );

          const llmWithTools = (llm as any).bindTools(toolDefs as any, {
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
                          spaceId,
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
          if (isNewSession) {
            const firstMsg = props.messages?.find((m) => m.role === 'user');
            const firstUserText = typeof firstMsg?.content === 'string' ? firstMsg.content : '';
            const boot = await this.createAgentSession(
              agentId,
              currentSessionId,
              firstUserText,
            );
            messages.push(
              ...(boot.messages.map((m) => ({
                ...m,
                type: m.role,
                content: m.content ?? '',
              })) as any[]),
            );
          } else {
            // ✅ For existing sessions, load the full history including agent_speech entries
            const currentSession = await this.session.getSession({
              id: currentSessionId,
            });

            // Fetch agent and inject fresh persona/instructions for existing sessions
            const firstMsg = props.messages?.find((m) => m.role === 'user');
            const firstUserText = typeof firstMsg?.content === 'string' ? firstMsg.content : '';
            const [agent, childSessions, memoryBlock] = await Promise.all([
              this.getAgent({ agentId }),
              this.getChildSessions(currentSessionId),
              firstUserText
                ? this.memoryService.buildMemoryBlock(agentId, firstUserText).catch(() => '')
                : Promise.resolve(''),
            ]);
            const childSessionsInfo =
              childSessions.length > 0
                ? `\n\nEXISTING CHILD SESSIONS:\nYou have the following ongoing conversations with other agents. Use these sessionIds to continue existing conversations instead of starting new ones:\n${childSessions.map((cs) => `- Agent ${cs.childAgentId}: ${cs.title || 'Untitled conversation'} (sessionId=${cs.childSessionId}, started: ${cs.createdAt})`).join('\n')}`
                : '';

            messages.push({
              type: 'system',
              role: 'system',
              content: this.buildSystemPrompt(agent, currentSessionId, childSessionsInfo, memoryBlock),
            } as any);

            if (
              currentSession?.history &&
              Array.isArray(currentSession.history)
            ) {
              // Load user and assistant messages only — skip system messages since we inject fresh persona above
              const validHistoryMessages = currentSession.history.filter(
                (entry: any) =>
                  entry.role === 'user' || entry.role === 'assistant',
              );
              messages.push(
                ...validHistoryMessages.map((historyEntry: any) => ({
                  type: historyEntry.role,
                  role: historyEntry.role,
                  content: historyEntry.content ?? '',
                })),
              );
            }
          }

          if (spaceId) {
            // ✅ For space-based runs, inject system message with space info
            const space = await this.db.query.space.findFirst({
              where: (s) => eq(s.spaceId, spaceId),
            });
            if (!space) {
              throw new BadRequestException('Space not found');
            }
            messages.push({
              type: 'system',
              role: 'system',
              content: `
              You are currently in the following space:
              - Space ${space.spaceId}: ${space.name || 'Untitled space'} (created: ${space.createdAt})
              Remember your agent Id is : ${agentId}

              You are receiving this message because you are subscribed to this space.
              
              You can interact with other agents in this space using the sendMessageToSpace tool.
              You can speak up in the space  using voice with the speakInSpace tool. Typically you would use this tool when there is a live audio stream in the space which will be transcribed and sent to you.

              If you create tasks, you need to inform the space members about it by sending a message to the space.
              
              If you want to unsubscribe from this space, you can use the unsubscribeFromSpace tool.

              In your responses, make sure to consider the context of the space and any recent messages or activities that have taken place within the space session. Read every single message and take note of who said what including yourself(messages may have ids of the speakers including messages with your id ) and contribute meaningfully without unnecessarily repeating what has already been said and try to add valuable information.
              `,
            } as any);
          }

          if (props.messages?.length) {
            messages.push(
              ...(props.messages.map((m) => ({
                ...m,
                type: m.role,
                content: m.content ?? '',
              })) as any[]),
            );
          }

          // ── Inject relevant memories into the system prompt ───────────────
          const latestUserMsg =
            props.messages?.findLast((m) => m.role === 'user')?.content as string | undefined;
          const memoryBlock = await this.memoryService.buildMemoryBlock(
            agentId,
            latestUserMsg ?? '',
          ).catch(() => '');

          if (memoryBlock) {
            // Append to the existing system message, or push a new one
            const sysIdx = messages.findIndex(
              (m: any) => m.role === 'system' || m.type === 'system',
            );
            if (sysIdx >= 0) {
              const sys = messages[sysIdx] as any;
              messages[sysIdx] = {
                ...sys,
                content: `${sys.content}${memoryBlock}`,
              };
            } else {
              messages.push({
                type: 'system',
                role: 'system',
                content: memoryBlock,
              } as any);
            }
          }

          // Resolve effective provider/model for cost tracking
          const effectiveProvider = (agent.modelProvider ?? 'openai') as any;
          const effectiveModelId  = agent.modelId ?? 'gpt-4o';
          const isByok = !!agent.modelApiKey;

          // Accumulate token counts across all invoke() loops
          let totalInputTokens  = 0;
          let totalOutputTokens = 0;
          let totalCachedTokens = 0;

          let loop = 0;
          let max_recurssion = agent.autonomyEnabled ? 2 : 4;
          let finalResult = null;

          while (loop++ < max_recurssion) {
            // ✅ Check for next executable task using new TaskExecutionService
            const nextTask = await this.taskExecution.getNextExecutableTask(
              agentId,
              currentSessionId,
            );

            if (nextTask) {
              if (nextTask.executionMode === 'workflow' && nextTask.workflowId) {
                // Execute workflow task fully
                await this.taskExecution.executeTask(nextTask.taskId);

                // Continue to check for next task
                continue;
              }

              // ✅ For single/sequential tasks, mark as running and inject instruction
              await this.db
                .update(schema.task)
                .set({
                  status: 'running',
                  actualStart: new Date(),
                })
                .where(eq(schema.task.taskId, nextTask.taskId));

              // Inject task instruction into messages
              messages.push({
                type: 'user',
                role: 'user',
                content: `##TASK_INSTRUCTION: ${nextTask.description}`,
              } as any);
            }

            const tInvoke = performance.now();
            const result = await graph.invoke(
              { messages },
              { configurable: { thread_id: currentSessionId } },
            );
            const invokeDurationMs = Math.round(performance.now() - tInvoke);

            messages = result.messages;
            finalResult = result;

            // ── Extract token usage from the last AI message ──────────────
            const lastAiMsg = [...(result.messages as any[])]
              .reverse()
              .find((m: any) => m.getType?.() === 'ai' || m._getType?.() === 'ai');

            let inputTokens  = 0;
            let outputTokens = 0;
            let cachedTokens = 0;

            if (lastAiMsg) {
              // LangChain standardised usage_metadata (LangChain >= 0.2)
              const um = lastAiMsg.usage_metadata;
              if (um) {
                inputTokens  = um.input_tokens  ?? 0;
                outputTokens = um.output_tokens ?? 0;
                cachedTokens = um.input_token_details?.cache_read ?? 0;
              } else {
                // Fallback: provider-specific response_metadata
                const rm = lastAiMsg.response_metadata ?? {};
                // OpenAI shape
                const usage = rm.usage ?? rm.token_usage ?? {};
                inputTokens  = usage.prompt_tokens     ?? usage.input_tokens  ?? 0;
                outputTokens = usage.completion_tokens ?? usage.output_tokens ?? 0;
              }
            }

            const iterTotalTokens = inputTokens + outputTokens;
            totalInputTokens  += inputTokens;
            totalOutputTokens += outputTokens;
            totalCachedTokens += cachedTokens;

            // ── Persist usage_event row (fire-and-forget — don't block) ──
            if (iterTotalTokens > 0) {
              const costUsd = calculateCost(
                effectiveProvider,
                effectiveModelId,
                inputTokens,
                outputTokens,
              );
              this.usageService
                .record({
                  agentId:   agentId,
                  sessionId: currentSessionId as any,
                  provider:  effectiveProvider,
                  modelId:   effectiveModelId,
                  inputTokens,
                  outputTokens,
                  cachedTokens,
                  totalTokens: iterTotalTokens,
                  costUsd,
                  isByok,
                  durationMs: invokeDurationMs,
                  traceId,
                })
                .catch((err) =>
                  console.error('[UsageService] Failed to record event:', err),
                );
            }

            // Check for more pending tasks
            const pending = await this.taskExecution.getNextExecutableTask(
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

          const resolvedAgentCalls = await Promise.all(agentCalls);

          let sessionTitle = 'New Session';
          if (currentSessionId) {
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

            // Get existing history to preserve agent_speech entries added by other agents
            const existingHistory = (currentSession.history as any[]) || [];

            // Extract agent_speech entries that should be preserved
            const agentSpeechEntries = existingHistory.filter(
              (entry: any) => entry.metadata?.source === 'agent_speech',
            );

            // Create new history entries from the current agent run
            const newHistoryEntries = messageHistories.map((m) => ({
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
            }));

            // Merge and sort by timestamp to maintain chronological order
            const mergedHistory = [
              ...agentSpeechEntries,
              ...newHistoryEntries,
            ].sort((a, b) => {
              const timeA = new Date(a.timestamp).getTime();
              const timeB = new Date(b.timestamp).getTime();
              return timeA - timeB;
            });

            await this.session.updateSession({
              id: currentSessionId,
              delta: {
                endedAt: new Date(),
                title: isNewSession
                  ? spaceId
                    ? currentSession.title || `Space: ${spaceId}`
                    : sessionTitle
                  : currentSession.title ||
                    (spaceId ? `Space: ${spaceId}` : sessionTitle),
                metrics: {
                  totalTokens: totalInputTokens + totalOutputTokens,
                  toolCalls: toolUsage.length,
                  errorCount: toolUsage.filter((t) => t.status === 'error')
                    .length,
                },
                history: mergedHistory,
                // Ensure spaces list includes this space
                ...(spaceId
                  ? {
                      spaces: currentSession.spaces?.spaceIds?.includes(spaceId)
                        ? currentSession.spaces
                        : {
                            spaceIds: [
                              ...(currentSession.spaces?.spaceIds || []),
                              spaceId,
                            ],
                          },
                    }
                  : {}),
                updatedAt: new Date(),
              },
            });
          }

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

          const totalCostUsd = calculateCost(
            effectiveProvider,
            effectiveModelId,
            totalInputTokens,
            totalOutputTokens,
          );

          subscriber.next({
            type: 'final',
            payload: {
              ...lastMessage,
              sessionId: currentSessionId,
              title: sessionTitle ?? 'New Session',
              traceId,
              usage: {
                inputTokens:  totalInputTokens,
                outputTokens: totalOutputTokens,
                cachedTokens: totalCachedTokens,
                totalTokens:  totalInputTokens + totalOutputTokens,
                costUsd:      totalCostUsd,
              },
              metadata: {
                toolCalls,
                agentCalls: resolvedAgentCalls,
              },
            },
          });

          clearInterval(heartbeat);
          subscriber.complete();

          // ── Memory consolidation (fire-and-forget after stream closes) ──
          // Only consolidate non-space, non-child sessions to avoid noise
          if (currentSessionId && !spaceId && !parentSessionId) {
            const historyForConsolidation = (
              finalResult?.messages as any[] ?? []
            )
              .filter((m: any) => {
                const t = m.getType?.() ?? m.type;
                return t === 'human' || t === 'ai';
              })
              .map((m: any) => ({
                role: m.getType?.() === 'human' || m.type === 'human' ? 'user' : 'assistant',
                content:
                  typeof m.content === 'string'
                    ? m.content
                    : JSON.stringify(m.content),
              }));

            if (historyForConsolidation.length >= 2) {
              this.memoryService
                .consolidateSession(agentId, currentSessionId, historyForConsolidation)
                .catch((err) =>
                  console.error('[MemoryService] Consolidation failed:', err),
                );
            }
          }
        } catch (err) {
          clearInterval(heartbeat);
          subscriber.error(err);
        }
      };

      run();
      return () => clearInterval(heartbeat);
    });
  }

  private async generateSessionTitle(userMessage: string): Promise<string> {
    try {
      const truncatedMessage =
        userMessage.length > 200
          ? userMessage.substring(0, 200) + '...'
          : userMessage;

      // Use a fast model for title generation — always use platform OpenAI key
      const titleLlm = this.modelProviderFactory.build({
        provider: 'openai',
        modelId: 'gpt-4o-mini',
        temperature: 0.3,
        maxTokens: 20,
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
    const data = omit(updateData, ['wallet', 'agentId', 'createdAt']) as any;
    if (data.modelApiKey) {
      data.modelApiKey = this.encryptApiKey(data.modelApiKey);
    }
    const [updated] = await this.db
      .update(schema.agent)
      .set(data)
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
  ) {
    const [inserted] = await this.db
      .insert(schema.agentTool)
      .values({ agentId, toolId, usageComments })
      .returning();
    return inserted;
  }
  async removeAgentTool(id: string) {
    await this.db.delete(schema.agentTool).where(eq(schema.agentTool.id, id));
    return { success: true };
  }
}

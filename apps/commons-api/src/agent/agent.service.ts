import * as schema from '#/models/schema';
import { tool } from '@langchain/core/tools';
import { z } from 'zod';
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
  ForbiddenException,
  Injectable,
  Logger,
  OnModuleInit,
  forwardRef,
  Inject,
} from '@nestjs/common';
import { ModelProviderFactory } from '~/modules/model-provider';
import crypto from 'crypto';
import dedent from 'dedent';
import {
  and,
  eq,
  desc,
  InferInsertModel,
  InferSelectModel,
  inArray,
  or,
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
import { Observable } from 'rxjs';
import { SpaceToolsService } from '~/space/space-tools.service';
import { UsageService } from '~/modules/usage/usage.service';
import { calculateCost } from '~/modules/model-provider/model-registry';
import { extractTokenUsageFromLLMResult } from '~/modules/usage/token-usage.util';
import { MemoryService } from '~/memory/memory.service';
import { WalletService } from '~/wallet/wallet.service';
import { ActivityService } from '~/activity/activity.service';
import { FilesService } from '~/files';
import { ComputerService } from '~/computer';
import { agentRunProgress } from './run-progress';
import {
  RUNTIME_CAPABILITIES,
  normalizeRuntimeType,
} from './runtime/runtime.types';

const got = import('got');

const app = typia.llm.application<CommonTool, 'chatgpt'>();

const COMMONS_COPILOT_AVATAR = '/commons-copilot.png';
const COMMONS_COPILOT_INSTRUCTIONS = `You are Commons Copilot, the user's native guide and co-creator inside Agent Commons. You understand the web Studio, API, SDK, and agc CLI, and help users create, inspect, test, and manage agents, tools, skills, tasks, workflows, spaces, and code projects.

For platform management, inspect current resources before proposing changes. Workflow changes must go through proposeWorkflowChange so the platform can enforce the user's access mode and retain a reviewable, reversible record. Never claim a pending proposal has been applied. Use listCommonsResources to ground recommendations in the user's actual account. For code work in the CLI, use the provided local tools and respect their confirmation boundaries. Prefer small, valid, testable workflow graphs with explicit input/output nodes, typed mappings, and clear failure or approval paths.`;

type StreamStatusState = 'queued' | 'running' | 'completed' | 'failed';
type RunComputerRequest = {
  enabled: boolean;
  /** @deprecated Accepted from older clients and ignored. */
  computerIds?: string[];
  /** @deprecated Accepted from older clients and ignored. */
  lifecycle?: 'persistent' | 'ephemeral';
};

const ACTIVE_COMPUTER_RUN_STATUSES = new Set([
  'provisioning',
  'starting',
  'running',
  'idle',
]);

/**
 * Conversational turns that never need model reasoning: greetings, acks,
 * thanks, farewells, and "who are you" smalltalk. Deliberately conservative —
 * anything that could be a real question or task must NOT match, so it falls
 * through to the provider's default reasoning behavior.
 */
const TRIVIAL_TURN_PATTERN = new RegExp(
  '^(?:' +
    [
      '(?:hey|hi|hiya|hello|howdy|yo|sup|hey yo|yo yo|good (?:morning|afternoon|evening|night))(?:[\\s,!.]+(?:there|again|everyone|team|all))?',
      "how(?:'?s| is| are)? (?:you|it going|things|everything)(?: (?:doing|today))?",
      "what'?s up",
      '(?:thanks|thank you|thankyou|thx|ty|cheers|much appreciated)(?:[\\s,!.]+(?:so much|a lot|again|for (?:that|your help)))?',
      '(?:ok(?:ay)?|cool|nice|great|perfect|awesome|sweet|got it|sounds good|makes sense|alright|all right|understood|noted|will do|sure)',
      '(?:yes|yeah|yep|yup|no|nope|nah)',
      '(?:bye|goodbye|see (?:ya|you)(?: later)?|later|take care)',
      "(?:who are you|what are you|what can you do|what'?s your name|tell me about yourself)",
      '(?:lol|haha+|hehe+|lmao)',
    ].join('|') +
    ')[\\s!.?,:;~*\\u{1F300}-\\u{1FAFF}\\u2600-\\u27BF]*$',
  'iu',
);

@Injectable()
export class AgentService implements OnModuleInit {
  private readonly logger = new Logger(AgentService.name);

  /**
   * Pending CLI local-tool requests.
   * Key: requestId  Value: resolve fn that completes the tool call
   * The CLI POSTs back to /v1/agents/cli-tool-result to resolve these.
   */
  public readonly pendingCliToolRequests = new Map<
    string,
    (result: string) => void
  >();

  /** Called by the controller when the CLI POSTs a tool result. */
  resolveCliToolRequest(requestId: string, result: string): boolean {
    const resolve = this.pendingCliToolRequests.get(requestId);
    if (!resolve) return false;
    resolve(result);
    return true;
  }

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
    private activityService: ActivityService,
    private filesService: FilesService,
    private computerService: ComputerService,
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
    try {
      await PostgresSaver.fromConnString(
        `postgresql://${process.env.POSTGRES_USER}:${process.env.POSTGRES_PASSWORD}@${process.env.POSTGRES_HOST}:${process.env.POSTGRES_PORT}/${process.env.POSTGRES_DATABASE}?options=-c%20search_path%3Dpublic`,
      ).setup();
    } catch (err: any) {
      this.logger.error(`LangGraph checkpoint setup failed: ${err.message}`);
    }
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
    insertValue.modelProvider ??= 'openai';
    insertValue.modelId ??= 'gpt-5.4-mini';
    if (insertValue.modelApiKey) {
      insertValue.modelApiKey = this.encryptApiKey(insertValue.modelApiKey);
    }

    const runtimeType = normalizeRuntimeType(insertValue.runtimeType);
    insertValue.runtimeType = runtimeType;
    insertValue.runtimeStatus ??=
      runtimeType === 'native' ? 'ready' : 'stopped';
    insertValue.runtimeConfig ??= {
      deploymentMode: 'managed',
      channelPolicy: 'pairing',
      memoryMode: 'hybrid',
    };
    insertValue.runtimeCapabilities ??= RUNTIME_CAPABILITIES[runtimeType];
    insertValue.runtimeUpdatedAt ??= new Date();

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
    await this.walletService
      .createWallet({
        agentId,
        walletType: 'eoa',
        label: 'Primary',
      })
      .catch((err) =>
        console.error(
          `[AgentService] Failed to create wallet for agent ${agentId}:`,
          err,
        ),
      );

    const actorId = agentEntry.ownerUserId ?? agentEntry.owner ?? agentId;
    await this.activityService
      .record({
        eventType: 'agent.created',
        actorType: agentEntry.ownerUserId ? 'user' : 'service',
        actorId,
        workspaceId: agentEntry.workspaceId,
        subjectType: 'agent',
        subjectId: agentId,
        metadata: { name: agentEntry.name },
      })
      .catch((err) =>
        this.logger.warn(
          `Could not record agent.created activity for ${agentId}: ${err.message}`,
        ),
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
    agent: {
      agentId: string;
      persona?: string | null;
      instructions?: string | null;
      [key: string]: any;
    },
    sessionId: string,
    childSessionsInfo: string,
    memoryBlock = '',
    sessionTasks: Array<{
      taskId: string;
      title: string;
      status: string;
      description?: string | null;
      summary?: string | null;
      createdAt?: Date | null;
    }> = [],
    computerBlock = '',
  ): string {
    const currentTime = new Date();

    const taskLines =
      sessionTasks.length > 0
        ? sessionTasks
            .map((t) => {
              const statusLabel = t.status.toUpperCase();
              const summary = t.summary ? ` — ${t.summary}` : '';
              return `- [${statusLabel}] (${t.taskId}) ${t.title}${summary}`;
            })
            .join('\n')
        : '  (no tasks in this session yet)';

    const taskBlock = dedent`
      ## SESSION TASKS
      These are your tasks for the current session. Use this list to understand what has been requested, what you are currently working on, and what is still pending.
      ${taskLines}
    `;

    const copilotBlock = agent.isSystemManaged
      ? dedent`
          ## COMMONS COPILOT ROLE
          You are the user's default native Commons Copilot. You can work from Studio, the API, SDK, or CLI.
          Access mode: ${agent.copilotAccessMode ?? 'confirm'}
          Automatic scopes: ${(agent.copilotScopes ?? []).join(', ') || 'none'}
          Account mutations must use review-aware platform tools. Respect the returned requiresConfirmation flag and tell the user when a change is waiting in review.
        `
      : '';

    return dedent`You are an AI agent on the Agent Commons platform.

      ## YOUR IDENTITY
      Agent ID: ${agent.agentId}
      Name: ${agent.name ?? 'Unnamed Agent'}
      ${agent.persona ? `Persona: ${agent.persona}` : ''}
      ${agent.instructions ? `Instructions: ${agent.instructions}` : ''}
      ${copilotBlock}

      Current date/time: ${currentTime.toISOString()}
      Session ID: ${sessionId}
      ${memoryBlock}
      ${taskBlock}
      ${computerBlock}
      ${childSessionsInfo}

      ## AUTONOMOUS EXECUTION CONTRACT
      Own each clear request from intent to a verified outcome.
      - If the request is clear enough to act, begin immediately. Ask a question only when missing information would materially change the result or authorize a significant external side effect.
      - Once execution begins, continue through tool calls, retries, debugging, and validation without handing routine decisions back to the user.
      - A plan, code sample, or list of next steps is not completion when tools can perform the work.
      - Inspect existing state before changing it. Preserve useful work and avoid creating competing structures.
      - Use tool results as evidence. Retry recoverable failures with a changed approach instead of guessing.
      - Verify the actual outcome before reporting success. For software work, run the relevant checks; for browser work, inspect the rendered result and fix runtime or console errors.
      - Stop only when the outcome is verified, a genuine blocker requires user input or new authority, or an execution limit is reached. When blocked, state the exact evidence and smallest decision needed.
      - Keep the final response concise: what changed, what was verified, and any material caveat.

      ## PLATFORM CAPABILITIES

      ### Responding to users
      - For simple requests, reply directly and concisely.
      - For complex requests, choose and execute the work directly. Create platform tasks only when persistent tracking, scheduling, dependencies, delegation, or deferred execution materially helps; task creation must never replace doing the requested work.

      ### Tasks
      Tasks are units of work you can create, track, and execute. Use them for anything that benefits from structured tracking or deferred/scheduled execution.
      - **createTask** — create a task with a clear title and description. Set context with all information needed for execution. Use dependsOn to sequence tasks.
      - **updateTaskProgress** — update a task's status, progress (0–100), result content, and summary as you work through it.
      - Execution modes: 'single' (default), 'sequential', or 'workflow' (requires a workflowId).
      - For recurring tasks, set isRecurring: true and provide a cronExpression (e.g. '0 9 * * 1' = every Monday at 9 AM). Use recurringSessionMode: 'same' to keep history or 'new' for a fresh session each run.

      ### Agent-to-agent interaction
      - **interactWithAgent** — send a message to another agent and get a response. Pass the returned sessionId to continue the same conversation across calls.
      - To coordinate groups of agents, use **Spaces** (see below).${childSessionsInfo ? '' : '\n      - You currently have no active agent conversations.'}

      ### Spaces (multi-agent collaboration)
      Spaces are shared channels where multiple agents and humans can communicate.
      - **createSpace** — create a new space. **joinSpace** — join an existing one.
      - **addAgentToSpace / addHumanToSpace** — invite participants.
      - **sendMessageToSpace** — broadcast or direct-message within the space. Always call getSpaceMessages first to catch up on context before sending.
      - **getSpaceMessages** — read recent messages. **getMySpaces** — list spaces you're a member of.
      - For voice/audio: **speakInSpace** (TTS), **startStreamMonitoring** / **stopStreamMonitoring** (listen to live audio), **startCall / joinCall / leaveCall / advanceTurn / getCallState** (manage call sessions).
      - Always pass sessionId when sending space messages so context is linked correctly.

      ### Resources
      Resources are shared files, datasets, and tools on the platform.
      - **searchLibraryArtifacts** — semantic + lexical search across only the library artifacts explicitly available to you. Results contain file IDs and citeable excerpts.
      - **readUploadedFile** — read a selected library artifact in bounded chunks after permission checks.
      - **generateImage** — create an image with the stable GPT Image API. The result is stored in the owner's artifact library using their storage preference (Private S3 by default).
      - **uploadFileToIPFS** — explicit-only public IPFS publishing. Never call this for ordinary uploads, generated files, or library storage unless the user specifically asks for IPFS.

      ### Uploaded files
      Users can attach files to chat turns. The chat history contains file IDs and compact previews, never raw file bytes or base64.
      - **readUploadedFile** — read extracted text from an uploaded file in bounded chunks. Use offset/nextOffset for large files. Set includeImageUrls for images or rendered PDF pages when visual inspection is needed.
      - **createSpreadsheetFile** — create an .xlsx spreadsheet from rows and store it in the artifact library. Return the fileId to the user.
      - Treat fileId values as the durable handles for follow-up work. Do not ask the user to paste file contents that are available through readUploadedFile.

      ### Computers
      Each agent may have one isolated CommonOS computer with a persistent workspace, terminal, and browser. The runtime may sleep and be replaced, but files and computer identity persist across chats. Use it only when the user asks for computer-backed work or when the work materially requires a runtime, filesystem, browser, long-running process, app execution, or generated files.
      - **startAgentComputer** — idempotently wake or attach this agent's assigned computer.
      - **listAgentComputers** — inspect the assigned computer's current state.
      - **runComputerCommand** — run terminal work through the selected computer.
      - **readComputerFile** — read files from the computer workspace.
      - **writeComputerFiles** — write complete text files through a structured payload. Use this for all source-code creation and replacement; do not use shell heredocs or squeeze code into commands.
      - **openComputerBrowser** — open a URL in the computer browser and refresh browser state.
      - **testComputerBrowser** — inspect and exercise a real application in the browser, including console/page/network errors, interactions, and screenshots. Use it after builds and fixes; opening a URL alone is not sufficient verification.
      - Never create or ask for an extra computer. Continue in the same assigned workspace across sessions.
      - Keep terminal commands task-scoped, avoid secret exfiltration, and report created files, screenshots, URLs, and command results clearly.

      ### Repository and GitHub work
      For an existing repository, issue, backend service, complex dependency graph, or ML workload, use the persistent computer and the user's connected GitHub tools or authenticated gh CLI.
      - Read the ticket and repository guidance first, inspect the current branch and dirty files, then create a focused branch without discarding user work.
      - Write source through **writeComputerFiles**, run the repository's formatter, type checks, tests, builds, and browser checks, and fix failures before reporting completion.
      - When authorized, commit only the intended files, push the branch, and create or update a pull request with a concise summary and verification evidence.
      - Never claim a push, deployment, browser check, or pull request succeeded unless its command or tool result confirms it.

      ### Lightweight code projects
      For React prototypes, landing pages, dashboards, and other static frontend experiences, use lightweight code projects first. They do not require a computer and publish to durable low-cost public URLs.
      - **createCodeProject** — create a React project with initial files. **writeCodeProjectFiles** — write complete files directly; never squeeze source code into shell commands.
      - **readCodeProject** — inspect the current files and latest deployment. **publishCodeProject** — compile and publish the project.
      - **testCodeProject** — run desktop/mobile Chromium checks, inspect runtime/console/network failures, and test important interactions. A successful build is not enough: test it, fix every reported error, republish, and re-test before saying it works.
      - **exportCodeProjectToComputer** — move the project into the persistent computer when the work needs a backend, arbitrary packages, repository operations, ML/GPU compute, or unrestricted tooling.
      - Lightweight projects support React, CSS, local modules/assets, lucide-react, framer-motion, recharts, clsx, and tailwind-merge. They do not execute a Next.js server or arbitrary build plugins.
      - Prefer one purposeful write containing the complete related files. Iterate until the UI is polished, responsive, interactive, and publicly shareable.

      ### Goals
      Goals track high-level objectives across multiple tasks.
      - **createGoal** — define a goal with milestones. **updateGoalProgress** — update progress. **recomputeGoalProgress** — recalculate from task completions.

      ### External tools (dynamic & MCP)
      You may have additional tools available depending on your configuration:
      - **Dynamic tools** — user-created API integrations visible in your tool list.
      - **MCP tools** — tools from connected MCP servers (identified by their registered names).
      - Only call tools you can see in your available tool list. If a required tool is missing, inform the user.

      ## RULES

      ### Task creation
      - Only create tasks for genuinely multi-step or deferred work. Simple questions get a direct answer.
      - Write SMART task descriptions: specific, measurable, achievable, relevant, time-bound.
      - Always populate the context field with everything needed to execute the task independently.
      - If creating multiple tasks, tell the user before you start creating them.

      ### Task execution (when you receive a ##TASK_INSTRUCTION)
      - Execute the task immediately and completely.
      - Use the tools specified in the task's tools list. Follow toolInstructions if provided.
      - Produce the actual output requested — code, report, analysis, data, etc.
      - Call **updateTaskProgress** when finished: status 'completed', progress 100, full resultContent, concise summary.
      - If you cannot complete the task, call updateTaskProgress with status 'failed' and explain why.
      - In normal conversation (no ##TASK_INSTRUCTION present), do NOT spontaneously execute tasks.

      ### General behaviour
      - Be concise but complete. Don't pad responses.
      - Never fabricate tool results or pretend to call a tool you didn't.
      - If a request requires a tool you don't have access to, say so clearly.
    `;
  }

  /* ─────────────────────────  SESSION BOOTSTRAP  ───────────────────────── */
  private async createAgentSession(
    agentId: string,
    sessionId: string,
    firstUserMessage = '',
  ) {
    const [agent, childSessions, memoryBlock, sessionTasks, computerBlock] =
      await Promise.all([
        this.getAgent({ agentId }),
        this.getChildSessions(sessionId),
        firstUserMessage
          ? this.memoryService
              .buildMemoryBlock(agentId, firstUserMessage)
              .catch(() => '')
          : Promise.resolve(''),
        this.taskExecution.listSessionTasks(sessionId).catch(() => []),
        this.computerService
          .buildComputerPrompt(agentId, sessionId)
          .catch(() => ''),
      ]);
    const childSessionsInfo =
      childSessions.length > 0
        ? `\n\nEXISTING CHILD SESSIONS:\nYou have the following ongoing conversations with other agents. Use these sessionIds to continue existing conversations instead of starting new ones:\n${childSessions.map((cs) => `- Agent ${cs.childAgentId}: ${cs.title || 'Untitled conversation'} (sessionId=${cs.childSessionId}, started: ${cs.createdAt})`).join('\n')}`
        : '';

    const messages: ChatCompletionMessageParam[] = [
      {
        role: 'system',
        content: this.buildSystemPrompt(
          agent,
          sessionId,
          childSessionsInfo,
          memoryBlock,
          sessionTasks,
          computerBlock,
        ),
      },
    ];

    /* build tool definitions exactly like before */
    const storedTools = await this.toolService.getAllTools().catch(() => []);
    const dynamicTools = storedTools.map((dbTool) => ({
      type: 'function',
      function: { ...dbTool.schema, name: dbTool.name },
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
        ...staticTools.map((tool) => ({ ...tool, type: 'function' as const })),
      ],
      tool_choice: 'auto',
      parallel_tool_calls: true,
      model: 'gpt-5.4-mini',
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
      this.runAgent({
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
      }).subscribe({
        error: (err) =>
          this.logger.error(
            `triggerAgent error for ${props.agentId}: ${err.message}`,
          ),
      });
    }
  }

  /**
   * Dispatch a pending task to the agent immediately (fire-and-forget).
   * Used after user-created task creation — bypasses autonomyEnabled check
   * since the user explicitly requested execution.
   */
  dispatchPendingTask(agentId: string, sessionId: string) {
    this.runAgent({
      agentId,
      messages: [
        {
          role: 'user',
          content: `⫷⫷TASK_DISPATCH⫸⫸: A new task has been created for you. Execute your pending tasks now.`,
        },
      ],
      sessionId,
      initiator: agentId,
    }).subscribe({
      error: (err) =>
        this.logger.error(
          `dispatchPendingTask error for ${agentId}: ${err.message}`,
        ),
    });
  }

  /* ─────────────────────────  MAIN RUN  ───────────────────────── */

  public runAgent(props: {
    agentId: string;
    messages?: ChatCompletionMessageParam[];
    sessionId?: string;
    /** Internal checkpoint identity when a run must not reuse session history. */
    checkpointThreadId?: string;
    spaceId?: string;
    initiator: string;
    parentSessionId?: string;
    stream?: boolean; // ✅ stream flag
    turnCount?: number;
    maxTurns?: number;
    /** Extra text appended to the agent's system prompt (used by CLI for local tool manifest). */
    cliContext?: string;
    /**
     * Dynamic CLI tool catalog sent by the caller's own daemon/CLI process.
     * When present, this fully replaces the hardcoded CLI tool list below —
     * the caller is the single source of truth for what it can execute, so
     * adding a new pod-local tool never requires a commons-api change.
     */
    cliTools?: Array<{
      name: string;
      description: string;
      parameters: Record<string, unknown>;
    }>;
    /** Uploaded chat file references. Raw bytes are never passed into LangGraph state. */
    attachments?: Array<{ fileId: string }>;
    /** User selected computer usage for this chat turn. */
    computerRequest?: {
      enabled: boolean;
      /** @deprecated Ignored; each agent has one assigned computer. */
      computerIds?: string[];
      /** @deprecated Ignored; assigned computers are always persistent. */
      lifecycle?: 'persistent' | 'ephemeral';
    };
  }): Observable<any> {
    return new Observable<any>((subscriber) => {
      // Keep SSE connection alive through proxies
      const keepalive = setInterval(
        () => subscriber.next({ type: 'keepalive' }),
        15_000,
      );
      let unsubscribeProgress: () => void = () => undefined;

      const run = async () => {
        const tStart = performance.now();
        /** Trace ID — one UUID per top-level runAgent() invocation. Links all
         *  LLM calls (including tool sub-calls) in a single run. Passed to
         *  usageService.record() and emitted in the `final` SSE event. */
        const traceId = uuidv4();
        const {
          agentId,
          sessionId,
          checkpointThreadId,
          spaceId,
          initiator,
          parentSessionId,
          stream = false, // default false
          turnCount = 0, // default 0
          maxTurns = 3, // default 3
        } = props;
        let currentSessionId = sessionId;
        let computerRequest: RunComputerRequest | undefined =
          props.computerRequest;
        let computerPreparationBlock = '';
        let computerUnavailable = false;
        const emitStatus = (
          stage: string,
          status: StreamStatusState,
          message: string,
          detail?: string,
          payload?: Record<string, any>,
        ) => {
          if (!stream) return;
          subscriber.next({
            type: 'status',
            phase: 'commentary',
            stage,
            status,
            message,
            detail,
            payload,
            sessionId: currentSessionId,
            timestamp: new Date().toISOString(),
          });
        };
        unsubscribeProgress = agentRunProgress.subscribe(traceId, (event) => {
          if (!stream) return;
          subscriber.next({
            ...event,
            sessionId: event.sessionId ?? currentSessionId,
            timestamp: event.timestamp ?? new Date().toISOString(),
          });
        });

        emitStatus('request', 'running', 'Starting agent run');

        if (turnCount >= maxTurns) {
          subscriber.next({
            type: 'final',
            phase: 'final_answer',
            payload: {
              sessionId,
              info: `Max turns (${maxTurns}) reached – no further replies.`,
            },
          });
          clearInterval(keepalive);
          unsubscribeProgress();
          subscriber.complete();
          return;
        }

        try {
          const agent = await this.getAgent({ agentId });
          if (
            agent.isSystemManaged &&
            agent.isDefault &&
            (!initiator ||
              !agent.ownerUserId ||
              agent.ownerUserId.toLowerCase() !== initiator.toLowerCase())
          ) {
            throw new ForbiddenException(
              'Commons Copilot is private to its account owner',
            );
          }
          emitStatus('agent', 'completed', `Loaded ${agent.name ?? 'agent'}`);

          let isNewSession = false;
          if (!currentSessionId) {
            emitStatus('session', 'running', 'Opening a new conversation');
            if (!spaceId) {
              const newSession = await this.session.createSession({
                value: {
                  sessionId: uuidv4(),
                  agentId,
                  initiator: initiator,
                  model: {
                    name: agent.modelId ?? 'gpt-5.4-mini', // legacy compat
                    provider: agent.modelProvider ?? 'openai',
                    modelId: agent.modelId ?? 'gpt-5.4-mini',
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
              emitStatus(
                'session',
                'completed',
                'Conversation ready',
                undefined,
                {
                  sessionId: currentSessionId,
                  isNewSession,
                },
              );
            } else {
              // In a space: reuse or create a single agent-space session
              emitStatus(
                'session',
                'running',
                'Opening the space conversation',
              );
              const { session: spSession, created } =
                await this.session.getOrCreateAgentSpaceSession({
                  agentId,
                  spaceId,
                  initiator,
                  parentSessionId: parentSessionId ?? undefined,
                  model: {
                    name: agent.modelId ?? 'gpt-5.4-mini',
                    provider: agent.modelProvider ?? 'openai',
                    modelId: agent.modelId ?? 'gpt-5.4-mini',
                    temperature: agent.temperature || 0.7,
                    maxTokens: agent.maxTokens || 2000,
                    topP: agent.topP || 1,
                    presencePenalty: agent.presencePenalty || 0,
                    frequencyPenalty: agent.frequencyPenalty || 0,
                  },
                });
              currentSessionId = spSession.sessionId;
              isNewSession = created;
              emitStatus(
                'session',
                'completed',
                'Space conversation ready',
                undefined,
                {
                  sessionId: currentSessionId,
                  isNewSession,
                },
              );
            }
          } else {
            emitStatus(
              'session',
              'completed',
              'Resuming this conversation',
              undefined,
              {
                sessionId: currentSessionId,
                isNewSession,
              },
            );
          }

          if (computerRequest?.enabled) {
            const selectedComputerIds = [
              ...new Set((computerRequest.computerIds ?? []).filter(Boolean)),
            ];
            emitStatus(
              'computer',
              'running',
              selectedComputerIds.length
                ? 'Using the selected agent computer'
                : 'Waking the agent computer for this turn',
              'Persistent workspace',
              {
                computerIds: selectedComputerIds,
                lifecycle: 'persistent',
              },
            );

            if (!selectedComputerIds.length) {
              try {
                const activeComputers =
                  await this.computerService.listInstances({
                    agentId,
                    sessionId: currentSessionId,
                    includeTerminated: false,
                  });
                const reusable = activeComputers.find((computer: any) =>
                  ACTIVE_COMPUTER_RUN_STATUSES.has(String(computer.status)),
                );

                if (reusable?.computerId) {
                  selectedComputerIds.push(reusable.computerId);
                  emitStatus(
                    'computer',
                    'completed',
                    'Reusing an active agent computer',
                    reusable.name ?? reusable.computerId,
                    {
                      computerId: reusable.computerId,
                      status: reusable.status,
                      lifecycle: reusable.lifecycle,
                    },
                  );
                } else {
                  const started = await this.computerService.startComputer({
                    agentId,
                    sessionId: currentSessionId,
                    actorId: initiator,
                    actorType: 'user',
                    reason: 'Selected from the chat composer',
                    runId: traceId,
                  });
                  const failed = ['failed', 'error', 'unavailable'].includes(
                    String(started?.status),
                  );
                  if (started?.computerId && !failed) {
                    selectedComputerIds.push(started.computerId);
                  }
                  emitStatus(
                    'computer',
                    failed ? 'failed' : 'completed',
                    failed
                      ? 'Agent computer could not be started'
                      : 'Agent computer is ready',
                    started?.errorMessage ??
                      started?.name ??
                      started?.computerId,
                    {
                      computerId: started?.computerId,
                      status: started?.status,
                      lifecycle: 'persistent',
                    },
                  );
                  if (failed) {
                    computerUnavailable = true;
                    computerPreparationBlock = [
                      '## COMPUTER PREPARATION',
                      'The user selected Agent Computer for this turn, but the runtime could not be prepared.',
                      `Reason: ${started?.errorMessage ?? 'Unknown computer provisioning error'}`,
                      'Explain the limitation and continue without claiming computer access. Do not call computer tools again this turn unless the user changes the computer settings.',
                    ].join('\n');
                  }
                }
              } catch (error) {
                const message =
                  error instanceof Error ? error.message : String(error);
                computerUnavailable = true;
                computerPreparationBlock = [
                  '## COMPUTER PREPARATION',
                  'The user selected Agent Computer for this turn, but the runtime could not be prepared.',
                  `Reason: ${message}`,
                  'Explain the limitation and continue without claiming computer access. Do not call computer tools again this turn unless the user changes the computer settings.',
                ].join('\n');
                emitStatus(
                  'computer',
                  'failed',
                  'Agent computer could not be prepared',
                  message,
                );
              }
            } else {
              emitStatus(
                'computer',
                'completed',
                'Agent computer selection ready',
                selectedComputerIds.join(', '),
                { computerIds: selectedComputerIds },
              );
            }

            computerRequest = {
              ...computerRequest,
              computerIds: selectedComputerIds,
            };
          }

          // ✅ Load tools using centralized ToolLoaderService
          emitStatus('tools', 'running', 'Loading available tools');
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
            userId: agent.ownerUserId ?? agent.owner ?? undefined,
            spaceId,
            staticToolDefs: staticDefs,
            spaceToolDefs: spaceToolDefs,
            endpoint: `http://localhost:${process.env.PORT}/v1/agents/tools`,
          });
          emitStatus(
            'tools',
            'completed',
            'Tools loaded',
            `${toolDefs.length + spaceToolDefs.length} callable tool${
              toolDefs.length + spaceToolDefs.length === 1 ? '' : 's'
            }`,
          );

          const toolUsage: {
            name: string;
            status: string;
            duration?: number;
          }[] = [];
          const executedCalls: any[] = [];
          const llmRunStartedAt = new Map<string, number>();
          const usageContext = {
            provider: (agent.modelProvider ?? 'openai') as any,
            modelId: agent.modelId ?? 'gpt-5.4-mini',
            isByok: !!agent.modelApiKey,
          };
          const usageTotals = {
            inputTokens: 0,
            outputTokens: 0,
            cachedTokens: 0,
            costUsd: 0,
          };

          const callbackHandler = BaseCallbackHandler.fromMethods({
            handleLLMStart: async (
              _llm: any,
              _prompts: string[],
              runId: string,
            ) => {
              if (runId) llmRunStartedAt.set(runId, performance.now());
              emitStatus('model', 'running', 'Thinking');
            },
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
                phase: 'commentary',
                toolName: tool.name,
                input,
                sessionId: currentSessionId,
                timestamp: new Date().toISOString(),
              });
            },
            handleToolEnd: async (output: any) => {
              subscriber.next({
                type: 'toolEnd',
                phase: 'commentary',
                output,
                sessionId: currentSessionId,
                timestamp: new Date().toISOString(),
              });
            },
            /** Structured trace log — parseable by log aggregators (CloudWatch, Datadog, etc.) */
            handleLLMEnd: async (result: any, runId: string) => {
              const usage = extractTokenUsageFromLLMResult(result);
              const durationMs =
                runId && llmRunStartedAt.has(runId)
                  ? Math.round(performance.now() - llmRunStartedAt.get(runId)!)
                  : undefined;
              if (runId) llmRunStartedAt.delete(runId);
              emitStatus(
                'model',
                'completed',
                'Finished a reasoning step',
                durationMs ? `${durationMs} ms` : undefined,
              );

              if (!usage) {
                console.log(
                  JSON.stringify({
                    level: 'warn',
                    event: 'llm_call_usage_missing',
                    traceId,
                    langchainRunId: runId,
                    agentId,
                    sessionId: currentSessionId,
                    provider: usageContext.provider,
                    modelId: usageContext.modelId,
                    ts: new Date().toISOString(),
                  }),
                );
                return;
              }

              const costUsd = calculateCost(
                usageContext.provider,
                usageContext.modelId,
                Math.max(0, usage.inputTokens - usage.cachedTokens),
                usage.outputTokens,
              );

              usageTotals.inputTokens += usage.inputTokens;
              usageTotals.outputTokens += usage.outputTokens;
              usageTotals.cachedTokens += usage.cachedTokens;
              usageTotals.costUsd += costUsd;

              this.usageService
                .record({
                  agentId,
                  sessionId: currentSessionId as any,
                  provider: usageContext.provider,
                  modelId: usageContext.modelId,
                  inputTokens: usage.inputTokens,
                  outputTokens: usage.outputTokens,
                  cachedTokens: usage.cachedTokens,
                  totalTokens: usage.totalTokens,
                  costUsd,
                  isByok: usageContext.isByok,
                  durationMs,
                  traceId,
                })
                .catch((err) =>
                  console.error('[UsageService] Failed to record event:', err),
                );

              console.log(
                JSON.stringify({
                  level: 'info',
                  event: 'llm_call',
                  traceId,
                  langchainRunId: runId,
                  agentId,
                  sessionId: currentSessionId,
                  provider: usageContext.provider,
                  modelId: usageContext.modelId,
                  inputTokens: usage.inputTokens,
                  outputTokens: usage.outputTokens,
                  cachedTokens: usage.cachedTokens,
                  totalTokens: usage.totalTokens,
                  costUsd,
                  usageSource: usage.source,
                  ts: new Date().toISOString(),
                }),
              );
            },
          });

          // ── Build LLM from agent/session model config (provider-agnostic) ──
          const sessionRecord = await this.session.getSession({
            id: currentSessionId,
          });
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
              modelId: agent.modelId ?? 'gpt-5.4-mini',
              apiKey: decryptedApiKey,
              baseUrl: agent.modelBaseUrl ?? undefined,
              temperature: agent.temperature ?? 0,
              maxTokens: agent.maxTokens ?? undefined,
              topP: agent.topP ?? undefined,
              presencePenalty: agent.presencePenalty ?? undefined,
              frequencyPenalty: agent.frequencyPenalty ?? undefined,
              // Adaptive hint only — an explicit reasoningEffort on the
              // session model always wins inside buildFromSessionModel.
              reasoningEffort: this.resolveAdaptiveReasoningEffort(props),
            },
          );

          // CLI tool schemas to expose to the LLM (only when cliContext is present).
          // When the caller (e.g. the CommonOS daemon) sends its own dynamic
          // cliTools catalog, that fully replaces the hardcoded list below —
          // the caller is the single source of truth for what it can execute,
          // so it can add new pod-local tools without a commons-api change.
          const dynamicCliTools = props.cliTools?.length
            ? props.cliTools.map(
                (def): ChatCompletionTool => ({
                  type: 'function',
                  function: {
                    name: def.name,
                    description: def.description,
                    parameters: def.parameters as any,
                  },
                }),
              )
            : null;

          const cliToolSchemas: ChatCompletionTool[] = props.cliContext
            ? (dynamicCliTools ?? [
                {
                  type: 'function',
                  function: {
                    name: 'cli_list_directory',
                    description:
                      "List files and folders at a path on the user's local machine. Call this immediately when asked about local files or directories.",
                    parameters: {
                      type: 'object',
                      properties: {
                        path: {
                          type: 'string',
                          description:
                            'Directory path relative to session root (default: session root)',
                        },
                      },
                      required: [],
                    },
                  },
                },
                {
                  type: 'function',
                  function: {
                    name: 'cli_read_file',
                    description:
                      "Read the full contents of a file on the user's local machine.",
                    parameters: {
                      type: 'object',
                      properties: {
                        path: {
                          type: 'string',
                          description: 'File path relative to session root',
                        },
                      },
                      required: ['path'],
                    },
                  },
                },
                {
                  type: 'function',
                  function: {
                    name: 'cli_write_file',
                    description:
                      "Write content to a file on the user's local machine. Requires user confirmation.",
                    parameters: {
                      type: 'object',
                      properties: {
                        path: {
                          type: 'string',
                          description: 'File path relative to session root',
                        },
                        content: {
                          type: 'string',
                          description: 'Content to write',
                        },
                      },
                      required: ['path', 'content'],
                    },
                  },
                },
                {
                  type: 'function',
                  function: {
                    name: 'cli_search_files',
                    description:
                      'Search for files matching a pattern on the user\'s local machine (e.g. "*.ts").',
                    parameters: {
                      type: 'object',
                      properties: {
                        pattern: {
                          type: 'string',
                          description: 'Glob-style filename pattern',
                        },
                        directory: {
                          type: 'string',
                          description:
                            'Directory to search (default: session root)',
                        },
                      },
                      required: ['pattern'],
                    },
                  },
                },
                {
                  type: 'function',
                  function: {
                    name: 'cli_run_command',
                    description:
                      "Run a shell command on the user's local machine and return output. Requires user confirmation.",
                    parameters: {
                      type: 'object',
                      properties: {
                        command: {
                          type: 'string',
                          description: 'Command to run',
                        },
                        args: {
                          type: 'array',
                          items: { type: 'string' },
                          description: 'Arguments',
                        },
                        cwd: {
                          type: 'string',
                          description: 'Working directory',
                        },
                      },
                      required: ['command'],
                    },
                  },
                },
                {
                  type: 'function',
                  function: {
                    name: 'cli_browser_open',
                    description:
                      "Launch the user's shared pod browser and navigate to a URL.",
                    parameters: {
                      type: 'object',
                      properties: {
                        url: { type: 'string', description: 'URL to open' },
                      },
                      required: ['url'],
                    },
                  },
                },
                {
                  type: 'function',
                  function: {
                    name: 'cli_browser_status',
                    description:
                      "Return the shared browser's on/off state, current URL, page title, and latest screenshot.",
                    parameters: {
                      type: 'object',
                      properties: {},
                      required: [],
                    },
                  },
                },
                {
                  type: 'function',
                  function: {
                    name: 'cli_browser_screenshot',
                    description:
                      'Refresh and return the latest screenshot of the shared browser.',
                    parameters: {
                      type: 'object',
                      properties: {},
                      required: [],
                    },
                  },
                },
                {
                  type: 'function',
                  function: {
                    name: 'cli_browser_click',
                    description:
                      "Click a coordinate in the shared browser's viewport.",
                    parameters: {
                      type: 'object',
                      properties: {
                        x: { type: 'number' },
                        y: { type: 'number' },
                      },
                      required: ['x', 'y'],
                    },
                  },
                },
                {
                  type: 'function',
                  function: {
                    name: 'cli_browser_type',
                    description:
                      'Type text into the focused element, or into a CSS selector, in the shared browser.',
                    parameters: {
                      type: 'object',
                      properties: {
                        text: { type: 'string' },
                        selector: { type: 'string' },
                      },
                      required: ['text'],
                    },
                  },
                },
                {
                  type: 'function',
                  function: {
                    name: 'cli_browser_close',
                    description: 'Close the shared browser.',
                    parameters: {
                      type: 'object',
                      properties: {},
                      required: [],
                    },
                  },
                },
              ])
            : [];

          const llmWithTools = (llm as any).bindTools(
            [...toolDefs, ...cliToolSchemas] as any,
            {
              parallel_tool_calls: true,
              strict: false,
              callbacks: [callbackHandler],
            },
          );

          const makeRunner = (def: ChatCompletionTool & { endpoint: string }) =>
            tool(
              async (args, config) => {
                const fn = config.toolCall?.name ?? 'unknown';
                const t0 = performance.now();
                const got_ = await got;
                let data: any;
                let status: 'success' | 'error' = 'success';
                try {
                  data = await got_.default
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
                            runId: traceId,
                            toolCallId: config.toolCall?.id,
                          },
                        },
                        headers: {
                          'Content-Type': 'application/json',
                          ...(process.env.API_SECRET_KEY
                            ? {
                                'x-internal-tool-secret':
                                  process.env.API_SECRET_KEY,
                              }
                            : {}),
                        },
                      },
                    )
                    .json<any>();
                } catch (error: any) {
                  status = 'error';
                  // got returns the response body as a raw string on HTTPError;
                  // parse it so the model sees the real failure (e.g. missing
                  // OAuth connection, upstream API error) instead of a bare
                  // "Response code 400".
                  let responseBody = error?.response?.body;
                  if (typeof responseBody === 'string') {
                    try {
                      responseBody = JSON.parse(responseBody);
                    } catch {
                      responseBody = { message: responseBody };
                    }
                  }
                  // Nest error bodies carry the useful text in `message`
                  // (`error` is just the status phrase, e.g. "Bad Request").
                  const detail = Array.isArray(responseBody?.message)
                    ? responseBody.message.join('; ')
                    : responseBody?.message;
                  data = {
                    error:
                      detail ??
                      responseBody?.error ??
                      error?.message ??
                      String(error),
                    statusCode: error?.response?.statusCode,
                  };
                }

                toolUsage.push({
                  name: fn,
                  status,
                  duration: performance.now() - t0,
                });

                const callObj = {
                  role: 'tool',
                  name: fn,
                  status,
                  duration: performance.now() - t0,
                  args,
                  result: data,
                  toolCallId: config.toolCall?.id,
                  timestamp: new Date().toISOString(),
                };

                executedCalls.push(callObj);

                subscriber.next({
                  type: 'tool',
                  phase: 'commentary',
                  ...callObj,
                  toolName: fn,
                  sessionId: currentSessionId,
                });

                if (status === 'error') {
                  return {
                    toolData: data,
                    error: data.error,
                  };
                }
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

          // ── CLI local tools (only injected when the request has cliContext) ──
          // These run on the user's machine. The server emits a cli_tool_request
          // SSE event; the CLI executes locally and POSTs the result back.
          if (props.cliContext) {
            // Maximum time the server waits for the CLI to execute a local tool
            // and POST the result back. Must be well above the CLI's own command
            // timeout (currently up to 300s). Set to 360s to give breathing room.
            const CLI_TOOL_TIMEOUT_MS = 360_000;

            // GCP load balancers close idle connections after ~30s. We send a
            // lightweight SSE ping every 20s while a CLI tool is pending so the
            // connection stays alive for the full duration.
            const CLI_KEEPALIVE_INTERVAL_MS = 20_000;

            const makeCliTool = (
              name: string,
              description: string,
              schema: z.ZodObject<any> | Record<string, unknown>,
            ) =>
              tool(
                async (args) => {
                  const requestId = uuidv4();
                  subscriber.next({
                    type: 'cli_tool_request',
                    phase: 'commentary',
                    requestId,
                    tool: name,
                    args,
                    sessionId: currentSessionId,
                    timestamp: new Date().toISOString(),
                  });
                  return new Promise<string>((resolve) => {
                    // Keepalive pings prevent GCP from closing the idle SSE stream
                    const pingInterval = setInterval(() => {
                      try {
                        subscriber.next({ type: 'keepalive' });
                      } catch {
                        /* stream may already be closed */
                      }
                    }, CLI_KEEPALIVE_INTERVAL_MS);

                    const cleanup = () => {
                      clearTimeout(timer);
                      clearInterval(pingInterval);
                      this.pendingCliToolRequests.delete(requestId);
                    };

                    const timer = setTimeout(() => {
                      cleanup();
                      resolve(
                        `Error: CLI tool timed out after ${CLI_TOOL_TIMEOUT_MS / 1_000}s`,
                      );
                    }, CLI_TOOL_TIMEOUT_MS);

                    this.pendingCliToolRequests.set(
                      requestId,
                      (result: string) => {
                        cleanup();
                        resolve(result);
                      },
                    );
                  });
                },
                { name, description, schema: schema as any },
              );

            if (dynamicCliTools) {
              // Caller supplied its own catalog — mirror it 1:1 with no
              // hardcoded tool list to maintain.
              (toolRunners as any[]).push(
                ...props.cliTools!.map((def) =>
                  makeCliTool(def.name, def.description, def.parameters),
                ),
              );
            } else {
              (toolRunners as any[]).push(
                makeCliTool(
                  'cli_read_file',
                  "Read the full contents of a file on the user's local machine. Path is relative to the session root directory.",
                  z.object({
                    path: z
                      .string()
                      .describe('File path relative to session root'),
                  }),
                ),
                makeCliTool(
                  'cli_list_directory',
                  "List files and directories at a given path on the user's local machine. Defaults to the session root.",
                  z.object({
                    path: z
                      .string()
                      .optional()
                      .describe('Directory path (default: session root)'),
                  }),
                ),
                makeCliTool(
                  'cli_write_file',
                  "Write content to a file on the user's local machine. Creates parent directories if needed. Requires user confirmation.",
                  z.object({
                    path: z
                      .string()
                      .describe('File path relative to session root'),
                    content: z.string().describe('Content to write'),
                  }),
                ),
                makeCliTool(
                  'cli_search_files',
                  "Search for files matching a name pattern on the user's local machine. Returns up to 50 matches.",
                  z.object({
                    pattern: z
                      .string()
                      .describe('Glob-style filename pattern (e.g. "*.ts")'),
                    directory: z
                      .string()
                      .optional()
                      .describe(
                        'Directory to search in (default: session root)',
                      ),
                  }),
                ),
                makeCliTool(
                  'cli_run_command',
                  "Execute a short shell command (<30s) on the user's local machine. For long-running commands (installs, builds, scaffolders) use cli_start_process instead.",
                  z.object({
                    command: z
                      .string()
                      .describe('Command to run (e.g. "node")'),
                    args: z
                      .array(z.string())
                      .optional()
                      .describe('Arguments array'),
                    cwd: z
                      .string()
                      .optional()
                      .describe('Working directory (default: session root)'),
                    timeout_seconds: z
                      .number()
                      .optional()
                      .describe('Max seconds to wait (default 120, max 300)'),
                    interactive: z
                      .boolean()
                      .optional()
                      .describe(
                        'Connect user terminal stdin for commands that need prompts. Output not captured.',
                      ),
                  }),
                ),
                makeCliTool(
                  'cli_start_process',
                  'Start a long-running command in the background (npm install, builds, scaffolders, etc). Returns a processId immediately — use cli_wait_for_process to poll progress. Requires user confirmation.',
                  z.object({
                    command: z.string().describe('Command to run (e.g. "npx")'),
                    args: z
                      .array(z.string())
                      .optional()
                      .describe('Arguments array'),
                    cwd: z
                      .string()
                      .optional()
                      .describe('Working directory (default: session root)'),
                  }),
                ),
                makeCliTool(
                  'cli_wait_for_process',
                  'Block for up to wait_seconds (max 120) waiting for a background process to finish, then return its current output and status. Call in a loop, reporting progress to the user between each call.',
                  z.object({
                    processId: z
                      .string()
                      .describe('processId returned by cli_start_process'),
                    wait_seconds: z
                      .number()
                      .optional()
                      .describe('How long to block (default 60, max 120)'),
                  }),
                ),
                makeCliTool(
                  'cli_process_status',
                  'Instantly check the status and recent stdout of a background process without blocking.',
                  z.object({
                    processId: z
                      .string()
                      .describe('processId returned by cli_start_process'),
                  }),
                ),
                makeCliTool(
                  'cli_kill_process',
                  'Kill a running background process.',
                  z.object({
                    processId: z
                      .string()
                      .describe('processId returned by cli_start_process'),
                  }),
                ),
                makeCliTool(
                  'cli_list_processes',
                  'List all background processes started this session, with their current status and elapsed time.',
                  z.object({}),
                ),
                makeCliTool(
                  'cli_browser_open',
                  "Launch the user's shared pod browser and navigate to a URL.",
                  z.object({ url: z.string().describe('URL to open') }),
                ),
                makeCliTool(
                  'cli_browser_status',
                  "Return the shared browser's on/off state, current URL, page title, and latest screenshot.",
                  z.object({}),
                ),
                makeCliTool(
                  'cli_browser_screenshot',
                  'Refresh and return the latest screenshot of the shared browser.',
                  z.object({}),
                ),
                makeCliTool(
                  'cli_browser_click',
                  "Click a coordinate in the shared browser's viewport.",
                  z.object({
                    x: z.number().describe('X coordinate'),
                    y: z.number().describe('Y coordinate'),
                  }),
                ),
                makeCliTool(
                  'cli_browser_type',
                  'Type text into the focused element, or into a CSS selector, in the shared browser.',
                  z.object({
                    text: z.string().describe('Text to type'),
                    selector: z
                      .string()
                      .optional()
                      .describe('Optional CSS selector to type into'),
                  }),
                ),
                makeCliTool(
                  'cli_browser_close',
                  'Close the shared browser.',
                  z.object({}),
                ),
              );
            }
          }

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
                `postgresql://${process.env.POSTGRES_USER}:${process.env.POSTGRES_PASSWORD}@${process.env.POSTGRES_HOST}:${process.env.POSTGRES_PORT}/${process.env.POSTGRES_DATABASE}?options=-c%20search_path%3Dpublic`,
              ),
            });

          let messages: Messages = [];
          if (isNewSession) {
            emitStatus('context', 'running', 'Preparing conversation context');
            const firstMsg = props.messages?.find((m) => m.role === 'user');
            const firstUserText = this.contentToText(firstMsg?.content);
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
            emitStatus('context', 'completed', 'Conversation context ready');
          } else {
            emitStatus('context', 'running', 'Loading conversation context');
            // ✅ For existing sessions, load the full history including agent_speech entries
            const currentSession = await this.session.getSession({
              id: currentSessionId,
            });

            // Fetch agent and inject fresh persona/instructions for existing sessions
            const firstMsg = props.messages?.find((m) => m.role === 'user');
            const firstUserText = this.contentToText(firstMsg?.content);
            const [
              agent,
              childSessions,
              memoryBlock,
              sessionTasks,
              computerBlock,
            ] = await Promise.all([
              this.getAgent({ agentId }),
              this.getChildSessions(currentSessionId),
              firstUserText
                ? this.memoryService
                    .buildMemoryBlock(agentId, firstUserText)
                    .catch(() => '')
                : Promise.resolve(''),
              this.taskExecution
                .listSessionTasks(currentSessionId)
                .catch(() => []),
              this.computerService
                .buildComputerPrompt(agentId, currentSessionId)
                .catch(() => ''),
            ]);
            const childSessionsInfo =
              childSessions.length > 0
                ? `\n\nEXISTING CHILD SESSIONS:\nYou have the following ongoing conversations with other agents. Use these sessionIds to continue existing conversations instead of starting new ones:\n${childSessions.map((cs) => `- Agent ${cs.childAgentId}: ${cs.title || 'Untitled conversation'} (sessionId=${cs.childSessionId}, started: ${cs.createdAt})`).join('\n')}`
                : '';

            messages.push({
              type: 'system',
              role: 'system',
              content: this.buildSystemPrompt(
                agent,
                currentSessionId,
                childSessionsInfo,
                memoryBlock,
                sessionTasks,
                computerBlock,
              ),
            } as any);
            emitStatus('context', 'completed', 'Conversation context ready');

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
                ...validHistoryMessages.map((historyEntry: any) => {
                  let content = historyEntry.content ?? '';
                  if (typeof content === 'string' && content.startsWith('[')) {
                    try {
                      content = JSON.parse(content);
                    } catch {
                      // keep as string if parse fails
                    }
                  }
                  return {
                    type: historyEntry.role,
                    role: historyEntry.role,
                    content,
                  };
                }),
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

          const attachmentContext = props.attachments?.length
            ? await (async () => {
                emitStatus(
                  'files',
                  'running',
                  `Reading ${props.attachments?.length ?? 0} uploaded file${
                    props.attachments?.length === 1 ? '' : 's'
                  }`,
                  'Preparing text previews and visual artifacts',
                );
                const summaries =
                  await this.filesService.getAttachmentSummaries(
                    props.attachments!,
                    {
                      agentId,
                      sessionId: currentSessionId,
                      ownerId: initiator,
                      includeImageParts: this.supportsImageInputs(
                        agent.modelProvider,
                        agent.modelId,
                      ),
                      maxImageParts: Number(
                        process.env.AGENT_FILE_PROMPT_IMAGE_PARTS ?? 4,
                      ),
                    },
                  );
                emitStatus(
                  'files',
                  'completed',
                  `Prepared ${summaries.attachments.length} uploaded file${
                    summaries.attachments.length === 1 ? '' : 's'
                  }`,
                  summaries.attachments.map((file) => file.name).join(', '),
                  {
                    attachments: summaries.attachments.map((file) => ({
                      fileId: file.fileId,
                      name: file.name,
                      kind: file.kind,
                      status: file.status,
                      extractedTextChars: file.extractedTextChars,
                    })),
                    imageParts: summaries.imageParts.length,
                  },
                );
                return summaries;
              })()
            : null;

          if (props.messages?.length) {
            const incomingMessages = this.attachFilesToIncomingMessages(
              props.messages,
              attachmentContext,
            );
            messages.push(
              ...(incomingMessages.map((m) => ({
                ...m,
                type: m.role,
                content: m.content ?? '',
              })) as any[]),
            );
          }

          // ── Inject relevant memories into the system prompt ───────────────
          const latestUserMsg =
            this.contentToText(
              props.messages?.findLast((m) => m.role === 'user')?.content,
            ) || undefined;
          const memoryBlock = await this.memoryService
            .buildMemoryBlock(agentId, latestUserMsg ?? '')
            .catch(() => '');

          // Build the extra content to append to the system prompt (memory + CLI context)
          const computerSelectionDetail = computerUnavailable
            ? 'Computer runtime is unavailable for this turn. Do not call computer tools.'
            : computerRequest?.computerIds?.length
              ? [
                  `Assigned computer ID: ${computerRequest.computerIds[0]}`,
                  "This is the agent's one persistent computer and is available through the computer tools. Continue work in its existing workspace across chat sessions.",
                  'Computer tool calls may omit computerId; if supplied, use the assigned ID above.',
                  'Do not tell the user you lack computer access while this assigned computer is ready. If the tool fails, report that failure with evidence.',
                ].join('\n')
              : 'The assigned computer is not active. Call startAgentComputer before computer-backed work.';
          const computerSelectionBlock = computerRequest?.enabled
            ? [
                '## USER COMPUTER SELECTION',
                'The user explicitly selected Agent Computer for this turn.',
                computerSelectionDetail,
                !computerUnavailable ? 'Workspace lifecycle: persistent.' : '',
                computerUnavailable
                  ? ''
                  : [
                      'For requests that involve creating/running software, localhost apps, terminal commands, browser inspection, generated files, screenshots, or workspace artifacts, you must perform the work with the computer tools instead of giving local setup instructions.',
                      'For a Next.js/localhost task, use runComputerCommand for finite setup/edit/install/build commands, start the dev server with runComputerCommand, then use openComputerBrowser or another verification command to confirm it is working before responding.',
                      'Do not wait for long-running dev servers to exit. Once server startup logs or a localhost health check confirm it is running, continue with browser verification.',
                    ].join('\n'),
              ]
                .filter(Boolean)
                .join('\n')
            : '';

          const extraSystemContent = [
            memoryBlock,
            props.cliContext,
            computerSelectionBlock,
            computerPreparationBlock,
          ]
            .filter(Boolean)
            .join('\n\n');

          if (extraSystemContent) {
            // Append to the existing system message, or push a new one
            const sysIdx = messages.findIndex(
              (m: any) => m.role === 'system' || m.type === 'system',
            );
            if (sysIdx >= 0) {
              const sys = messages[sysIdx] as any;
              messages[sysIdx] = {
                ...sys,
                content: `${sys.content}\n\n${extraSystemContent}`,
              };
            } else {
              messages.push({
                type: 'system',
                role: 'system',
                content: extraSystemContent,
              } as any);
            }
          }

          // Resolve effective provider/model for cost tracking
          const effectiveProvider = (agent.modelProvider ?? 'openai') as any;
          const effectiveModelId = agent.modelId ?? 'gpt-5.4-mini';
          const isByok = !!agent.modelApiKey;
          usageContext.provider = effectiveProvider;
          usageContext.modelId = effectiveModelId;
          usageContext.isByok = isByok;

          let loop = 0;
          const maxTaskCycles = Number(process.env.AGENT_MAX_TASK_CYCLES ?? 20);
          let finalResult = null;

          while (loop++ < maxTaskCycles) {
            // ✅ Check for next executable task using new TaskExecutionService
            const nextTask = await this.taskExecution.getNextExecutableTask(
              agentId,
              currentSessionId,
            );

            if (nextTask) {
              emitStatus(
                'task',
                'running',
                nextTask.title
                  ? `Working on ${nextTask.title}`
                  : 'Working on the next task',
                nextTask.taskId,
                {
                  taskId: nextTask.taskId,
                  executionMode: nextTask.executionMode,
                  workflowId: nextTask.workflowId,
                },
              );
              if (
                nextTask.executionMode === 'workflow' &&
                nextTask.workflowId
              ) {
                // Execute workflow task fully
                await this.taskExecution.executeTask(nextTask.taskId);
                emitStatus(
                  'task',
                  'completed',
                  nextTask.title
                    ? `Workflow task finished: ${nextTask.title}`
                    : 'Workflow task finished',
                  nextTask.taskId,
                  { taskId: nextTask.taskId },
                );

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

              // Inject task instruction into messages (marked internal so it's filtered from history)
              const taskContextStr =
                nextTask.context && Object.keys(nextTask.context).length > 0
                  ? `\n\nContext:\n${JSON.stringify(nextTask.context, null, 2)}`
                  : '';
              const taskToolsStr = nextTask.tools?.length
                ? `\n\nTools to use: ${nextTask.tools.join(', ')}`
                : '';
              const taskToolInstructionsStr = nextTask.toolInstructions
                ? `\n\nTool instructions: ${nextTask.toolInstructions}`
                : '';
              messages.push({
                type: 'user',
                role: 'user',
                content: `##TASK_INSTRUCTION[${nextTask.taskId}]: ${nextTask.title}\n\n${nextTask.description ?? ''}${taskContextStr}${taskToolsStr}${taskToolInstructionsStr}`,
              } as any);
            }

            const result = await graph.invoke(
              { messages },
              {
                configurable: {
                  thread_id: checkpointThreadId ?? currentSessionId,
                },
                recursionLimit: Number(
                  process.env.AGENT_GRAPH_RECURSION_LIMIT ?? 100,
                ),
              },
            );

            messages = result.messages;
            finalResult = result;

            // ── Auto-complete the task if the agent didn't call updateTaskProgress ──
            if (nextTask && nextTask.executionMode !== 'workflow') {
              const taskAfter = await this.db.query.task.findFirst({
                where: (t: any) => eq(t.taskId, nextTask.taskId),
                columns: { status: true },
              });
              if (taskAfter?.status === 'running') {
                // Agent responded but didn't call updateTaskProgress — complete it now
                const lastAi = [...(result.messages as any[])]
                  .reverse()
                  .find(
                    (m: any) =>
                      m.getType?.() === 'ai' || m._getType?.() === 'ai',
                  );
                const responseText =
                  typeof lastAi?.content === 'string'
                    ? lastAi.content
                    : lastAi?.content
                      ? JSON.stringify(lastAi.content)
                      : 'Task completed';
                await this.db
                  .update(schema.task)
                  .set({
                    status: 'completed',
                    progress: 100,
                    resultContent: responseText,
                    summary: responseText.slice(0, 300),
                    actualEnd: new Date(),
                    completedAt: new Date(),
                    updatedAt: new Date(),
                  })
                  .where(eq(schema.task.taskId, nextTask.taskId));
                this.logger.log(
                  `Auto-completed task ${nextTask.taskId} after agent response`,
                );
                emitStatus(
                  'task',
                  'completed',
                  nextTask.title
                    ? `Completed ${nextTask.title}`
                    : 'Task completed',
                  nextTask.taskId,
                  { taskId: nextTask.taskId },
                );
              }
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
          const lastMessage = finalResult?.messages?.at(-1)?.toDict() ?? {};
          const firstUserMessage = props.messages?.find(
            (m) => m.role === 'user',
          );
          const runDurationMs = Math.round(performance.now() - tStart);
          let sessionTitle =
            isNewSession && firstUserMessage?.content
              ? this.generateFallbackSessionTitle(
                  this.contentToText(firstUserMessage.content),
                )
              : 'New Session';
          const buildFinalPayload = (title = sessionTitle) => ({
            ...lastMessage,
            sessionId: currentSessionId,
            title: title ?? 'New Session',
            traceId,
            durationMs: runDurationMs,
            usage: {
              inputTokens: usageTotals.inputTokens,
              outputTokens: usageTotals.outputTokens,
              cachedTokens: usageTotals.cachedTokens,
              totalTokens: usageTotals.inputTokens + usageTotals.outputTokens,
              costUsd: usageTotals.costUsd,
            },
            metadata: {
              toolCalls,
              agentCalls: resolvedAgentCalls,
              computerRequest,
              durationMs: runDurationMs,
            },
          });

          if (stream) {
            subscriber.next({
              type: 'final',
              phase: 'final_answer',
              payload: buildFinalPayload(),
            });
          }

          if (currentSessionId) {
            const messageHistories =
              finalResult?.messages?.filter((m) => {
                if (m.toDict().type === 'system') return false;
                // Filter out internal trigger messages so they don't appear in session chat
                const content = typeof m.content === 'string' ? m.content : '';
                if (content.startsWith('⫷⫷AUTOMATED_USER_TRIGGER⫸⫸'))
                  return false;
                if (content.startsWith('⫷⫷TASK_DISPATCH⫸⫸')) return false;
                if (content.startsWith('##TASK_INSTRUCTION[')) return false;
                return true;
              }) || [];

            const currentSession = await this.session.getSession({
              id: currentSessionId,
            });
            if (!currentSession) {
              throw new BadRequestException('Session not found');
            }

            if (isNewSession && props.messages?.length) {
              if (firstUserMessage?.content) {
                sessionTitle = await this.generateSessionTitle(
                  this.contentToText(firstUserMessage.content),
                );
              }
            }

            // Get existing history to preserve agent_speech entries added by other agents
            const existingHistory = (currentSession.history as any[]) || [];
            emitStatus('session', 'running', 'Saving conversation');

            // Extract agent_speech entries that should be preserved
            const agentSpeechEntries = existingHistory.filter(
              (entry: any) => entry.metadata?.source === 'agent_speech',
            );

            // History is rebuilt from the full checkpointer thread on every
            // save, so entries from earlier runs must inherit the metadata
            // (toolCalls, durationMs, attachments...) persisted for them
            // before — otherwise each turn would wipe the previous turns'
            // metadata. Prior entries align as an in-order prefix because both
            // saves serialize the same thread through the same pipeline.
            const previousEntries = existingHistory.filter(
              (entry: any) => entry.metadata?.source !== 'agent_speech',
            );
            let previousIndex = 0;

            const entryRoles = messageHistories.map((m) => m.toDict().type);
            const lastAiIndex = entryRoles.lastIndexOf('ai');
            const lastHumanIndex = entryRoles.lastIndexOf('human');

            // Create new history entries from the current agent run
            const newHistoryEntries = messageHistories.map((m, index) => {
              const role = entryRoles[index];
              const rawContent = this.serializeHistoryContent(m.content);
              const content = this.stripAttachmentManifest(rawContent);
              const isCurrentAttachmentTurn =
                index === lastHumanIndex &&
                Boolean(attachmentContext?.attachments?.length) &&
                rawContent.includes('## Uploaded Files');

              const previous = previousEntries[previousIndex];
              const inherited =
                previous &&
                previous.role === role &&
                previous.content === content
                  ? ((previousIndex += 1), previous)
                  : undefined;

              const fresh: Record<string, any> = {};
              if (index === lastAiIndex) {
                if (toolCalls.length) fresh.toolCalls = toolCalls;
                if (resolvedAgentCalls.length)
                  fresh.agentCalls = resolvedAgentCalls;
                fresh.durationMs = runDurationMs;
              }
              if (isCurrentAttachmentTurn)
                fresh.attachments = attachmentContext?.attachments;
              if (index === lastHumanIndex && computerRequest)
                fresh.computerRequest = computerRequest;

              return {
                role,
                content,
                timestamp: inherited?.timestamp ?? new Date().toISOString(),
                metadata: { ...(inherited?.metadata ?? {}), ...fresh },
              };
            });

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
                  totalTokens:
                    usageTotals.inputTokens + usageTotals.outputTokens,
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
            emitStatus(
              'session',
              'completed',
              'Conversation saved',
              undefined,
              {
                sessionId: currentSessionId,
              },
            );
          }

          await this.logService.createLogEntry({
            agentId,
            sessionId: currentSessionId,
            action: 'run',
            message: finalText.slice(0, 512),
            status: 'success',
            responseTime: performance.now() - tStart,
            tools: toolUsage,
          });

          if (!stream) {
            subscriber.next({
              type: 'final',
              phase: 'final_answer',
              payload: buildFinalPayload(sessionTitle),
            });
          }

          clearInterval(keepalive);
          unsubscribeProgress();
          subscriber.complete();

          // ── Memory consolidation (fire-and-forget after stream closes) ──
          // Only consolidate non-space, non-child sessions to avoid noise
          if (currentSessionId && !spaceId && !parentSessionId) {
            const historyForConsolidation = (
              (finalResult?.messages as any[]) ?? []
            )
              .filter((m: any) => {
                const t = m.getType?.() ?? m.type;
                return t === 'human' || t === 'ai';
              })
              .map((m: any) => ({
                role:
                  m.getType?.() === 'human' || m.type === 'human'
                    ? 'user'
                    : 'assistant',
                content: this.stripAttachmentManifest(
                  this.serializeHistoryContent(m.content),
                ),
              }));

            if (historyForConsolidation.length >= 2) {
              this.memoryService
                .consolidateSession(
                  agentId,
                  currentSessionId,
                  historyForConsolidation,
                )
                .catch((err) =>
                  console.error('[MemoryService] Consolidation failed:', err),
                );
            }
          }
        } catch (err) {
          clearInterval(keepalive);
          unsubscribeProgress();
          const message = err instanceof Error ? err.message : String(err);
          if (stream) {
            subscriber.next({
              type: 'error',
              phase: 'final_answer',
              message,
              sessionId: currentSessionId,
              timestamp: new Date().toISOString(),
            });
            subscriber.complete();
          } else {
            subscriber.error(err);
          }
        }
      };

      run();
      return () => {
        clearInterval(keepalive);
        unsubscribeProgress();
      };
    });
  }

  private attachFilesToIncomingMessages(
    incoming: ChatCompletionMessageParam[],
    attachmentContext: Awaited<
      ReturnType<FilesService['getAttachmentSummaries']>
    > | null,
  ): ChatCompletionMessageParam[] {
    if (!attachmentContext?.text) return incoming;

    const lastUserIndex = incoming.findLastIndex((m) => m.role === 'user');
    if (lastUserIndex < 0) return incoming;

    return incoming.map((message, index) => {
      if (index !== lastUserIndex) return message;
      const imageParts = attachmentContext.imageParts ?? [];
      return {
        ...message,
        content: this.appendAttachmentContext(
          message.content,
          attachmentContext.text,
          imageParts,
        ) as any,
      };
    });
  }

  private appendAttachmentContext(
    content: ChatCompletionMessageParam['content'],
    attachmentText: string,
    imageParts: Array<{ type: 'image_url'; image_url: { url: string } }>,
  ) {
    const suffix = `\n\n${attachmentText}`;
    if (Array.isArray(content)) {
      const next = [...content] as any[];
      const textIndex = next.findLastIndex((part) => part?.type === 'text');
      if (textIndex >= 0) {
        next[textIndex] = {
          ...next[textIndex],
          text: `${next[textIndex].text ?? ''}${suffix}`,
        };
      } else {
        next.push({ type: 'text', text: attachmentText });
      }
      return [...next, ...imageParts];
    }

    const text = `${typeof content === 'string' ? content : ''}${suffix}`;
    if (!imageParts.length) return text;
    return [{ type: 'text', text }, ...imageParts];
  }

  private contentToText(content: unknown): string {
    if (!content) return '';
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
      return content
        .map((part: any) => {
          if (part?.type === 'text') return part.text ?? '';
          if (part?.type === 'image_url') return '[image attachment]';
          return '';
        })
        .filter(Boolean)
        .join('\n');
    }
    return String(content);
  }

  /**
   * Zero-latency reasoning-depth hint. Trivial conversational turns
   * (greetings, acks, thanks) gain nothing from model reasoning, so they run
   * at the provider's minimal thinking setting and start streaming sooner.
   * Anything with attachments, computer use, CLI context, or real content
   * returns undefined and keeps the provider's default behavior.
   */
  private resolveAdaptiveReasoningEffort(props: {
    messages?: ChatCompletionMessageParam[];
    attachments?: Array<{ fileId: string }>;
    computerRequest?: { enabled: boolean };
    cliContext?: string;
  }): 'minimal' | undefined {
    if (
      props.attachments?.length ||
      props.computerRequest?.enabled ||
      props.cliContext
    ) {
      return undefined;
    }
    const lastUser = props.messages?.findLast((m) => m.role === 'user');
    const text = this.contentToText(lastUser?.content).trim();
    if (!text || text.length > 160) return undefined;
    return TRIVIAL_TURN_PATTERN.test(text) ? 'minimal' : undefined;
  }

  private serializeHistoryContent(content: unknown): string {
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
      return content
        .map((part: any) => {
          if (part?.type === 'text') return part.text ?? '';
          if (part?.type === 'image_url')
            return '[image attachment omitted from history]';
          return '';
        })
        .filter(Boolean)
        .join('\n');
    }
    return content == null ? '' : JSON.stringify(content);
  }

  private stripAttachmentManifest(content: string): string {
    const marker = '\n\n## Uploaded Files';
    const index = content.indexOf(marker);
    if (index < 0) return content;
    return content.slice(0, index).trimEnd();
  }

  private supportsImageInputs(
    provider?: string | null,
    modelId?: string | null,
  ) {
    const normalizedProvider = (provider || 'openai').toLowerCase();
    const normalizedModel = (modelId || '').toLowerCase();
    if (normalizedProvider === 'openai') return true;
    if (normalizedProvider === 'anthropic') return true;
    if (normalizedProvider === 'google') return true;
    return normalizedModel.includes('vision') || normalizedModel.includes('4o');
  }

  private generateFallbackSessionTitle(userMessage: string): string {
    const cleaned = userMessage
      .replace(/\s+/g, ' ')
      .replace(/## Uploaded Files.*$/i, '')
      .trim();
    const words = cleaned.split(' ').filter(Boolean).slice(0, 6);
    return words.join(' ') || 'New Conversation';
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
        modelId: 'gpt-5.4-mini',
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
    const existing = await this.getAgent({ agentId });
    const systemManagedSafeFields = [
      'name',
      'avatar',
      'persona',
      'greeting',
      'conversationStarters',
      'modelProvider',
      'modelId',
      'modelApiKey',
      'modelBaseUrl',
      'temperature',
      'maxTokens',
      'topP',
      'presencePenalty',
      'frequencyPenalty',
      'ttsProvider',
      'ttsVoice',
    ];
    const data = (
      existing.isSystemManaged
        ? Object.fromEntries(
            Object.entries(updateData).filter(([key]) =>
              systemManagedSafeFields.includes(key),
            ),
          )
        : omit(updateData, [
            'wallet',
            'agentId',
            'createdAt',
            'owner',
            'ownerUserId',
            'workspaceId',
            'isDefault',
            'isSystemManaged',
            'copilotAccessMode',
            'copilotScopes',
          ])
    ) as any;
    if (data.modelApiKey) {
      data.modelApiKey = this.encryptApiKey(data.modelApiKey);
    }
    if (data.runtimeType !== undefined) {
      const runtimeType = normalizeRuntimeType(data.runtimeType);
      data.runtimeType = runtimeType;
      data.runtimeCapabilities = RUNTIME_CAPABILITIES[runtimeType];
      data.runtimeUpdatedAt = new Date();
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
    await this.ensureDefaultCopilot(owner);
    return this.db.query.agent.findMany({
      where: (t) => or(eq(t.ownerUserId, owner), eq(t.owner, owner)),
      orderBy: (t) => [desc(t.isDefault), desc(t.createdAt)],
    });
  }
  async getAgentsForPrincipal(userId: string, workspaceId?: string | null) {
    await this.ensureDefaultCopilot(userId, workspaceId);
    return this.db.query.agent.findMany({
      where: (t) =>
        workspaceId
          ? or(
              eq(t.ownerUserId, userId),
              eq(t.owner, userId),
              and(eq(t.workspaceId, workspaceId), eq(t.isSystemManaged, false)),
            )
          : or(eq(t.ownerUserId, userId), eq(t.owner, userId)),
      orderBy: (t) => [desc(t.isDefault), desc(t.createdAt)],
    });
  }

  async ensureDefaultCopilot(userId: string, workspaceId?: string | null) {
    if (!userId?.trim()) return null;
    const existing = await this.db.query.agent.findFirst({
      where: (t) => and(eq(t.ownerUserId, userId), eq(t.isDefault, true)),
    });
    if (existing) {
      // Upgrade only the previous built-in avatar. User-selected profile images
      // remain untouched.
      if (existing.avatar === '/ac-icon.svg') {
        const [updated] = await this.db
          .update(schema.agent)
          .set({ avatar: COMMONS_COPILOT_AVATAR })
          .where(eq(schema.agent.agentId, existing.agentId))
          .returning();
        return updated ?? existing;
      }
      return existing;
    }

    try {
      return await this.createAgent({
        value: {
          name: 'Commons Copilot',
          owner: userId,
          ownerUserId: userId,
          workspaceId: workspaceId ?? undefined,
          instructions: COMMONS_COPILOT_INSTRUCTIONS,
          persona:
            'A calm, capable Agent Commons co-creator for building and operating agents, workflows, tools, skills, and tasks.',
          greeting:
            'I’m your Commons Copilot. I can help you build, test, and manage anything in Agent Commons—what should we make?',
          conversationStarters: [
            'Design a workflow with me',
            'Show me what is in my Agent Commons account',
            'Help me create a new agent',
            'Turn this process into an automated task',
          ],
          avatar: COMMONS_COPILOT_AVATAR,
          isDefault: true,
          isSystemManaged: true,
          copilotAccessMode: 'confirm',
          copilotScopes: [],
          runtimeType: 'native',
          modelProvider: 'openai',
          modelId: 'gpt-5.4-mini',
        },
      });
    } catch (error: any) {
      // Concurrent first requests may race; the partial unique index makes the
      // loser harmless, so return the row created by the winner.
      if (error?.code === '23505') {
        return this.db.query.agent.findFirst({
          where: (t) => and(eq(t.ownerUserId, userId), eq(t.isDefault, true)),
        });
      }
      throw error;
    }
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
      with: { tool: true },
    });
  }
  async addAgentTool(agentId: string, toolId: string, usageComments?: string) {
    // Upsert: re-adding a tool that was previously assigned (possibly
    // disabled) re-enables it instead of tripping the unique index.
    const [inserted] = await this.db
      .insert(schema.agentTool)
      .values({ agentId, toolId, usageComments })
      .onConflictDoUpdate({
        target: [schema.agentTool.agentId, schema.agentTool.toolId],
        set: {
          isEnabled: true,
          ...(usageComments !== undefined ? { usageComments } : {}),
          updatedAt: new Date(),
        },
      })
      .returning();
    const withTool = await this.db.query.agentTool.findFirst({
      where: (t) => eq(t.id, inserted.id),
      with: { tool: true },
    });
    return withTool ?? inserted;
  }
  async updateAgentTool(
    id: string,
    updates: {
      usageComments?: string;
      isEnabled?: boolean;
      config?: Record<string, any>;
    },
  ) {
    const [updated] = await this.db
      .update(schema.agentTool)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(schema.agentTool.id, id))
      .returning();
    const withTool = await this.db.query.agentTool.findFirst({
      where: (t) => eq(t.id, updated.id),
      with: { tool: true },
    });
    return withTool ?? updated;
  }
  async removeAgentTool(id: string) {
    await this.db.delete(schema.agentTool).where(eq(schema.agentTool.id, id));
    return { success: true };
  }
}

import {
  BadRequestException,
  forwardRef,
  Inject,
  Injectable,
} from '@nestjs/common';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { ChatCompletionMessageParam } from 'openai/resources/chat/completions.mjs';
import { ModelProviderFactory } from '~/modules/model-provider';
import { AgentService } from '~/agent/agent.service';
import { CopilotService } from '~/agent/copilot.service';
import { GoalService, CreateGoalDto } from '~/goal/goal.service';
import { TaskService, CreateTaskDto, TaskContext } from '~/task/task.service';
import { TaskExecutionService } from '~/task/task-execution.service';
import { SpaceService } from '~/space/space.service';
import { SkillService } from '~/skill/skill.service';
//import { TaskService } from '~/task/task.service';
import { OpenAIService } from '~/modules/openai/openai.service';
import { PinataService } from '~/pinata/pinata.service';
import { ToolSchema } from '~/tool/dto/tool.dto';
import { SpaceTtsService } from '~/space/space-tts.service';
import { ModuleRef } from '@nestjs/core';
import { randomUUID } from 'crypto';
import { WorkflowExecutorService } from '~/tool/workflow-executor.service';
import { FilesService, LibraryService } from '~/files';
import { ComputerService } from '~/computer';
import {
  CodeProjectService,
  type BrowserCheckAction,
  type CodeProjectFileInput,
} from '~/code-project';
import { DatabaseService } from '~/modules/database/database.service';
import { UsageService } from '~/modules/usage';
import * as schema from '#/models/schema';
import { eq } from 'drizzle-orm';
import {
  executeWebSearch,
  resolveWebSearchConfig,
} from './web-search.provider';

type ToolExecutionMetadata = {
  agentId?: string;
  sessionId?: string;
  runId?: string;
  toolCallId?: string;
};

export interface CommonTool {
  /**
   * Inspect the calling Commons Copilot owner's platform resources before
   * designing or changing account state.
   */
  listCommonsResources(props: {
    resourceTypes?: Array<
      'agents' | 'tools' | 'skills' | 'tasks' | 'workflows'
    >;
    agentId: string;
  }): Promise<Record<string, unknown>>;

  /**
   * Create or edit a reviewable workflow (a saved DAG). Depending on the user's
   * copilot access policy it is either applied immediately with undo history or
   * held for explicit confirmation.
   *
   * A workflow is user-owned. Before calling this, ALWAYS call
   * listCommonsResources to get the real toolId and agentId values you will
   * wire in — never invent IDs and never emit generic placeholder nodes. Every
   * `tool` node MUST carry a real `toolId`; every `agent_processor` node MUST
   * carry `config.agentId`. Connect nodes with edges so data flows from the
   * input/trigger to the output. The proposal is rejected if a tool/agent node
   * does not resolve to a real resource.
   */
  proposeWorkflowChange(props: {
    workflowId?: string;
    name?: string;
    description?: string;
    definition: {
      startNodeId?: string;
      endNodeId?: string;
      nodes: Array<{
        /** Stable node id referenced by edges (e.g. "read_row"). */
        id: string;
        /**
         * tool = call a tool (needs toolId); agent_processor = have an agent
         * reason/act (needs config.agentId); input/output = workflow entry/exit;
         * condition/transform/loop/human_approval = control & data shaping.
         */
        type:
          | 'input'
          | 'output'
          | 'tool'
          | 'agent_processor'
          | 'condition'
          | 'transform'
          | 'loop'
          | 'human_approval';
        /** Real toolId from listCommonsResources. REQUIRED for `tool` nodes. */
        toolId?: string;
        /** Short human label shown on the canvas (e.g. "Send Gmail reply"). */
        label?: string;
        /**
         * Node settings. For agent_processor set `agentId` (real agent) and a
         * natural-language `prompt`. For condition set `expression`; for
         * transform set `mapping`; for loop set `itemsPath`/`toolId`; for
         * human_approval set `prompt`.
         */
        config?: Record<string, unknown>;
        position?: { x: number; y: number };
      }>;
      edges: Array<{
        id?: string;
        /** Source node id. */
        source: string;
        /** Target node id. */
        target: string;
        /** Output field on the source node. */
        sourceHandle?: string;
        /** Input field on the target node. */
        targetHandle?: string;
        /** Map source output fields to target input fields. */
        mapping?: Record<string, string>;
      }>;
    };
    summary: string;
    /** Filled automatically with the acting Copilot agent — do not set this to
     * the agent you want the workflow to use; put that in an agent node's
     * config.agentId instead. */
    agentId: string;
  }): Promise<any>;

  /** Create or edit an agent. Never use a workflow proposal for this intent. */
  proposeAgentChange(props: {
    resourceId?: string;
    summary: string;
    data: {
      name?: string;
      instructions?: string;
      persona?: string;
      greeting?: string;
      conversationStarters?: string[];
      knowledgebase?: Array<{
        title: string;
        content: string;
        usageComments?: string;
      }>;
      externalTools?: string[];
      commonTools?: string[];
      temperature?: number;
      maxTokens?: number;
      avatar?: string;
      modelProvider?: string;
      modelId?: string;
      runtimeType?: 'native' | 'openclaw' | 'external';
    };
    agentId: string;
  }): Promise<any>;

  /** Create or edit a reusable Agent Commons skill. */
  proposeSkillChange(props: {
    resourceId?: string;
    summary: string;
    data: {
      slug?: string;
      name?: string;
      description?: string;
      instructions?: string;
      tools?: string[];
      triggers?: string[];
      isPublic?: boolean;
      tags?: string[];
      icon?: string;
    };
    agentId: string;
  }): Promise<any>;

  /** Create or edit a custom tool definition. */
  proposeToolChange(props: {
    resourceId?: string;
    summary: string;
    data: {
      name?: string;
      displayName?: string;
      description?: string;
      schema?: {
        type: 'function';
        function: {
          name: string;
          description?: string;
          parameters?: Record<string, any>;
        };
      };
      apiSpec?: {
        baseUrl: string;
        path: string;
        method: string;
        headers?: Record<string, string>;
        queryParams?: Record<string, string>;
        bodyTemplate?: any;
        authType?: 'none' | 'bearer' | 'api-key' | 'basic' | 'oauth2';
        authKeyName?: string;
        oauthProviderKey?: string;
      };
      inputSchema?: Record<string, any>;
      outputSchema?: Record<string, any>;
      category?: string;
      visibility?: 'public' | 'private';
      tags?: string[];
      icon?: string;
      version?: string;
      rateLimitPerMinute?: number;
      rateLimitPerHour?: number;
    };
    agentId: string;
  }): Promise<any>;

  /** Edit an existing current-platform task after resolving its taskId. */
  proposeTaskChange(props: {
    resourceId: string;
    summary: string;
    data: {
      title?: string;
      description?: string;
      priority?: number;
      /** ISO 8601 timestamp with an explicit timezone offset. */
      scheduledFor?: Date;
    };
    agentId: string;
  }): Promise<any>;

  createGoal(props: CreateGoalDto): Promise<any>;
  /** Text-to-speech for an agent inside a space */
  speakInSpace(props: {
    spaceId: string;
    agentId: string;
    text: string;
    instructions?: string;
  }): Promise<{ success: boolean; mime: string; bytes: number }>;
  updateGoalProgress(props: {
    goalId: string;
    progress: number;
    status: 'pending' | 'started' | 'completed' | 'failed';
  }): Promise<any>;
  recomputeGoalProgress(props: {
    goalId: string;
  }): Promise<{ success: boolean }>;

  /**
   * Execute a saved workflow as an agent-callable platform tool.
   */
  runWorkflow(props: {
    workflowId: string;
    inputData?: Record<string, any>;
    agentId?: string;
    sessionId?: string;
    taskId?: string;
    userId?: string;
    waitForCompletion?: boolean;
    timeoutMs?: number;
  }): Promise<{
    executionId: string;
    workflowId: string;
    status: string;
    outputData?: any;
    nodeResults?: Record<string, any>;
    errorMessage?: string;
  }>;

  /**
   * Search the live web using the platform search provider.
   */
  webSearch(props: {
    query: string;
    count?: number;
    freshness?: 'day' | 'week' | 'month' | 'year';
    safeSearch?: 'off' | 'moderate' | 'strict';
  }): Promise<{
    query: string;
    provider: string;
    results: Array<{
      title: string;
      url: string;
      description?: string;
      publishedAt?: string;
    }>;
  }>;

  /**
   * Run an expanded web search pass for research workflows.
   */
  deepSearch(props: {
    query: string;
    focus?: string;
    maxResults?: number;
    includeSources?: boolean;
  }): Promise<{
    query: string;
    focus?: string;
    summary: string;
    sources: Array<{
      title: string;
      url: string;
      description?: string;
      publishedAt?: string;
    }>;
  }>;

  createTask(props: {
    agentId: string;
    sessionId?: string;
    title: string;
    description?: string;
    executionMode?: 'single' | 'workflow' | 'sequential';
    workflowId?: string;
    workflowInputs?: Record<string, any>;
    cronExpression?: string;
    scheduledFor?: Date;
    isRecurring?: boolean;
    dependsOn?: string[];
    tools?: string[];
    toolConstraintType?: 'hard' | 'soft' | 'none';
    toolInstructions?: string;
    recurringSessionMode?: 'same' | 'new';
    context?: Record<string, any>;
    priority?: number;
    /** Set true only after the user explicitly approves this exact task. */
    confirmed?: boolean;
  }): Promise<any>;

  /** Load a platform skill's full instructions after inspecting the skill index. */
  invoke_skill(props: {
    skillSlug?: string;
    url?: string;
    message?: string;
    agentId?: string;
    apiKey?: string;
    contextId?: string;
  }): Promise<{
    text: string;
    taskId?: string;
    state?: string;
    artifacts?: any[];
  }>;
  updateTaskProgress(props: {
    taskId: string;
    progress: number;
    status: 'pending' | 'started' | 'completed' | 'failed';
    resultContent: string;
    summary: string;
    context: Record<string, any>;
    scheduledEnd?: Date;
    estimatedDuration?: number;
    metadata?: Record<string, any>;
  }): Promise<any>;

  /**
   * Get Agents available in the network
   */
  //getAgents(): any;
  //getAgentWithId(props: { id: string }): any;

  /**
   * Interact with an agent in the network
   */
  interactWithAgent(props: {
    agentId: string;
    messages?: ChatCompletionMessageParam[];
    sessionId?: string;
    initiator: string;
  }): any;

  /**
   * Generate an image using the current stable GPT Image model and save it to
   * the owner's artifact library.
   */
  generateImage(props: {
    prompt: string;
    n?: number; // how many images to generate (default 1)
    size?: '1024x1024' | '1024x1536' | '1536x1024' | 'auto';
    quality?: 'low' | 'medium' | 'high' | 'auto';
    agentId: string;
    sessionId?: string;
  }): Promise<
    {
      fileId: string;
      name: string;
      url?: string;
      prompt: string;
      model: string;
    }[]
  >;

  /**
   * Upload a file directly to IPFS via Pinata.
   */
  uploadFileToIPFS(props: {
    /** Base64-encoded file data */
    base64String: string;
    /** The name of the file, e.g. "document.pdf" or "image.png" */
    fileName: string;
    /** The MIME type, e.g. "application/pdf" or "image/png" */
    mimeType: string;

    /** For Typia LLM's single-parameter approach */
    agentId: string;
    privateKey: string;
  }): Promise<{
    ipfsUrl: string;
  }>;

  /**
   * Read an uploaded chat file by ID. Returns extracted text in bounded chunks
   * and optional signed image/PDF-page artifact URLs. It never returns raw file
   * bytes or base64.
   */
  readUploadedFile(props: {
    fileId: string;
    offset?: number;
    maxChars?: number;
    includeImageUrls?: boolean;
    includeDownloadUrl?: boolean;
    pageNumber?: number;
    agentId: string;
    sessionId?: string;
  }): Promise<{
    fileId: string;
    name: string;
    mimeType: string;
    kind: string;
    content: string;
    offset: number;
    nextOffset: number | null;
    totalChars: number;
    truncated: boolean;
    download?: {
      name: string;
      mimeType: string;
      url: string;
      expiresInSeconds: number;
    };
    artifacts: Array<{
      artifactId: string;
      kind: string;
      mimeType: string;
      pageNumber?: number | null;
      width?: number | null;
      height?: number | null;
      url?: string;
    }>;
  }>;

  /** Search only artifacts explicitly available to this agent. */
  searchLibraryArtifacts(props: {
    query: string;
    limit?: number;
    agentId: string;
    sessionId?: string;
  }): Promise<any[]>;

  /**
   * Create an .xlsx spreadsheet and store it as an agent file attachment.
   */
  createSpreadsheetFile(props: {
    fileName: string;
    sheets: Array<{
      name: string;
      rows: Array<Record<string, any> | any[]>;
    }>;
    agentId: string;
    sessionId?: string;
  }): Promise<any>;

  /** Create a text, Markdown, code, JSON, XML, HTML, or CSV artifact. */
  createTextFile(props: {
    fileName: string;
    content: string;
    mimeType?: string;
    sourceFileId?: string;
    agentId: string;
    sessionId?: string;
  }): Promise<any>;

  /** Create a styled Word document. Use sourceFileId when revising a file. */
  createDocumentFile(props: {
    fileName: string;
    title?: string;
    sections: Array<{
      heading?: string;
      paragraphs?: string[];
      bullets?: string[];
    }>;
    sourceFileId?: string;
    agentId: string;
    sessionId?: string;
  }): Promise<any>;

  /** Create a widescreen PowerPoint presentation. */
  createPresentationFile(props: {
    fileName: string;
    title?: string;
    slides: Array<{
      title: string;
      subtitle?: string;
      bullets?: string[];
      notes?: string;
    }>;
    sourceFileId?: string;
    agentId: string;
    sessionId?: string;
  }): Promise<any>;

  /** Create a clean paginated PDF document. */
  createPdfFile(props: {
    fileName: string;
    title?: string;
    sections: Array<{ heading?: string; body: string }>;
    sourceFileId?: string;
    agentId: string;
    sessionId?: string;
  }): Promise<any>;

  /**
   * Start or reuse an isolated CommonOS computer for this agent.
   */
  startAgentComputer(props: {
    agentId?: string;
    sessionId?: string;
    name?: string;
    reason?: string;
  }): Promise<any>;

  /**
   * List this agent's active computers.
   */
  listAgentComputers(props: {
    agentId?: string;
    sessionId?: string;
    includeTerminated?: boolean;
  }): Promise<any>;

  /**
   * Run a terminal command on an agent computer.
   */
  runComputerCommand(props: {
    agentId?: string;
    computerId?: string;
    sessionId?: string;
    command: string;
    cwd?: string;
    timeoutSeconds?: number;
  }): Promise<any>;

  /**
   * Read a file from an agent computer workspace.
   */
  readComputerFile(props: {
    agentId?: string;
    computerId?: string;
    sessionId?: string;
    path: string;
  }): Promise<any>;

  /** Write complete text files directly into the persistent computer workspace. */
  writeComputerFiles(props: {
    agentId?: string;
    computerId?: string;
    sessionId?: string;
    files: Array<{ path: string; content: string }>;
  }): Promise<any>;

  /**
   * Open a URL in an agent computer browser.
   */
  openComputerBrowser(props: {
    agentId?: string;
    computerId?: string;
    sessionId?: string;
    url: string;
  }): Promise<any>;

  /** Test a real application end-to-end in the persistent computer browser. */
  testComputerBrowser(props: {
    agentId?: string;
    computerId?: string;
    sessionId?: string;
    url?: string;
    actions?: Array<{
      type: 'click' | 'type' | 'select' | 'press' | 'expectText';
      selector?: string;
      text?: string;
      value?: string;
      key?: string;
    }>;
  }): Promise<any>;

  /** Create a lightweight React project that does not require a computer. */
  createCodeProject(props: {
    agentId?: string;
    sessionId?: string;
    name: string;
    description?: string;
    files?: CodeProjectFileInput[];
  }): Promise<any>;

  /** Create or replace complete text files in a lightweight code project. */
  writeCodeProjectFiles(props: {
    agentId?: string;
    projectId: string;
    files: CodeProjectFileInput[];
    replace?: boolean;
  }): Promise<any>;

  /** Read project metadata, complete source files, deployments, and test results. */
  readCodeProject(props: { agentId?: string; projectId: string }): Promise<any>;

  /** Compile and publish a lightweight React project at a durable public URL. */
  publishCodeProject(props: {
    agentId?: string;
    projectId: string;
  }): Promise<any>;

  /** Test the public project in desktop and mobile Chromium viewports. */
  testCodeProject(props: {
    agentId?: string;
    projectId: string;
    actions?: BrowserCheckAction[];
  }): Promise<any>;

  /** Move a lightweight project into this agent's persistent computer. */
  exportCodeProjectToComputer(props: {
    agentId?: string;
    sessionId?: string;
    projectId: string;
    directory?: string;
  }): Promise<any>;

  /**
   * Create a new shared space for multi-agent communication
   */
  createSpace(props: {
    name: string;
    description?: string;
    sessionId?: string;
    isPublic?: boolean;
    maxMembers?: number;
    agentId: string;
  }): any;

  /**
   * Join an existing space
   */
  joinSpace(props: { spaceId: string; agentId: string }): any;

  /**
   * Add an agent to a space
   */
  addAgentToSpace(props: {
    spaceId: string;
    targetAgentId: string;
    agentId: string;
  }): any;
  /**
   * Add a human to a space
   */
  addHumanToSpace(props: {
    spaceId: string;
    targetHumanId: string;
    agentId: string;
  }): any;

  /**
   * Remove an agent from a space
   */
  removeAgentFromSpace(props: {
    spaceId: string;
    targetAgentId: string;
    agentId: string;
  }): any;
  /**
   * remove a human from a space
   */
  removeHumanFromSpace(props: {
    spaceId: string;
    targetHumanId: string;
    agentId: string;
  }): any;

  /**
   * Send a message to a space
   */
  sendMessageToSpace(props: {
    spaceId: string;
    content: string;
    targetType?: 'broadcast' | 'direct' | 'group';
    targetIds?: string[];
    agentId: string;
    sessionId?: string; // optional session ID for context
  }): any;

  /**
   * Get messages from a space
   */
  getSpaceMessages(props: {
    spaceId: string;
    limit?: number;
    agentId: string;
  }): any;

  /**
   * Get spaces where the agent is a member
   */
  getMySpaces(props: { agentId: string }): any;

  /**
   * Get space members by space ID
   */
  getSpaceMembers(props: { spaceId: string }): any;

  /**
   * Subscribe to space messages (automatically subscribes when agent joins space)
   */
  subscribeToSpace(props: { spaceId: string; agentId: string }): any;
  /**
   * Unsubscribe to space messages (automatically unsubscribes when agent leaves space)
   */
  unsubscribeFromSpace(props: { spaceId: string; agentId: string }): any;
  /**
   * Get recent messages from the in-memory bus
   */
  getBusMessages(props: { spaceId: string; limit?: number }): any;

  /**
   * Start monitoring a stream in a space to receive transcriptions
   */
  startStreamMonitoring(props: {
    spaceId: string;
    agentId: string;
    targetParticipantId?: string; // if specified, monitor specific participant; otherwise monitor general space audio
  }): any;

  /**
   * Stop monitoring streams in a space
   */
  stopStreamMonitoring(props: { spaceId: string; agentId: string }): any;

  /**
   * Get active streams being monitored in a space
   */
  getActiveStreams(props: { spaceId: string }): any;

  /**
   * Equip a tool resource to an agent
   */
  // equipResourceTool(props: {
  //   resourceId: string;
  //   agentId: string;
  //   privateKey: string;
  // }): any;

  /** Start (or ensure) a call session in a space. Returns sessionId and current call info. */
  startCall(props: {
    spaceId: string;
    agentId: string;
    metadata?: Record<string, any>;
  }): any;
  /** Join an existing call (auto-start if none). */
  joinCall(props: { spaceId: string; agentId: string }): any;
  /** Leave the active call in a space (no-op if not in call). */
  leaveCall(props: { spaceId: string; agentId: string }): any;
  /** Advance speaker turn (round-robin). */
  advanceTurn(props: { spaceId: string; agentId: string }): any;
  /** Get current call session state. */
  getCallState(props: { spaceId: string; agentId: string }): any;

  /**
   * Process data within a workflow using agent reasoning
   * IMPORTANT: This tool is restricted to prevent infinite recursion
   * - Cannot trigger workflows
   * - Cannot create new sessions
   * - Limited execution time
   * - Workflow depth must be 1
   */
  processWithinWorkflow(props: {
    instruction: string;
    data: any;
    sessionId: string;
    agentId: string;
    maxTokens?: number;
    workflowDepth: number;
  }): Promise<{
    result: string;
    processed: boolean;
  }>;
}

@Injectable()
export class CommonToolService {
  constructor(
    @Inject(forwardRef(() => AgentService)) private agent: AgentService,
    @Inject(forwardRef(() => CopilotService))
    private copilot: CopilotService,
    @Inject(forwardRef(() => GoalService))
    private goals: GoalService,
    @Inject(forwardRef(() => TaskService))
    private tasks: TaskService,
    @Inject(forwardRef(() => TaskExecutionService))
    private taskExecution: TaskExecutionService,
    //private task: TaskService,
    @Inject(forwardRef(() => OpenAIService))
    private openAI: OpenAIService,
    @Inject(forwardRef(() => PinataService))
    private pinataService: PinataService,
    private files: FilesService,
    private library: LibraryService,
    private computers: ComputerService,
    private codeProjects: CodeProjectService,
    @Inject(forwardRef(() => SpaceService))
    private space: SpaceService,
    @Inject(forwardRef(() => SpaceTtsService))
    private spaceTts: SpaceTtsService,
    private skillService: SkillService,
    private modelProviderFactory: ModelProviderFactory,
    private moduleRef: ModuleRef,
    private db: DatabaseService,
    private usage: UsageService,
  ) {}

  private async capabilityOwner(agentId: string) {
    const agent = await this.db.query.agent.findFirst({
      where: eq(schema.agent.agentId, agentId),
    });
    const principalId = agent?.ownerUserId || agent?.owner;
    if (!principalId) {
      throw new BadRequestException('The agent has no billable owner.');
    }
    return { principalId, workspaceId: agent?.workspaceId ?? null };
  }

  async listCommonsResources(
    props: {
      resourceTypes?: Array<
        'agents' | 'tools' | 'skills' | 'tasks' | 'workflows'
      >;
      agentId: string;
    },
    metadata?: { agentId?: string },
  ) {
    return this.copilot.listResources(
      this.requireToolAgentId(props.agentId, metadata),
      props.resourceTypes ?? [],
    );
  }

  async proposeWorkflowChange(
    props: {
      workflowId?: string;
      name?: string;
      description?: string;
      definition: {
        startNodeId?: string;
        endNodeId?: string;
        nodes: Array<Record<string, unknown>>;
        edges: Array<Record<string, unknown>>;
      };
      summary: string;
      agentId: string;
    },
    metadata?: { agentId?: string; sessionId?: string },
  ) {
    // Workflows are user-owned, not agent-owned. The `agentId` the model passes
    // here is frequently the agent it wants to WIRE INTO the workflow (that
    // belongs in a node's config.agentId), not the acting Copilot. Always run
    // the proposal as the authenticated Copilot agent and never reject on a
    // target mismatch — otherwise every "attach agent X" request 401s.
    const agentId = metadata?.agentId ?? props.agentId;
    if (!agentId) {
      throw new BadRequestException('agentId is required for this tool');
    }
    return this.copilot.proposeWorkflowChange(agentId, {
      ...props,
      originSessionId: metadata?.sessionId,
    });
  }

  async proposeAgentChange(
    props: {
      resourceId?: string;
      summary: string;
      data: Record<string, any>;
      agentId: string;
    },
    metadata?: { agentId?: string; sessionId?: string },
  ) {
    const agentId = this.requireToolAgentId(props.agentId, metadata);
    return this.copilot.proposeAgentChange(agentId, {
      ...props,
      originSessionId: metadata?.sessionId,
    });
  }

  async proposeSkillChange(
    props: {
      resourceId?: string;
      summary: string;
      data: Record<string, any>;
      agentId: string;
    },
    metadata?: { agentId?: string; sessionId?: string },
  ) {
    const agentId = this.requireToolAgentId(props.agentId, metadata);
    return this.copilot.proposeSkillChange(agentId, {
      ...props,
      originSessionId: metadata?.sessionId,
    });
  }

  async proposeToolChange(
    props: {
      resourceId?: string;
      summary: string;
      data: Record<string, any>;
      agentId: string;
    },
    metadata?: { agentId?: string; sessionId?: string },
  ) {
    const agentId = this.requireToolAgentId(props.agentId, metadata);
    return this.copilot.proposeToolChange(agentId, {
      ...props,
      originSessionId: metadata?.sessionId,
    });
  }

  async proposeTaskChange(
    props: {
      resourceId: string;
      summary: string;
      data: {
        title?: string;
        description?: string;
        priority?: number;
        scheduledFor?: Date;
      };
      agentId: string;
    },
    metadata?: { agentId?: string; sessionId?: string },
  ) {
    const agentId = this.requireToolAgentId(props.agentId, metadata);
    return this.copilot.proposeTaskChange(agentId, {
      ...props,
      originSessionId: metadata?.sessionId,
    });
  }

  private requireToolAgentId(
    agentId?: string,
    metadata?: { agentId?: string },
  ) {
    if (metadata?.agentId && agentId && metadata.agentId !== agentId) {
      throw new BadRequestException(
        'agentId must match the authenticated calling agent',
      );
    }
    const resolved = metadata?.agentId ?? agentId;
    if (!resolved) {
      throw new BadRequestException('agentId is required for this tool');
    }
    return resolved;
  }

  async createGoal(props: CreateGoalDto) {
    return await this.goals.create(props);
  }

  async updateGoalProgress(props: {
    goalId: string;
    progress: number;
    status: 'pending' | 'started' | 'completed' | 'failed';
  }) {
    return await this.goals.updateProgress(
      props.goalId,
      props.progress,
      props.status,
    );
  }

  async recomputeGoalProgress(props: { goalId: string }) {
    await this.goals.recomputeProgress(props.goalId);
    return { success: true };
  }

  async runWorkflow(props: {
    workflowId: string;
    inputData?: Record<string, any>;
    agentId?: string;
    sessionId?: string;
    taskId?: string;
    userId?: string;
    waitForCompletion?: boolean;
    timeoutMs?: number;
  }) {
    if (!props.workflowId?.trim()) {
      throw new BadRequestException('runWorkflow requires workflowId');
    }

    const workflowExecutor = this.moduleRef.get(WorkflowExecutorService, {
      strict: false,
    });

    const executionId = await workflowExecutor.executeWorkflow({
      workflowId: props.workflowId,
      agentId: props.agentId,
      sessionId: props.sessionId,
      taskId: props.taskId,
      inputData: props.inputData ?? {},
      userId: props.userId,
      workflowDepth: 1,
    });

    if (!props.waitForCompletion) {
      return {
        executionId,
        workflowId: props.workflowId,
        status: 'running',
      };
    }

    const startedAt = Date.now();
    const timeoutMs = Math.max(
      1000,
      Math.min(props.timeoutMs ?? 60_000, 300_000),
    );
    while (Date.now() - startedAt < timeoutMs) {
      const execution = await workflowExecutor.getExecutionStatus(executionId);
      if (
        execution.status === 'completed' ||
        execution.status === 'failed' ||
        execution.status === 'cancelled' ||
        execution.status === 'awaiting_approval'
      ) {
        return {
          executionId,
          workflowId: props.workflowId,
          status: execution.status,
          outputData: execution.outputData,
          nodeResults: execution.nodeResults as Record<string, any> | undefined,
          errorMessage: execution.errorMessage ?? undefined,
        };
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    return {
      executionId,
      workflowId: props.workflowId,
      status: 'running',
    };
  }

  async webSearch(
    props: {
      query: string;
      count?: number;
      freshness?: 'day' | 'week' | 'month' | 'year';
      safeSearch?: 'off' | 'moderate' | 'strict';
    },
    metadata?: ToolExecutionMetadata,
  ) {
    const query = props.query?.trim();
    if (!query) {
      throw new BadRequestException('webSearch requires a non-empty query');
    }

    const config = resolveWebSearchConfig();
    const operationId = metadata?.toolCallId || randomUUID();
    const count = Math.max(1, Math.min(props.count ?? 8, 20));
    const agentId = this.requireToolAgentId(undefined, metadata);
    let reservation: Awaited<ReturnType<UsageService['authorizeCapability']>> =
      null;

    if (config.costUsdPerCall > 0) {
      const owner = await this.capabilityOwner(agentId);
      reservation = await this.usage.authorizeCapability({
        principalId: owner.principalId,
        capability: 'web_search',
        estimatedCostUsd: config.costUsdPerCall,
        idempotencyKey: `capability:web-search:${operationId}`,
        agentId,
        sessionId: metadata?.sessionId,
        metadata: {
          workspaceId: owner.workspaceId,
          provider: config.provider,
        },
      });
    }

    let results;
    try {
      results = await executeWebSearch(config, {
        query,
        count,
        freshness: props.freshness,
        safeSearch: props.safeSearch ?? 'moderate',
      });
    } catch (error) {
      await this.usage.releaseCapability(reservation?.reservationId);
      throw error;
    }

    if (config.costUsdPerCall > 0) {
      await this.usage.settleCapability({
        reservationId: reservation?.reservationId,
        capability: 'web_search',
        actualCostUsd: config.costUsdPerCall,
        idempotencyKey: `capability:web-search:${operationId}:capture`,
        agentId,
        sessionId: metadata?.sessionId,
        metadata: {
          provider: config.provider,
          count,
        },
      });
    }

    return {
      query,
      provider: config.provider,
      results,
    };
  }

  async deepSearch(
    props: {
      query: string;
      focus?: string;
      maxResults?: number;
      includeSources?: boolean;
    },
    metadata?: ToolExecutionMetadata,
  ) {
    const query = props.focus
      ? `${props.query.trim()} ${props.focus.trim()}`
      : props.query.trim();

    const search = await this.webSearch(
      {
        query,
        count: Math.max(5, Math.min(props.maxResults ?? 12, 20)),
        safeSearch: 'moderate',
      },
      metadata,
    );

    const summary =
      search.results.length > 0
        ? `Found ${search.results.length} relevant sources for "${props.query}". Use the returned source list for citation-aware synthesis.`
        : `No web results were returned for "${props.query}".`;

    return {
      query: props.query,
      focus: props.focus,
      summary,
      sources: props.includeSources === false ? [] : search.results,
    };
  }

  async speakInSpace(
    props: {
      spaceId: string;
      agentId: string;
      text: string;
      instructions?: string;
    },
    metadata?: ToolExecutionMetadata,
  ) {
    return this.spaceTts.speak({
      ...props,
      operationId: metadata?.toolCallId,
      sessionId: metadata?.sessionId,
    });
  }

  async createTask(
    props: {
      agentId: string;
      sessionId?: string;
      title: string;
      description?: string;
      executionMode?: 'single' | 'workflow' | 'sequential';
      workflowId?: string;
      workflowInputs?: Record<string, any>;
      cronExpression?: string;
      scheduledFor?: Date;
      isRecurring?: boolean;
      dependsOn?: string[];
      tools?: string[];
      toolConstraintType?: 'hard' | 'soft' | 'none';
      toolInstructions?: string;
      recurringSessionMode?: 'same' | 'new';
      context?: Record<string, any>;
      priority?: number;
      confirmed?: boolean;
    },
    metadata?: { agentId: string },
  ) {
    const callingAgentId = metadata?.agentId || props.agentId;

    const { confirmed: _confirmed, ...taskProps } = props;

    // Commons Copilot creates a reviewable user-owned task assigned to the
    // explicitly selected target agent. This is the same task model shown in
    // Studio; it never creates a hidden agent-owned/legacy task.
    if (await this.copilot.isSystemCopilot(callingAgentId)) {
      return this.copilot.proposeTaskChange(callingAgentId, {
        summary: `Create task “${props.title}” for the selected agent`,
        data: taskProps,
      });
    }

    if (!taskProps.sessionId) {
      throw new BadRequestException(
        'sessionId is required when an ordinary agent creates a task',
      );
    }

    return await this.taskExecution.createTask({
      ...taskProps,
      sessionId: taskProps.sessionId,
      createdBy: callingAgentId,
      createdByType: 'agent',
    });
  }

  async updateTaskProgress(props: {
    taskId: string;
    progress: number;
    status: 'pending' | 'started' | 'completed' | 'failed';
    resultContent: string;
    summary: string;
    context: TaskContext;
    scheduledEnd?: Date;
    estimatedDuration?: number;
    metadata?: Record<string, any>;
  }) {
    return await this.tasks.updateProgress(
      props.taskId,
      props.progress,
      props.status,
      props.resultContent,
      props.summary,
      props.context,
      props.scheduledEnd,
      props.estimatedDuration,
      props.metadata,
    );
  }

  interactWithAgent(props: {
    agentId: string;
    messages?: ChatCompletionMessageParam[];
    initiator: string;
    sessionId?: string;
  }) {
    return this.agent.runAgent(props);
  }
  /**
   * Generate an image using the stable GPT Image API.
   * @param props
   * @param metadata
   * @returns
   */
  /** Generate an image and persist it as a private S3-backed library item. */
  async generateImage(
    props: {
      prompt: string;
      n?: number;
      size?: '1024x1024' | '1024x1536' | '1536x1024' | 'auto';
      quality?: 'low' | 'medium' | 'high' | 'auto';
      agentId: string;
      sessionId?: string;
    },
    metadata?: ToolExecutionMetadata,
  ): Promise<
    {
      fileId: string;
      name: string;
      url?: string;
      prompt: string;
      model: string;
    }[]
  > {
    const { prompt, n = 1, size = '1024x1024' } = props;
    if (!Number.isInteger(n) || n < 1 || n > 4) {
      throw new BadRequestException('Image count must be between 1 and 4.');
    }
    const quality =
      props.quality === 'auto' || !props.quality ? 'medium' : props.quality;
    const model = process.env.OPENAI_IMAGE_MODEL || 'gpt-image-2';
    if (
      model !== 'gpt-image-2' &&
      !process.env.OPENAI_IMAGE_OUTPUT_PRICE_USD_JSON
    ) {
      throw new BadRequestException(
        `Image generation model ${model} is disabled until its price is configured.`,
      );
    }
    const agentId = this.requireToolAgentId(props.agentId, metadata);
    const owner = await this.capabilityOwner(agentId);
    const operationId = metadata?.toolCallId || randomUUID();
    const outputCostUsd = imageOutputCostUsd(size, quality) * n;
    const promptCostUsd = (Math.ceil(prompt.length / 4) / 1_000_000) * 5;
    const costUsd = outputCostUsd + promptCostUsd;
    const reservation = await this.usage.authorizeCapability({
      principalId: owner.principalId,
      capability: 'image_generation',
      estimatedCostUsd: costUsd,
      idempotencyKey: `capability:image:${operationId}`,
      agentId,
      sessionId: props.sessionId,
      metadata: {
        model,
        size,
        quality,
        count: n,
        workspaceId: owner.workspaceId,
      },
    });

    // The Image API is the direct, single-turn generation surface. GPT Image
    // returns base64 image data by default; response_format is intentionally
    // omitted because GPT Image returns base64 data directly by default.
    let response: any;
    try {
      response = await this.openAI.images.generate({
        model,
        prompt,
        n,
        size,
        quality,
        output_format: 'png',
        moderation: 'auto',
      } as any);
    } catch (error) {
      await this.usage.releaseCapability(reservation?.reservationId);
      throw error;
    }
    await this.usage.settleCapability({
      reservationId: reservation?.reservationId,
      capability: 'image_generation',
      actualCostUsd: costUsd,
      idempotencyKey: `capability:image:${operationId}:capture`,
      agentId,
      sessionId: props.sessionId,
      metadata: { provider: 'openai', model, size, quality, count: n },
    });

    const results: Array<{
      fileId: string;
      name: string;
      url?: string;
      prompt: string;
      model: string;
    }> = [];

    for (let i = 0; i < response.data.length; i++) {
      const imageData = response.data[i];
      const base64String = imageData.b64_json;
      if (!base64String) continue;
      const created = await this.files.createGeneratedFile({
        buffer: Buffer.from(base64String, 'base64'),
        fileName: `generated-image-${Date.now()}-${i + 1}.png`,
        mimeType: 'image/png',
        agentId: props.agentId,
        sessionId: props.sessionId,
        metadata: {
          provider: 'openai',
          model,
          prompt,
          quality,
          requestedSize: size,
        },
      });
      const readable = await this.files.readFileForAgent({
        fileId: created.fileId,
        agentId: props.agentId,
        sessionId: props.sessionId,
        includeImageUrls: true,
        maxChars: 1,
      });
      results.push({
        fileId: created.fileId,
        name: created.name,
        url: readable.artifacts.find((artifact) => artifact.url)?.url,
        prompt,
        model,
      });
    }
    return results;
  }

  /**
   * Upload a file directly to IPFS using Pinata.
   * - `props.base64String` is your file’s data encoded in base64.
   * - `props.fileName` is the desired name for the file on IPFS (e.g. "photo.png").
   * - `props.mimeType` is the MIME type (e.g. "image/png").
   * - `props.agentId` and `props.privateKey` are included to match the single param approach (Typia).
   */
  async uploadFileToIPFS(props: {
    base64String: string;
    fileName: string;
    mimeType: string;
    agentId: string;
    privateKey: string;
  }): Promise<{ ipfsUrl: string }> {
    const { base64String, fileName, mimeType } = props;

    // 1) Upload to Pinata
    const pinataResult = await this.pinataService.uploadFileFromBase64(
      base64String,
      fileName,
      mimeType,
    );

    // 2) Construct a gateway URL; you may have PINATA_GATEWAY or custom domain
    const cid = pinataResult.IpfsHash;
    const gatewayUrl = `https://${process.env.GATEWAY_URL ?? 'gateway.pinata.cloud'}/ipfs/${cid}`;

    // 3) Return IPFS info
    return {
      ipfsUrl: gatewayUrl,
    };
  }

  async readUploadedFile(props: {
    fileId: string;
    offset?: number;
    maxChars?: number;
    includeImageUrls?: boolean;
    includeDownloadUrl?: boolean;
    pageNumber?: number;
    agentId: string;
    sessionId?: string;
  }) {
    return this.files.readFileForAgent({
      fileId: props.fileId,
      agentId: props.agentId,
      sessionId: props.sessionId,
      offset: props.offset,
      maxChars: props.maxChars,
      includeImageUrls: props.includeImageUrls,
      includeDownloadUrl: props.includeDownloadUrl,
      pageNumber: props.pageNumber,
    });
  }

  async searchLibraryArtifacts(
    props: {
      query: string;
      limit?: number;
      agentId: string;
      sessionId?: string;
    },
    metadata?: ToolExecutionMetadata,
  ) {
    const agentId = this.requireToolAgentId(props.agentId, metadata);
    return this.library.searchForAgent({
      agentId,
      sessionId: props.sessionId ?? metadata?.sessionId,
      query: props.query,
      limit: props.limit,
    });
  }

  async createSpreadsheetFile(props: {
    fileName: string;
    sheets: Array<{
      name: string;
      rows: Array<Record<string, any> | any[]>;
    }>;
    agentId: string;
    sessionId?: string;
  }) {
    return this.files.createSpreadsheetFile({
      fileName: props.fileName,
      sheets: props.sheets,
      agentId: props.agentId,
      sessionId: props.sessionId,
      ownerId: props.agentId,
      ownerType: 'agent',
    });
  }

  async createTextFile(props: {
    fileName: string;
    content: string;
    mimeType?: string;
    sourceFileId?: string;
    agentId: string;
    sessionId?: string;
  }) {
    return this.files.createTextFile(props);
  }

  async createDocumentFile(props: {
    fileName: string;
    title?: string;
    sections: Array<{
      heading?: string;
      paragraphs?: string[];
      bullets?: string[];
    }>;
    sourceFileId?: string;
    agentId: string;
    sessionId?: string;
  }) {
    return this.files.createDocumentFile(props);
  }

  async createPresentationFile(props: {
    fileName: string;
    title?: string;
    slides: Array<{
      title: string;
      subtitle?: string;
      bullets?: string[];
      notes?: string;
    }>;
    sourceFileId?: string;
    agentId: string;
    sessionId?: string;
  }) {
    return this.files.createPresentationFile(props);
  }

  async createPdfFile(props: {
    fileName: string;
    title?: string;
    sections: Array<{ heading?: string; body: string }>;
    sourceFileId?: string;
    agentId: string;
    sessionId?: string;
  }) {
    return this.files.createPdfFile(props);
  }

  async startAgentComputer(
    props: {
      agentId?: string;
      sessionId?: string;
      name?: string;
      reason?: string;
    },
    metadata?: ToolExecutionMetadata,
  ) {
    const agentId = this.requireToolAgentId(props.agentId, metadata);
    return this.computers.startComputer({
      ...props,
      agentId,
      sessionId: props.sessionId ?? metadata?.sessionId,
      actorId: agentId,
      actorType: 'agent',
      runId: metadata?.runId,
      toolCallId: metadata?.toolCallId,
    });
  }

  async listAgentComputers(
    props: {
      agentId?: string;
      sessionId?: string;
      includeTerminated?: boolean;
    },
    metadata?: ToolExecutionMetadata,
  ) {
    const agentId = this.requireToolAgentId(props.agentId, metadata);
    return this.computers.listInstances({
      ...props,
      agentId,
      sessionId: props.sessionId ?? metadata?.sessionId,
    });
  }

  async runComputerCommand(
    props: {
      agentId?: string;
      computerId?: string;
      sessionId?: string;
      command: string;
      cwd?: string;
      timeoutSeconds?: number;
    },
    metadata?: ToolExecutionMetadata,
  ) {
    const agentId = this.requireToolAgentId(props.agentId, metadata);
    return this.computers.runCommand({
      ...props,
      agentId,
      sessionId: props.sessionId ?? metadata?.sessionId,
      actorId: agentId,
      actorType: 'agent',
      runId: metadata?.runId,
      toolCallId: metadata?.toolCallId,
    });
  }

  async readComputerFile(
    props: {
      agentId?: string;
      computerId?: string;
      sessionId?: string;
      path: string;
    },
    metadata?: ToolExecutionMetadata,
  ) {
    const agentId = this.requireToolAgentId(props.agentId, metadata);
    return this.computers.readFile({
      ...props,
      agentId,
      sessionId: props.sessionId ?? metadata?.sessionId,
    });
  }

  async writeComputerFiles(
    props: {
      agentId?: string;
      computerId?: string;
      sessionId?: string;
      files: Array<{ path: string; content: string }>;
    },
    metadata?: ToolExecutionMetadata,
  ) {
    const agentId = this.requireToolAgentId(props.agentId, metadata);
    return this.computers.writeFiles({
      ...props,
      agentId,
      sessionId: props.sessionId ?? metadata?.sessionId,
      actorId: agentId,
      actorType: 'agent',
      runId: metadata?.runId,
      toolCallId: metadata?.toolCallId,
    });
  }

  async openComputerBrowser(
    props: {
      agentId?: string;
      computerId?: string;
      sessionId?: string;
      url: string;
    },
    metadata?: ToolExecutionMetadata,
  ) {
    const agentId = this.requireToolAgentId(props.agentId, metadata);
    return this.computers.openBrowser({
      ...props,
      agentId,
      sessionId: props.sessionId ?? metadata?.sessionId,
      actorId: agentId,
      actorType: 'agent',
      runId: metadata?.runId,
      toolCallId: metadata?.toolCallId,
    });
  }

  async testComputerBrowser(
    props: {
      agentId?: string;
      computerId?: string;
      sessionId?: string;
      url?: string;
      actions?: Array<{
        type: 'click' | 'type' | 'select' | 'press' | 'expectText';
        selector?: string;
        text?: string;
        value?: string;
        key?: string;
      }>;
    },
    metadata?: ToolExecutionMetadata,
  ) {
    const agentId = this.requireToolAgentId(props.agentId, metadata);
    return this.computers.testBrowser({
      ...props,
      agentId,
      sessionId: props.sessionId ?? metadata?.sessionId,
      actorId: agentId,
      actorType: 'agent',
      runId: metadata?.runId,
      toolCallId: metadata?.toolCallId,
    });
  }

  async createCodeProject(
    props: {
      agentId?: string;
      sessionId?: string;
      name: string;
      description?: string;
      files?: CodeProjectFileInput[];
    },
    metadata?: ToolExecutionMetadata,
  ) {
    const agentId = this.requireToolAgentId(props.agentId, metadata);
    return this.codeProjects.create({
      ...props,
      agentId,
      sessionId: props.sessionId ?? metadata?.sessionId,
      runId: metadata?.runId,
      toolCallId: metadata?.toolCallId,
    });
  }

  async writeCodeProjectFiles(
    props: {
      agentId?: string;
      projectId: string;
      files: CodeProjectFileInput[];
      replace?: boolean;
    },
    metadata?: ToolExecutionMetadata,
  ) {
    const agentId = this.requireToolAgentId(props.agentId, metadata);
    return this.codeProjects.writeFiles({
      ...props,
      agentId,
      runId: metadata?.runId,
      toolCallId: metadata?.toolCallId,
    });
  }

  async readCodeProject(
    props: { agentId?: string; projectId: string },
    metadata?: ToolExecutionMetadata,
  ) {
    const agentId = this.requireToolAgentId(props.agentId, metadata);
    return this.codeProjects.get(agentId, props.projectId);
  }

  async publishCodeProject(
    props: { agentId?: string; projectId: string },
    metadata?: ToolExecutionMetadata,
  ) {
    const agentId = this.requireToolAgentId(props.agentId, metadata);
    return this.codeProjects.publish({
      agentId,
      projectId: props.projectId,
      runId: metadata?.runId,
      toolCallId: metadata?.toolCallId,
    });
  }

  async testCodeProject(
    props: {
      agentId?: string;
      projectId: string;
      actions?: BrowserCheckAction[];
    },
    metadata?: ToolExecutionMetadata,
  ) {
    const agentId = this.requireToolAgentId(props.agentId, metadata);
    return this.codeProjects.verify({
      agentId,
      projectId: props.projectId,
      actions: props.actions,
      runId: metadata?.runId,
      toolCallId: metadata?.toolCallId,
    });
  }

  async exportCodeProjectToComputer(
    props: {
      agentId?: string;
      sessionId?: string;
      projectId: string;
      directory?: string;
    },
    metadata?: ToolExecutionMetadata,
  ) {
    const agentId = this.requireToolAgentId(props.agentId, metadata);
    return this.codeProjects.exportToComputer({
      ...props,
      agentId,
      sessionId: props.sessionId ?? metadata?.sessionId,
      runId: metadata?.runId,
      toolCallId: metadata?.toolCallId,
    });
  }

  /* ─────────────────────────  SPACE METHODS  ───────────────────────── */

  /**
   * Create a new shared space for multi-agent communication
   */
  async createSpace(props: {
    name: string;
    description?: string;
    sessionId?: string;
    isPublic?: boolean;
    maxMembers?: number;
    agentId: string;
  }) {
    const { agentId, ...spaceProps } = props;

    return await this.space.createSpace({
      ...spaceProps,
      createdBy: agentId,
      createdByType: 'agent',
    });
  }

  /**
   * Join an existing space
   */
  async joinSpace(props: { spaceId: string; agentId: string }) {
    const { spaceId, agentId } = props;

    return await this.space.addMember({
      spaceId,
      memberId: agentId,
      memberType: 'agent',
    });
  }

  /**
   * Add an agent to a space
   */
  async addAgentToSpace(props: {
    spaceId: string;
    targetAgentId: string;
    agentId: string;
  }) {
    const { spaceId, targetAgentId, agentId } = props;

    // Check if the requesting agent is a member and has permission to invite
    const isMember = await this.space.isMember(spaceId, agentId, 'agent');
    if (!isMember) {
      throw new BadRequestException(
        'You must be a member of the space to add other agents',
      );
    }

    return await this.space.addMember({
      spaceId,
      memberId: targetAgentId,
      memberType: 'agent',
    });
  }
  /**
   * Add human to a space
   * This is a special case where we allow human users to be added to spaces.
   */
  async addHumanToSpace(props: {
    spaceId: string;
    targetHumanId: string;
    agentId: string;
  }) {
    const { spaceId, targetHumanId, agentId } = props;

    // Check if the requesting agent is a member and has permission to invite
    const isMember = await this.space.isMember(spaceId, agentId, 'agent');
    if (!isMember) {
      throw new BadRequestException(
        'You must be a member of the space to add other humans',
      );
    }

    return await this.space.addMember({
      spaceId,
      memberId: targetHumanId,
      memberType: 'human',
    });
  }
  /**
   * Remove an agent from a space
   */
  async removeAgentFromSpace(props: {
    spaceId: string;
    targetAgentId: string;
    agentId: string;
  }) {
    const { spaceId, targetAgentId, agentId } = props;

    // Check if the requesting agent is a member and has permission to remove
    const isMember = await this.space.isMember(spaceId, agentId, 'agent');
    if (!isMember) {
      throw new BadRequestException(
        'You must be a member of the space to remove other agents',
      );
    }

    return await this.space.removeMember(spaceId, targetAgentId, 'agent');
  }
  /**
   * Remove human from a space
   * This is a special case where we allow human users to be removed from spaces.
   */
  async removeHumanFromSpace(props: {
    spaceId: string;
    targetHumanId: string;
    agentId: string;
  }) {
    const { spaceId, targetHumanId, agentId } = props;

    // Check if the requesting agent is a member and has permission to remove
    const isMember = await this.space.isMember(spaceId, agentId, 'agent');
    if (!isMember) {
      throw new BadRequestException(
        'You must be a member of the space to remove other humans',
      );
    }

    return await this.space.removeMember(spaceId, targetHumanId, 'human');
  }

  /**
   * Send a message to a space
   */
  async sendMessageToSpace(
    props: {
      spaceId: string;
      content: string;
      targetType?: 'broadcast' | 'direct' | 'group';
      targetIds?: string[];
      agentId: string;
      sessionId?: string; // optional session ID for context
    },
    metadata: { sessionId: string; agentId: string } = {
      sessionId: '',
      agentId: '',
    },
  ) {
    const { agentId, ...messageProps } = props;

    return await this.space.sendMessage({
      ...messageProps,
      senderId: agentId,
      senderType: 'agent',
      metadata,
    });
  }

  /**
   * Get messages from a space
   */
  async getSpaceMessages(props: {
    spaceId: string;
    limit?: number;
    agentId: string;
  }) {
    const { spaceId, agentId, limit = 50 } = props;

    // Check if the agent is a member
    const isMember = await this.space.isMember(spaceId, agentId, 'agent');
    if (!isMember) {
      throw new BadRequestException(
        'You must be a member of the space to read messages',
      );
    }

    return await this.space.getMessagesForMember(spaceId, agentId, limit);
  }

  /**
   * Get spaces where the agent is a member
   */
  async getMySpaces(props: { agentId: string }) {
    const { agentId } = props;

    return await this.space.getSpacesForMember(agentId, 'agent');
  }

  /**
   * Get space members by space ID
   */
  async getSpaceMembers(props: { spaceId: string }) {
    const { spaceId } = props;

    return await this.space.getSpaceMembers(spaceId);
  }

  /**
   * Subscribe to space messages (automatically subscribes when agent joins space)
   */
  async subscribeToSpace(props: { spaceId: string; agentId: string }) {
    const { spaceId, agentId } = props;

    return await this.space.subscribeAgentToSpace(agentId, spaceId);
  }
  /**
   * Unsubscribe to space messages (automatically unsubscribes when agent leaves space)
   */
  async unsubscribeFromSpace(props: { spaceId: string; agentId: string }) {
    const { spaceId, agentId } = props;

    return await this.space.unsubscribeAgentFromSpace(agentId, spaceId);
  }

  /**
   * Process data within a workflow using agent reasoning
   * This allows agents to analyze, transform, or make decisions within workflows
   * WITHOUT triggering infinite recursion
   *
   * CRITICAL RESTRICTIONS:
   * - workflowDepth MUST be 1 (cannot nest workflows)
   * - Cannot trigger another workflow
   * - Cannot create new sessions
   * - Has execution timeout (2 minutes max)
   * - Limited to current session context
   */
  async processWithinWorkflow(props: {
    instruction: string;
    data: any;
    sessionId: string;
    agentId: string;
    maxTokens?: number;
    workflowDepth: number;
  }): Promise<{
    result: string;
    processed: boolean;
  }> {
    const {
      instruction,
      data,
      sessionId,
      agentId,
      maxTokens = 500,
      workflowDepth,
    } = props;

    // CRITICAL: Prevent infinite recursion
    if (workflowDepth > 1) {
      throw new BadRequestException(
        'Agent processor cannot be nested in workflows (max depth: 1)',
      );
    }

    try {
      // Resolve the agent's model config so we use the correct provider (BYOK-aware)
      const agentRecord = await this.agent.getAgent({ agentId });
      const llm = this.modelProviderFactory.build({
        provider: (agentRecord.modelProvider as any) ?? 'openai',
        modelId: agentRecord.modelId ?? 'gpt-5.4-mini',
        // Note: we don't decrypt the API key here; if it's encrypted the factory
        // will fall back to the platform env key which is correct for workflow-internal calls.
        temperature: 0.7,
        maxTokens,
      });

      const userContent = `${instruction}\n\nData to process:\n${JSON.stringify(data, null, 2)}\n\nProvide a clear, structured result.`;

      const response = await llm.invoke([
        new SystemMessage(
          'You are a data processor within a workflow. Analyze and transform the provided data according to the instruction. Be concise and focused. Do not trigger new workflows or sessions.',
        ),
        new HumanMessage(userContent),
      ]);

      const result =
        typeof response.content === 'string'
          ? response.content
          : JSON.stringify(response.content);

      return { result, processed: true };
    } catch (error: any) {
      throw new BadRequestException(
        `Agent processing failed: ${error.message}`,
      );
    }
  }

  /**
   * invoke_skill — call a local platform skill OR an external A2A-compatible agent.
   *
   * Local skill (by slug): returns the skill's full instructions as text payload.
   * External A2A: sends a `tasks/send` JSON-RPC request to the target agent URL.
   *
   * Input params:
   *   skillSlug {string?} Local platform skill slug (e.g. "web-research")
   *   url       {string?} Base URL of the target A2A agent endpoint
   *   message   {string}  The message/prompt to send (used for A2A calls)
   *   agentId   {string?} Agent ID at the target URL (appended if not in url)
   *   apiKey    {string?} Bearer token for authenticated A2A endpoints
   *   contextId {string?} A2A session context ID
   */
  async invoke_skill(
    props: {
      skillSlug?: string;
      url?: string;
      message?: string;
      agentId?: string;
      apiKey?: string;
      contextId?: string;
    },
    _metadata?: any,
  ): Promise<{
    text: string;
    taskId?: string;
    state?: string;
    artifacts?: any[];
  }> {
    // ── Local skill lookup ─────────────────────────────────────────────────
    if (props.skillSlug && !props.url) {
      const skill = await this.skillService.get(props.skillSlug);
      await this.skillService.incrementUsage(props.skillSlug);
      return {
        text: `# ${skill.name}\n\n${skill.instructions}`,
        state: 'completed',
      };
    }

    if (!props.url) {
      throw new BadRequestException(
        'invoke_skill: either skillSlug or url is required',
      );
    }

    const { url, message = '', agentId, apiKey, contextId } = props;

    // Build the target endpoint
    const endpoint =
      agentId && !url.includes(agentId)
        ? `${url.replace(/\/$/, '')}/${agentId}`
        : url;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

    const taskId = `skill-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const rpcBody = {
      jsonrpc: '2.0',
      id: taskId,
      method: 'tasks/send',
      params: {
        id: taskId,
        message: {
          role: 'user',
          parts: [{ type: 'text', text: message }],
          ...(contextId ? { contextId } : {}),
        },
      },
    };

    console.log(`invoke_skill: calling ${endpoint}`);

    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(rpcBody),
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) {
      throw new BadRequestException(
        `invoke_skill: remote agent returned ${response.status} ${response.statusText}`,
      );
    }

    const rpcResponse = (await response.json()) as any;
    if (rpcResponse.error) {
      throw new BadRequestException(
        `invoke_skill: remote agent error [${rpcResponse.error.code}] ${rpcResponse.error.message}`,
      );
    }

    const task = rpcResponse.result;
    const textPart = task?.status?.message?.parts?.find(
      (p: any) => p.type === 'text',
    );
    const text =
      textPart?.text ?? JSON.stringify(task?.status?.message ?? task);

    return {
      text,
      taskId: task?.id ?? taskId,
      state: task?.status?.state ?? 'unknown',
      artifacts: task?.artifacts,
    };
  }
}

/** Current GPT Image 2 output prices; reviewed against the provider catalog. */
function imageOutputCostUsd(
  size: '1024x1024' | '1024x1536' | '1536x1024' | 'auto',
  quality: 'low' | 'medium' | 'high',
) {
  const configured = process.env.OPENAI_IMAGE_OUTPUT_PRICE_USD_JSON;
  let prices: Record<string, Record<string, number>> = {
    low: { '1024x1024': 0.006, '1024x1536': 0.005, '1536x1024': 0.005 },
    medium: {
      '1024x1024': 0.053,
      '1024x1536': 0.041,
      '1536x1024': 0.041,
    },
    high: { '1024x1024': 0.211, '1024x1536': 0.165, '1536x1024': 0.165 },
  };
  if (configured) {
    try {
      prices = JSON.parse(configured);
    } catch {
      throw new BadRequestException(
        'OPENAI_IMAGE_OUTPUT_PRICE_USD_JSON is invalid.',
      );
    }
  }
  const selected = Object.values(prices[quality] ?? {}).filter(
    (value) => Number.isFinite(value) && value > 0,
  );
  if (!selected.length) {
    throw new BadRequestException(
      `No image price is configured for quality ${quality}.`,
    );
  }
  // The API's auto size can choose an arbitrary resolution. Reserve the
  // highest catalogued cost for the selected quality.
  if (size === 'auto') return Math.max(...selected);
  const exact = prices[quality]?.[size];
  return Number.isFinite(exact) && exact > 0 ? exact : Math.max(...selected);
}

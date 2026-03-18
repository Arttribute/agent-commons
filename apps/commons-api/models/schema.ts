// apps/commons-api/src/models/schema.ts
import {
  jsonb,
  pgTable,
  timestamp,
  uuid,
  text,
  integer,
  real,
  boolean as pgBoolean,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { relations } from 'drizzle-orm';
import { ChatCompletionTool } from 'openai/resources';

/* ─────────────────────────  AGENT  ───────────────────────── */

export const agent = pgTable('agent', {
  agentId: text('agent_id')
    .default(sql`uuid_generate_v4()`)
    .primaryKey(),

  instructions: text(),
  persona: text(),
  owner: text(),
  name: text().notNull(),
  knowledgebase: jsonb('knowledgebase').$type<
    Array<{
      title: string;
      content: string;
      usageComments?: string;
    }>
  >(),
  externalTools: jsonb('external_tools').$type<string[]>(),
  commonTools: jsonb('common_tools').$type<string[]>(),

  temperature: real('temperature'),
  maxTokens: integer('max_tokens'),
  topP: real('top_p'),
  presencePenalty: real('presence_penalty'),
  frequencyPenalty: real('frequency_penalty'),
  stopSequence: jsonb('stop_sequence').$type<string[]>(),
  avatar: text(),
  // Text-to-speech preferences (optional)
  ttsProvider: text('tts_provider'), // 'openai' | 'elevenlabs'
  ttsVoice: text('tts_voice'), // OpenAI voice name or ElevenLabs voiceId

  // Liaison columns – we store only the hash of the liaison_key
  isLiaison: pgBoolean('is_liaison').default(false).notNull(),
  liaisonKeyHash: text('liaison_key'),
  externalUrl: text('external_url'),
  externalEndpoint: text('external_endpoint'),

  /* ▼ autonomous-mode settings ▼ */
  autonomyEnabled: pgBoolean('autonomy_enabled').default(false).notNull(),
  autonomousIntervalSec: integer('autonomous_interval_sec').default(0), // 0 = off
  cronJobName: text('cron_job_name'),

  // Model provider configuration (BYOK support)
  modelProvider: text('model_provider').default('openai'),  // 'openai' | 'anthropic' | 'google' | 'mistral' | 'groq' | 'ollama'
  modelId: text('model_id').default('gpt-4o'),
  modelApiKey: text('model_api_key'),   // Encrypted BYOK API key
  modelBaseUrl: text('model_base_url'), // For Ollama / custom endpoints

  // A2A Protocol — Agent-to-Agent interoperability
  a2aEnabled: pgBoolean('a2a_enabled').default(false).notNull(),
  a2aSkills: jsonb('a2a_skills').$type<Array<{
    id: string;
    name: string;
    description?: string;
    tags?: string[];
    inputModes?: string[];
    outputModes?: string[];
  }>>(),

  createdAt: timestamp('created_at', { withTimezone: true })
    .default(sql`timezone('utc', now())`)
    .notNull(),
});

/* ─────────────────────────  AGENT WALLET  ───────────────────────── */

/**
 * Phase 10: Owner-controlled wallet architecture.
 * Each agent can have a wallet. The platform stores only the session/EOA key
 * (encrypted) — never the owner's master key. Supports ERC-4337 smart accounts,
 * plain EOA keypairs, and external wallets connected by the owner.
 */
export const agentWallet = pgTable('agent_wallet', {
  id: uuid('id').default(sql`uuid_generate_v4()`).primaryKey(),

  agentId: text('agent_id')
    .notNull()
    .references(() => agent.agentId, { onDelete: 'cascade' }),

  // 'eoa'            — plain EOA keypair managed by the platform (encrypted key stored below)
  // 'erc4337'        — ERC-4337 smart account with session key
  // 'external'       — owner-connected wallet (platform holds no key)
  walletType: text('wallet_type').notNull().default('eoa'),

  // The public wallet address (safe to store in plaintext)
  address: text('address').notNull(),

  // Encrypted private key (for 'eoa' and 'erc4337' session keys only).
  // Format: enc:<iv>:<tag>:<ciphertext>  — encrypted via EncryptionService.
  // NEVER store the owner's master key here.
  encryptedPrivateKey: text('encrypted_private_key'),

  // For ERC-4337: the smart account address (the on-chain contract wallet)
  smartAccountAddress: text('smart_account_address'),

  // Session key permissions (for ERC-4337 scoped keys)
  sessionPermissions: jsonb('session_permissions').$type<{
    allowedContracts?: string[];
    maxValuePerTx?: string;    // in wei
    expiresAt?: string;        // ISO timestamp
  }>(),

  // Chain the wallet lives on (chain ID as string, e.g. "84532" for Base Sepolia)
  chainId: text('chain_id').notNull().default('84532'),

  // Human-readable label, e.g. "Primary", "Trading", "Payments"
  label: text('label').default('Primary'),

  isActive: pgBoolean('is_active').default(true).notNull(),

  createdAt: timestamp('created_at', { withTimezone: true })
    .default(sql`timezone('utc', now())`)
    .notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .default(sql`timezone('utc', now())`)
    .notNull(),
});

/* ─────────────────────────  SESSION  ───────────────────────── */

export const session = pgTable('session', {
  sessionId: uuid('session_id')
    .default(sql`uuid_generate_v4()`)
    .primaryKey(),

  agentId: text('agent_id').notNull(),

  title: text('title'),
  initiator: text('initiator'), // wallet address of user or agent

  model: jsonb('model').$type<{
    name?: string;          // Legacy field - keep for backward compat
    provider?: string;      // 'openai' | 'anthropic' | 'google' | 'mistral' | 'groq' | 'ollama'
    modelId?: string;       // e.g. 'claude-sonnet-4-6', 'gpt-4o'
    apiKey?: string;        // BYOK — encrypted at rest
    baseUrl?: string;       // For custom endpoints
    temperature?: number;
    maxTokens?: number;
    topP?: number;
    presencePenalty?: number;
    frequencyPenalty?: number;
  }>(),

  query: jsonb('query').$type<{
    text: string;
    timestamp: string;
    metadata?: Record<string, any>;
  }>(),

  history: jsonb('history').$type<
    Array<{
      role: string;
      content: string;
      timestamp: string;
      metadata?: Record<string, any>;
    }>
  >(),

  metrics: jsonb('metrics').$type<{
    totalTokens?: number;
    responseTime?: number;
    toolCalls?: number;
    errorCount?: number;
  }>(),

  endedAt: timestamp('ended_at', { withTimezone: true }),

  // Keep as JSON list of space IDs for now (not relational)
  spaces: jsonb('spaces').$type<{ spaceIds: string[] }>(),

  // Make this a UUID so we can reference session.sessionId
  parentSessionId: uuid('parent_session'),

  createdAt: timestamp('created_at', { withTimezone: true })
    .default(sql`timezone('utc', now())`)
    .notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .default(sql`timezone('utc', now())`)
    .notNull(),
});

/* ─────────────────────────  GOAL (DEPRECATED - TO BE REMOVED)  ───────────────────────── */
// DEPRECATED: Goals abstraction is being removed. Tasks now handle everything directly.
// This table will be dropped in the next migration.
// DO NOT USE THIS TABLE IN NEW CODE.

/*
export const goal = pgTable('goal', {
  goalId: uuid('goal_id')
    .default(sql`uuid_generate_v4()`)
    .primaryKey(),

  agentId: text('agent_id')
    .notNull()
    .references(() => agent.agentId, { onDelete: 'cascade' }),

  sessionId: uuid('session_id').references(() => session.sessionId, {
    onDelete: 'cascade',
  }),

  title: text('title').notNull(),
  description: text('description'),

  status: text('status').default('pending').notNull(), // pending | started | paused | completed | failed
  priority: integer('priority').default(0).notNull(),
  deadline: timestamp('deadline', { withTimezone: true }),
  progress: real('progress').default(0),
  isAutoGenerated: pgBoolean('is_auto_generated').default(false),
  metadata: jsonb('metadata').$type<Record<string, any>>(),

  createdAt: timestamp('created_at', { withTimezone: true })
    .default(sql`timezone('utc', now())`)
    .notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .default(sql`timezone('utc', now())`)
    .notNull(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
});
*/

/* ─────────────────────────  TASK  ───────────────────────── */

export const task = pgTable('task', {
  taskId: uuid('task_id')
    .default(sql`uuid_generate_v4()`)
    .primaryKey(),

  // Agent and session (required)
  agentId: text('agent_id')
    .notNull()
    .references(() => agent.agentId, { onDelete: 'cascade' }),

  sessionId: uuid('session_id')
    .notNull()
    .references(() => session.sessionId, { onDelete: 'cascade' }),

  // Basic info
  title: text('title').notNull(),
  description: text('description'),

  // Status and execution
  status: text('status').default('pending').notNull(), // 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
  priority: integer('priority').default(0).notNull(),

  // Execution mode
  executionMode: text('execution_mode').default('single').notNull(), // 'single' | 'workflow' | 'sequential'

  // Workflow integration (optional)
  workflowId: uuid('workflow_id').references(() => workflow.workflowId, {
    onDelete: 'set null',
  }),
  workflowInputs: jsonb('workflow_inputs').$type<Record<string, any>>(), // Inputs to pass to workflow

  // Scheduling
  cronExpression: text('cron_expression'), // e.g., '*/5 * * * *' (every 5 mins)
  scheduledFor: timestamp('scheduled_for', { withTimezone: true }), // One-time scheduled execution
  isRecurring: pgBoolean('is_recurring').default(false),
  nextRunAt: timestamp('next_run_at', { withTimezone: true }), // Next scheduled run
  lastRunAt: timestamp('last_run_at', { withTimezone: true }), // Last execution time

  // Execution tracking
  actualStart: timestamp('actual_start', { withTimezone: true }),
  actualEnd: timestamp('actual_end', { withTimezone: true }),
  estimatedDuration: integer('estimated_duration'), // milliseconds
  progress: real('progress').default(0),

  // Dependencies
  dependsOn: jsonb('depends_on').$type<string[]>(), // Array of taskIds this task depends on

  // Task-specific tools (optional - overrides agent's default tools)
  tools: jsonb('tools').$type<string[]>(), // Tool names/IDs to use

  // Tool constraint configuration
  toolConstraintType: text('tool_constraint_type').default('none').notNull(), // 'hard' | 'soft' | 'none'
  toolInstructions: text('tool_instructions'), // Instructions for agent on how to use tools (e.g., "If you encounter X, use tool Y")

  // Recurring task session management
  recurringSessionMode: text('recurring_session_mode').default('same').notNull(), // 'same' | 'new' - whether recurring tasks run in same or new session

  // Context and metadata
  context: jsonb('context').$type<Record<string, any>>(), // Additional context for execution
  metadata: jsonb('metadata').$type<Record<string, any>>(),

  // Timeout (optional, in milliseconds; overrides workflow-level timeout)
  timeoutMs: integer('timeout_ms'),

  // Results
  resultContent: jsonb('result_content').$type<any>(),
  summary: text('summary'),
  errorMessage: text('error_message'),

  // Creation tracking
  createdBy: text('created_by').notNull(), // userId or agentId
  createdByType: text('created_by_type').notNull(), // 'user' | 'agent'

  createdAt: timestamp('created_at', { withTimezone: true })
    .default(sql`timezone('utc', now())`)
    .notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .default(sql`timezone('utc', now())`)
    .notNull(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
});

/* ─────────────────────────  SCHEDULED TASK RUN  ───────────────────────── */

/**
 * Durable store for scheduled task runs.
 * Replaces in-memory CronJob instances — survives container restarts.
 * The TaskSchedulerService polls this table every 15 seconds.
 */
export const scheduledTaskRun = pgTable('scheduled_task_run', {
  runId: uuid('run_id')
    .default(sql`uuid_generate_v4()`)
    .primaryKey(),

  taskId: uuid('task_id')
    .notNull()
    .references(() => task.taskId, { onDelete: 'cascade' }),

  scheduledFor: timestamp('scheduled_for', { withTimezone: true }).notNull(),
  triggeredBy: text('triggered_by').default('cron').notNull(), // 'cron' | 'manual' | 'dependency'

  status: text('status').default('pending').notNull(), // 'pending' | 'running' | 'completed' | 'failed' | 'skipped'
  startedAt: timestamp('started_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  errorMessage: text('error_message'),

  // Which session was used for this run
  sessionId: uuid('session_id'),

  createdAt: timestamp('created_at', { withTimezone: true })
    .default(sql`timezone('utc', now())`)
    .notNull(),
});

/* ─────────────────────────  TASK DEPENDENCY (DEPRECATED - TO BE REMOVED)  ───────────────────────── */
// DEPRECATED: Task dependencies are now managed via the dependsOn array in the task table.
// This provides simpler dependency management without a separate join table.
// This table will be dropped in the next migration.
// DO NOT USE THIS TABLE IN NEW CODE.

/*
export const taskDependency = pgTable('task_dependency', {
  id: uuid('id')
    .default(sql`uuid_generate_v4()`)
    .primaryKey(),

  dependentTaskId: uuid('dependent_task_id')
    .notNull()
    .references(() => task.taskId, { onDelete: 'cascade' }),

  dependencyTaskId: uuid('dependency_task_id')
    .notNull()
    .references(() => task.taskId, { onDelete: 'cascade' }),

  dependencyType: text('dependency_type').default('finish_to_start'),

  createdAt: timestamp('created_at', { withTimezone: true })
    .default(sql`timezone('utc', now())`)
    .notNull(),
});
*/

/* ─────────────────────────  TOOL  ───────────────────────── */

export const tool = pgTable('tool', {
  toolId: uuid('tool_id')
    .default(sql`uuid_generate_v4()`)
    .primaryKey(),

  name: text('name').notNull().unique(),
  displayName: text('display_name'),
  description: text('description'),

  // Tool specification (OpenAI ChatCompletionTool format)
  schema: jsonb('schema').notNull().$type<ChatCompletionTool>(),

  // API specification for dynamic tools
  apiSpec: jsonb('api_spec').$type<{
    baseUrl: string;
    path: string;
    method: string; // GET, POST, PUT, PATCH, DELETE
    headers?: Record<string, string>;
    queryParams?: Record<string, string>;
    bodyTemplate?: any;
    authType?: 'none' | 'bearer' | 'api-key' | 'basic' | 'oauth2';
    authKeyName?: string; // Name of the key required (e.g., 'OPENAI_API_KEY')
  }>(),

  // Input/Output mapping for workflows
  inputSchema: jsonb('input_schema').$type<{
    type: 'object';
    properties: Record<
      string,
      {
        type: string;
        description?: string;
        required?: boolean;
        default?: any;
      }
    >;
    required?: string[];
  }>(),

  outputSchema: jsonb('output_schema').$type<{
    type: string;
    description?: string;
    properties?: Record<string, any>;
  }>(),

  // Access control
  visibility: text('visibility').default('private').notNull(), // 'public' | 'private' | 'platform'
  owner: text('owner'), // User/agent wallet address who created the tool
  ownerType: text('owner_type'), // 'user' | 'agent' | 'platform'

  // Metadata
  category: text('category'), // 'communication', 'data', 'ai', 'blockchain', etc.
  tags: jsonb('tags').$type<string[]>(),
  icon: text('icon'),
  version: text('version').default('1.0.0'),
  isDeprecated: pgBoolean('is_deprecated').default(false),

  // Usage tracking
  executionCount: integer('execution_count').default(0),
  lastExecutedAt: timestamp('last_executed_at', { withTimezone: true }),

  // Rate limiting
  rateLimitPerMinute: integer('rate_limit_per_minute'),
  rateLimitPerHour: integer('rate_limit_per_hour'),

  // Legacy fields (for backwards compatibility)
  rating: jsonb('ratings'),

  createdAt: timestamp('created_at', { withTimezone: true })
    .default(sql`timezone('utc', now())`)
    .notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .default(sql`timezone('utc', now())`)
    .notNull(),
});

/* ─────────────────────────  RESOURCE  ───────────────────────── */

export const resource = pgTable('resource', {
  resourceId: text('resource_id')
    .default(sql`uuid_generate_v4()`)
    .primaryKey(),

  resourceType: text('resource_type').notNull(),

  schema: jsonb('schema').notNull().$type<any>(),
  tags: jsonb().notNull().$type<string[]>(),
  resourceFile: text('resource_file').notNull(),

  createdAt: timestamp('created_at', { withTimezone: true })
    .default(sql`timezone('utc', now())`)
    .notNull(),
});

/* ─────────────────────────  AGENT LOG  ───────────────────────── */

export const agentLog = pgTable('agent_log', {
  logId: uuid('log_id')
    .default(sql`uuid_generate_v4()`)
    .primaryKey(),

  agentId: text('agent_id')
    .notNull()
    .references(() => agent.agentId, { onDelete: 'cascade' }),

  sessionId: uuid('session_id').references(() => session.sessionId, {
    onDelete: 'cascade',
  }),

  action: text('action'),
  message: text('message'),
  status: text('status'),
  responseTime: integer('response_time'),
  tools: jsonb('tools').$type<
    Array<{
      name: string;
      status: string;
      summary?: string;
      duration?: number;
    }>
  >(),

  createdAt: timestamp('created_at', { withTimezone: true })
    .default(sql`timezone('utc', now())`)
    .notNull(),
});

/* ─────────────────────────  AGENT PREFERRED CONNECTION  ───────────────────────── */

export const agentPreferredConnection = pgTable('agent_preferred_connection', {
  id: uuid('id')
    .default(sql`uuid_generate_v4()`)
    .primaryKey(),

  agentId: text('agent_id')
    .notNull()
    .references(() => agent.agentId, { onDelete: 'cascade' }),

  preferredAgentId: text('preferred_agent_id')
    .notNull()
    .references(() => agent.agentId, { onDelete: 'cascade' }),

  usageComments: text('usage_comments'),

  createdAt: timestamp('created_at', { withTimezone: true })
    .default(sql`timezone('utc', now())`)
    .notNull(),
});

/* ─────────────────────────  AGENT TOOL (mapping)  ───────────────────────── */

export const agentTool = pgTable('agent_tool', {
  id: uuid('id')
    .default(sql`uuid_generate_v4()`)
    .primaryKey(),

  agentId: text('agent_id')
    .notNull()
    .references(() => agent.agentId, { onDelete: 'cascade' }),

  toolId: uuid('tool_id')
    .notNull()
    .references(() => tool.toolId, { onDelete: 'cascade' }),

  // Configuration
  usageComments: text('usage_comments'),
  isEnabled: pgBoolean('is_enabled').default(true),

  // Custom configuration per agent
  config: jsonb('config').$type<{
    customParams?: Record<string, any>;
    overrideDefaults?: Record<string, any>;
  }>(),

  createdAt: timestamp('created_at', { withTimezone: true })
    .default(sql`timezone('utc', now())`)
    .notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .default(sql`timezone('utc', now())`)
    .notNull(),
});

/* ─────────────────────────  TOOL PERMISSION  ───────────────────────── */

export const toolPermission = pgTable('tool_permission', {
  id: uuid('id')
    .default(sql`uuid_generate_v4()`)
    .primaryKey(),

  toolId: uuid('tool_id')
    .notNull()
    .references(() => tool.toolId, { onDelete: 'cascade' }),

  // Who has permission
  subjectId: text('subject_id').notNull(), // userId or agentId
  subjectType: text('subject_type').notNull(), // 'user' | 'agent'

  // Permission level
  permission: text('permission').notNull(), // 'read' | 'execute' | 'admin'

  // Optional: Grant source (for tracking)
  grantedBy: text('granted_by'), // userId who granted this permission

  createdAt: timestamp('created_at', { withTimezone: true })
    .default(sql`timezone('utc', now())`)
    .notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }), // Optional expiration
});

/* ─────────────────────────  TOOL KEY  ───────────────────────── */

export const toolKey = pgTable('tool_key', {
  keyId: uuid('key_id')
    .default(sql`uuid_generate_v4()`)
    .primaryKey(),

  // Key identification
  keyName: text('key_name').notNull(), // e.g., 'OPENAI_API_KEY', 'STRIPE_SECRET_KEY'
  displayName: text('display_name'), // User-friendly name
  description: text('description'),

  // Encrypted value (AES-256-GCM)
  encryptedValue: text('encrypted_value').notNull(),
  encryptionIV: text('encryption_iv').notNull(), // Initialization vector
  encryptionTag: text('encryption_tag').notNull(), // Authentication tag

  // Ownership (keys can be user-level or agent-level)
  ownerId: text('owner_id').notNull(), // userId or agentId
  ownerType: text('owner_type').notNull(), // 'user' | 'agent'

  // Optional tool association (if key is specific to a tool)
  toolId: uuid('tool_id').references(() => tool.toolId, {
    onDelete: 'cascade',
  }),

  // Metadata
  keyType: text('key_type'), // 'api-key' | 'bearer-token' | 'oauth-token' | 'secret'
  isActive: pgBoolean('is_active').default(true).notNull(),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  usageCount: integer('usage_count').default(0),

  // Masking for display (shows last 4 chars)
  maskedValue: text('masked_value'), // e.g., '****abc123'

  createdAt: timestamp('created_at', { withTimezone: true })
    .default(sql`timezone('utc', now())`)
    .notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .default(sql`timezone('utc', now())`)
    .notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }), // For tokens that expire
});

/* ─────────────────────────  TOOL KEY MAPPING  ───────────────────────── */

export const toolKeyMapping = pgTable('tool_key_mapping', {
  id: uuid('id')
    .default(sql`uuid_generate_v4()`)
    .primaryKey(),

  toolId: uuid('tool_id')
    .notNull()
    .references(() => tool.toolId, { onDelete: 'cascade' }),

  keyId: uuid('key_id')
    .notNull()
    .references(() => toolKey.keyId, { onDelete: 'cascade' }),

  // Context where this mapping applies
  contextId: text('context_id'), // userId or agentId
  contextType: text('context_type'), // 'user' | 'agent' | 'global'

  // Priority when multiple keys exist
  priority: integer('priority').default(0),

  createdAt: timestamp('created_at', { withTimezone: true })
    .default(sql`timezone('utc', now())`)
    .notNull(),
});

/* ─────────────────────────  TOOL EXECUTION LOG  ───────────────────────── */

export const toolExecutionLog = pgTable('tool_execution_log', {
  logId: uuid('log_id')
    .default(sql`uuid_generate_v4()`)
    .primaryKey(),

  toolId: uuid('tool_id')
    .notNull()
    .references(() => tool.toolId, { onDelete: 'cascade' }),

  // Execution context
  agentId: text('agent_id').references(() => agent.agentId, {
    onDelete: 'cascade',
  }),
  sessionId: uuid('session_id').references(() => session.sessionId, {
    onDelete: 'cascade',
  }),
  userId: text('user_id'), // If executed by/for a user

  // Execution details
  status: text('status').notNull(), // 'success' | 'error' | 'timeout' | 'unauthorized'
  startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  duration: integer('duration'), // milliseconds

  // Input/Output (sanitized - no sensitive data)
  inputArgs: jsonb('input_args').$type<Record<string, any>>(),
  outputData: jsonb('output_data').$type<any>(),
  errorMessage: text('error_message'),
  errorStack: text('error_stack'),

  // Key usage tracking (without exposing key value)
  keyId: uuid('key_id').references(() => toolKey.keyId, {
    onDelete: 'set null',
  }),

  // Rate limiting tracking
  rateLimitHit: pgBoolean('rate_limit_hit').default(false),

  createdAt: timestamp('created_at', { withTimezone: true })
    .default(sql`timezone('utc', now())`)
    .notNull(),
});

/* ─────────────────────────  WORKFLOW  ───────────────────────── */

export const workflow = pgTable('workflow', {
  workflowId: uuid('workflow_id')
    .default(sql`uuid_generate_v4()`)
    .primaryKey(),

  name: text('name').notNull(),
  description: text('description'),

  // Ownership
  ownerId: text('owner_id').notNull(), // userId or agentId
  ownerType: text('owner_type').notNull(), // 'user' | 'agent'

  // Workflow definition (graph structure)
  definition: jsonb('definition').notNull().$type<{
    startNodeId: string; // Explicit start node
    endNodeId: string; // Explicit end node
    nodes: Array<{
      id: string;
      type: 'tool' | 'agent_processor' | 'input' | 'output'; // Node types
      toolId?: string; // For tool nodes
      toolName?: string; // Tool name (for reference)
      position: { x: number; y: number };
      config?: Record<string, any>;
      label?: string; // Display label
    }>;
    edges: Array<{
      id: string;
      source: string;
      target: string;
      sourceHandle?: string; // Output field name
      targetHandle?: string; // Input field name
      mapping?: Record<string, string>; // source field -> target field
      label?: string; // Display label for edge
    }>;
  }>(),

  // Input/Output schemas for the entire workflow
  inputSchema: jsonb('input_schema').$type<{
    type: 'object';
    properties: Record<
      string,
      {
        type: string;
        description?: string;
        required?: boolean;
        default?: any;
      }
    >;
    required?: string[];
  }>(),

  outputSchema: jsonb('output_schema').$type<{
    type: string;
    description?: string;
    properties?: Record<string, any>;
  }>(),

  // Actual output captured from first successful run (for validation)
  actualOutputSchema: jsonb('actual_output_schema').$type<any>(),
  schemaLocked: pgBoolean('schema_locked').default(false), // Lock schema after validation

  // Metadata
  version: text('version').default('1.0.0'),
  isTemplate: pgBoolean('is_template').default(false),
  isPublic: pgBoolean('is_public').default(false), // Public workflows can be discovered/remixed
  category: text('category'), // e.g., 'research', 'content', 'automation'
  tags: jsonb('tags').$type<string[]>(),

  // Trigger configuration
  triggerType: text('trigger_type').default('manual'), // 'manual' | 'scheduled' | 'webhook'
  triggerConfig: jsonb('trigger_config').$type<{
    cronExpression?: string; // For scheduled triggers
    webhookUrl?: string; // For webhook triggers
    eventType?: string; // For event-based triggers
  }>(),

  // Execution configuration
  timeoutMs: integer('timeout_ms').default(300000), // 5 minutes default timeout

  // Usage tracking
  executionCount: integer('execution_count').default(0),
  successCount: integer('success_count').default(0),
  failureCount: integer('failure_count').default(0),
  lastExecutedAt: timestamp('last_executed_at', { withTimezone: true }),

  createdAt: timestamp('created_at', { withTimezone: true })
    .default(sql`timezone('utc', now())`)
    .notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .default(sql`timezone('utc', now())`)
    .notNull(),
});

/* ─────────────────────────  WORKFLOW EXECUTION  ───────────────────────── */

export const workflowExecution = pgTable('workflow_execution', {
  executionId: uuid('execution_id')
    .default(sql`uuid_generate_v4()`)
    .primaryKey(),

  workflowId: uuid('workflow_id')
    .notNull()
    .references(() => workflow.workflowId, { onDelete: 'cascade' }),

  // Execution context
  agentId: text('agent_id').references(() => agent.agentId, {
    onDelete: 'cascade',
  }),
  sessionId: uuid('session_id').references(() => session.sessionId, {
    onDelete: 'cascade',
  }),
  taskId: uuid('task_id').references(() => task.taskId, {
    onDelete: 'cascade',
  }),

  // Status
  status: text('status').notNull(), // 'pending' | 'running' | 'completed' | 'failed' | 'cancelled' | 'awaiting_approval'
  currentNode: text('current_node'), // ID of node currently executing

  // Timing
  startedAt: timestamp('started_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),

  // Input/Output
  inputData: jsonb('input_data').$type<Record<string, any>>(),
  outputData: jsonb('output_data').$type<any>(),

  // Node execution results
  nodeResults: jsonb('node_results').$type<
    Record<
      string,
      {
        status: 'success' | 'error' | 'skipped';
        output?: any;
        error?: string;
        duration?: number;
      }
    >
  >(),

  // Error tracking
  errorMessage: text('error_message'),

  // Human-in-the-loop (HITL) pause/resume
  approvalToken: text('approval_token'),      // unique token for approve/reject endpoints
  approvalData: jsonb('approval_data').$type<Record<string, any>>(), // data returned by approver
  pausedNodeOutputs: jsonb('paused_node_outputs').$type<Record<string, any>>(), // node outputs at time of pause
  pausedAtNode: text('paused_at_node'),        // node ID that triggered the pause

  createdAt: timestamp('created_at', { withTimezone: true })
    .default(sql`timezone('utc', now())`)
    .notNull(),
});

/* ─────────────────────────  A2A TASK  ───────────────────────── */

/**
 * Inbound A2A (Agent-to-Agent) tasks.
 * One row per task sent by an external agent or A2A-compatible client.
 * Follows the Google A2A task state machine:
 *   submitted → working → (input-required →)* completed | failed | canceled
 */
export const a2aTask = pgTable('a2a_task', {
  taskId: text('task_id')
    .default(sql`uuid_generate_v4()::text`)
    .primaryKey(),

  agentId: text('agent_id')
    .notNull()
    .references(() => agent.agentId, { onDelete: 'cascade' }),

  sessionId: uuid('session_id').references(() => session.sessionId, {
    onDelete: 'set null',
  }),

  // State machine: 'submitted' | 'working' | 'input-required' | 'completed' | 'failed' | 'canceled'
  state: text('state').notNull().default('submitted'),

  // Caller identity
  callerId: text('caller_id'),
  callerUrl: text('caller_url'),

  // A2A session context (groups related tasks, set by caller)
  contextId: text('context_id'),

  // Message content (A2A Message JSON: { role, parts: MessagePart[] })
  inputMessage: jsonb('input_message').$type<{
    role: 'user' | 'agent';
    parts: Array<{ type: string; text?: string; data?: any; mimeType?: string }>;
    contextId?: string;
    taskId?: string;
  }>().notNull(),

  // Output messages produced by the agent
  outputMessages: jsonb('output_messages').$type<Array<{
    role: 'agent';
    parts: Array<{ type: string; text?: string; data?: any; mimeType?: string }>;
  }>>(),

  // Artefacts (files/data produced)
  artifacts: jsonb('artifacts').$type<Array<{
    artifactId?: string;
    name?: string;
    description?: string;
    parts: Array<{ type: string; text?: string; data?: any; mimeType?: string }>;
  }>>(),

  // Push notification config (webhook)
  pushUrl: text('push_url'),
  pushToken: text('push_token'),

  // Error details if state = 'failed'
  error: jsonb('error').$type<{ code: number; message: string; data?: any }>(),

  createdAt: timestamp('created_at', { withTimezone: true })
    .default(sql`timezone('utc', now())`)
    .notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .default(sql`timezone('utc', now())`)
    .notNull(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
});

/* ─────────────────────────  SPACE  ───────────────────────── */

export const space = pgTable('space', {
  spaceId: uuid('space_id')
    .default(sql`uuid_generate_v4()`)
    .primaryKey(),

  name: text('name').notNull(),
  description: text('description'),
  image: text('image'),

  createdBy: text('created_by').notNull(), // agentId or userId
  createdByType: text('created_by_type').notNull(), // 'agent' or 'human'

  // Optional connection to a session
  sessionId: uuid('session_id').references(() => session.sessionId, {
    onDelete: 'set null',
  }),

  isPublic: pgBoolean('is_public').default(false).notNull(),
  maxMembers: integer('max_members').default(50),

  settings: jsonb('settings').$type<{
    allowAgents?: boolean;
    allowHumans?: boolean;
    requireApproval?: boolean;
    moderators?: string[];
  }>(),

  createdAt: timestamp('created_at', { withTimezone: true })
    .default(sql`timezone('utc', now())`)
    .notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .default(sql`timezone('utc', now())`)
    .notNull(),
});

/* ─────────────────────────  SPACE MEMBER  ───────────────────────── */

export const spaceMember = pgTable('space_member', {
  id: uuid('id')
    .default(sql`uuid_generate_v4()`)
    .primaryKey(),

  spaceId: uuid('space_id')
    .notNull()
    .references(() => space.spaceId, { onDelete: 'cascade' }),

  memberId: text('member_id').notNull(), // agentId or userId
  memberType: text('member_type').notNull(), // 'agent' or 'human'
  role: text('role').default('member'),

  status: text('status').default('active'),
  permissions: jsonb('permissions').$type<{
    canWrite?: boolean;
    canInvite?: boolean;
    canModerate?: boolean;
  }>(),

  joinedAt: timestamp('joined_at', { withTimezone: true })
    .default(sql`timezone('utc', now())`)
    .notNull(),
  lastActiveAt: timestamp('last_active_at', { withTimezone: true }),
  isSubscribed: pgBoolean('is_subscribed').default(false).notNull(),
});

/* ─────────────────────────  SPACE MESSAGE  ───────────────────────── */

export const spaceMessage = pgTable('space_message', {
  messageId: uuid('message_id')
    .default(sql`uuid_generate_v4()`)
    .primaryKey(),

  spaceId: uuid('space_id')
    .notNull()
    .references(() => space.spaceId, { onDelete: 'cascade' }),

  senderId: text('sender_id').notNull(), // agentId or userId
  senderType: text('sender_type').notNull(), // 'agent' or 'human'

  targetType: text('target_type').default('broadcast'), // 'broadcast', 'direct', 'group'
  targetIds: jsonb('target_ids').$type<string[]>(),

  content: text('content').notNull(),
  messageType: text('message_type').default('text'), // 'text', 'image', 'file', 'system'

  metadata: jsonb('metadata').$type<{
    toolCalls?: Array<{
      name: string;
      args: any;
      result?: any;
    }>;
    attachments?: Array<{
      type: string;
      url: string;
      name: string;
    }>;
    replyTo?: string; // messageId
    mentions?: string[]; // member IDs

    // used by your SpaceService to embed agent/session context
    agentId?: string;
    sessionId?: string;
    privateKey?: string;
  }>(),

  isEdited: pgBoolean('is_edited').default(false),
  isDeleted: pgBoolean('is_deleted').default(false),

  createdAt: timestamp('created_at', { withTimezone: true })
    .default(sql`timezone('utc', now())`)
    .notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .default(sql`timezone('utc', now())`)
    .notNull(),
});

/* ─────────────────────────  AGENT MEMORY  ───────────────────────── */

export const agentMemory = pgTable('agent_memory', {
  memoryId: uuid('memory_id')
    .default(sql`uuid_generate_v4()`)
    .primaryKey(),

  agentId: text('agent_id')
    .notNull()
    .references(() => agent.agentId, { onDelete: 'cascade' }),

  sessionId: uuid('session_id').references(() => session.sessionId, {
    onDelete: 'set null',
  }),

  /**
   * 'episodic'   — specific events that happened in a session
   * 'semantic'   — general facts about the user / domain
   * 'procedural' — learned behaviours / preferences / rules
   */
  memoryType: text('memory_type').notNull().default('semantic'),

  /** Full memory text */
  content: text('content').notNull(),

  /** One-line summary for the system-prompt injection */
  summary: text('summary').notNull(),

  /** 0.0 (trivial) → 1.0 (critical) — set by consolidation LLM */
  importanceScore: real('importance_score').notNull().default(0.5),

  /** How many times this memory has been retrieved */
  accessCount: integer('access_count').notNull().default(0),

  lastAccessedAt: timestamp('last_accessed_at', { withTimezone: true }),

  /** Keyword tags for fast retrieval */
  tags: jsonb('tags').notNull().default(sql`'[]'::jsonb`).$type<string[]>(),

  /**
   * 'auto'   — extracted by consolidation LLM after session
   * 'manual' — user explicitly added via API
   */
  sourceType: text('source_type').notNull().default('auto'),

  isActive: pgBoolean('is_active').notNull().default(true),

  /** Optional TTL — null = never expires */
  expiresAt: timestamp('expires_at', { withTimezone: true }),

  createdAt: timestamp('created_at', { withTimezone: true })
    .default(sql`timezone('utc', now())`)
    .notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .default(sql`timezone('utc', now())`)
    .notNull(),
});

/* ─────────────────────────  USAGE EVENT  ───────────────────────── */

export const usageEvent = pgTable('usage_event', {
  eventId: uuid('event_id')
    .default(sql`uuid_generate_v4()`)
    .primaryKey(),

  agentId: text('agent_id')
    .notNull()
    .references(() => agent.agentId, { onDelete: 'cascade' }),

  sessionId: uuid('session_id').references(() => session.sessionId, {
    onDelete: 'set null',
  }),

  taskId: uuid('task_id').references(() => task.taskId, {
    onDelete: 'set null',
  }),

  workflowExecutionId: uuid('workflow_execution_id').references(
    () => workflowExecution.executionId,
    { onDelete: 'set null' },
  ),

  // Model info
  provider: text('provider').notNull(),   // 'openai' | 'anthropic' | 'google' | ...
  modelId: text('model_id').notNull(),    // e.g. 'gpt-4o', 'claude-sonnet-4-6'

  // Token usage
  inputTokens: integer('input_tokens').notNull().default(0),
  outputTokens: integer('output_tokens').notNull().default(0),
  cachedTokens: integer('cached_tokens').notNull().default(0),
  totalTokens: integer('total_tokens').notNull().default(0),

  // Cost (USD)
  costUsd: real('cost_usd').notNull().default(0),

  // Whether the user supplied their own API key (BYOK)
  isByok: pgBoolean('is_byok').notNull().default(false),

  // Run duration in milliseconds
  durationMs: integer('duration_ms'),

  // Trace correlation — one UUID per top-level runAgent() invocation;
  // links all LLM calls (including tool sub-calls) in a single agent run.
  traceId: uuid('trace_id'),

  createdAt: timestamp('created_at', { withTimezone: true })
    .default(sql`timezone('utc', now())`)
    .notNull(),
});

/* ─────────────────────────  RELATIONS  ───────────────────────── */

// session
export const sessionRelations = relations(session, ({ one, many }) => ({
  tasks: many(task),
  logs: many(agentLog),
  workflowExecutions: many(workflowExecution),

  // parent-child (self reference)
  parent: one(session, {
    fields: [session.parentSessionId],
    references: [session.sessionId],
  }),
}));

// task
export const taskRelations = relations(task, ({ one }) => ({
  session: one(session, {
    fields: [task.sessionId],
    references: [session.sessionId],
  }),
  agent: one(agent, {
    fields: [task.agentId],
    references: [agent.agentId],
  }),
  workflow: one(workflow, {
    fields: [task.workflowId],
    references: [workflow.workflowId],
  }),
}));

// agentLog
export const agentLogRelations = relations(agentLog, ({ one }) => ({
  session: one(session, {
    fields: [agentLog.sessionId],
    references: [session.sessionId],
  }),
  agent: one(agent, {
    fields: [agentLog.agentId],
    references: [agent.agentId],
  }),
}));

// space
export const spaceRelations = relations(space, ({ one, many }) => ({
  session: one(session, {
    fields: [space.sessionId],
    references: [session.sessionId],
  }),
  members: many(spaceMember),
  messages: many(spaceMessage),
}));

// spaceMember
export const spaceMemberRelations = relations(spaceMember, ({ one }) => ({
  space: one(space, {
    fields: [spaceMember.spaceId],
    references: [space.spaceId],
  }),
}));

// spaceMessage
export const spaceMessageRelations = relations(spaceMessage, ({ one }) => ({
  space: one(space, {
    fields: [spaceMessage.spaceId],
    references: [space.spaceId],
  }),
}));

// tool mappings
export const agentToolRelations = relations(agentTool, ({ one }) => ({
  agent: one(agent, {
    fields: [agentTool.agentId],
    references: [agent.agentId],
  }),
  tool: one(tool, {
    fields: [agentTool.toolId],
    references: [tool.toolId],
  }),
}));

export const agentPreferredConnectionRelations = relations(
  agentPreferredConnection,
  ({ one }) => ({
    agent: one(agent, {
      fields: [agentPreferredConnection.agentId],
      references: [agent.agentId],
    }),
    preferredAgent: one(agent, {
      fields: [agentPreferredConnection.preferredAgentId],
      references: [agent.agentId],
    }),
  }),
);

// tool
export const toolRelations = relations(tool, ({ many }) => ({
  permissions: many(toolPermission),
  keys: many(toolKey),
  keyMappings: many(toolKeyMapping),
  executionLogs: many(toolExecutionLog),
  agentTools: many(agentTool),
}));

// toolPermission
export const toolPermissionRelations = relations(toolPermission, ({ one }) => ({
  tool: one(tool, {
    fields: [toolPermission.toolId],
    references: [tool.toolId],
  }),
}));

// toolKey
export const toolKeyRelations = relations(toolKey, ({ one, many }) => ({
  tool: one(tool, {
    fields: [toolKey.toolId],
    references: [tool.toolId],
  }),
  keyMappings: many(toolKeyMapping),
  executionLogs: many(toolExecutionLog),
}));

// toolKeyMapping
export const toolKeyMappingRelations = relations(toolKeyMapping, ({ one }) => ({
  tool: one(tool, {
    fields: [toolKeyMapping.toolId],
    references: [tool.toolId],
  }),
  key: one(toolKey, {
    fields: [toolKeyMapping.keyId],
    references: [toolKey.keyId],
  }),
}));

// toolExecutionLog
export const toolExecutionLogRelations = relations(
  toolExecutionLog,
  ({ one }) => ({
    tool: one(tool, {
      fields: [toolExecutionLog.toolId],
      references: [tool.toolId],
    }),
    agent: one(agent, {
      fields: [toolExecutionLog.agentId],
      references: [agent.agentId],
    }),
    session: one(session, {
      fields: [toolExecutionLog.sessionId],
      references: [session.sessionId],
    }),
    key: one(toolKey, {
      fields: [toolExecutionLog.keyId],
      references: [toolKey.keyId],
    }),
  }),
);

// workflow
export const workflowRelations = relations(workflow, ({ many }) => ({
  executions: many(workflowExecution),
}));

// workflowExecution
export const workflowExecutionRelations = relations(
  workflowExecution,
  ({ one }) => ({
    workflow: one(workflow, {
      fields: [workflowExecution.workflowId],
      references: [workflow.workflowId],
    }),
    agent: one(agent, {
      fields: [workflowExecution.agentId],
      references: [agent.agentId],
    }),
    session: one(session, {
      fields: [workflowExecution.sessionId],
      references: [session.sessionId],
    }),
    task: one(task, {
      fields: [workflowExecution.taskId],
      references: [task.taskId],
    }),
  }),
);

export const scheduledTaskRunRelations = relations(scheduledTaskRun, ({ one }) => ({
  task: one(task, {
    fields: [scheduledTaskRun.taskId],
    references: [task.taskId],
  }),
}));

export const a2aTaskRelations = relations(a2aTask, ({ one }) => ({
  agent: one(agent, {
    fields: [a2aTask.agentId],
    references: [agent.agentId],
  }),
  session: one(session, {
    fields: [a2aTask.sessionId],
    references: [session.sessionId],
  }),
}));

export const agentMemoryRelations = relations(agentMemory, ({ one }) => ({
  agent: one(agent, {
    fields: [agentMemory.agentId],
    references: [agent.agentId],
  }),
  session: one(session, {
    fields: [agentMemory.sessionId],
    references: [session.sessionId],
  }),
}));

export const usageEventRelations = relations(usageEvent, ({ one }) => ({
  agent: one(agent, {
    fields: [usageEvent.agentId],
    references: [agent.agentId],
  }),
  session: one(session, {
    fields: [usageEvent.sessionId],
    references: [session.sessionId],
  }),
  task: one(task, {
    fields: [usageEvent.taskId],
    references: [task.taskId],
  }),
  workflowExecution: one(workflowExecution, {
    fields: [usageEvent.workflowExecutionId],
    references: [workflowExecution.executionId],
  }),
}));

/* ─────────────────────────  OAUTH PROVIDER  ───────────────────────── */

/**
 * OAuth Provider Configuration
 * Stores OAuth 2.0 provider settings (Google, GitHub, Slack, etc.)
 */
export const oauthProvider = pgTable(
  'oauth_provider',
  {
    providerId: uuid('provider_id')
      .default(sql`uuid_generate_v4()`)
      .primaryKey(),

    // Identity
    providerKey: text('provider_key').notNull().unique(),
    displayName: text('display_name').notNull(),
    description: text('description'),
    logoUrl: text('logo_url'),

    // OAuth Configuration URLs
    authUrl: text('auth_url').notNull(),
    tokenUrl: text('token_url').notNull(),
    revokeUrl: text('revoke_url'),
    userInfoUrl: text('user_info_url'),

    // Encrypted Client Credentials
    clientId: text('client_id').notNull(),
    encryptedClientSecret: text('encrypted_client_secret').notNull(),
    secretIv: text('secret_iv').notNull(),
    secretTag: text('secret_tag').notNull(),

    // Configuration
    scopes: jsonb('scopes')
      .notNull()
      .default(sql`'{}'`),
    authorizationParams: jsonb('authorization_params').default(sql`'{}'`),
    tokenParams: jsonb('token_params').default(sql`'{}'`),

    // Metadata
    isActive: pgBoolean('is_active').default(true),
    isPlatform: pgBoolean('is_platform').default(true),
    ownerId: text('owner_id'),
    ownerType: text('owner_type'),

    // Timestamps
    createdAt: timestamp('created_at', { withTimezone: true })
      .default(sql`timezone('utc', now())`)
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .default(sql`timezone('utc', now())`)
      .notNull(),
  },
);

/* ─────────────────────────  OAUTH CONNECTION  ───────────────────────── */

/**
 * OAuth Connection
 * Stores user OAuth connections with encrypted tokens
 */
export const oauthConnection = pgTable(
  'oauth_connection',
  {
    connectionId: uuid('connection_id')
      .default(sql`uuid_generate_v4()`)
      .primaryKey(),

    // Ownership
    ownerId: text('owner_id').notNull(),
    ownerType: text('owner_type').notNull(),

    // Provider Reference
    providerId: uuid('provider_id')
      .notNull()
      .references(() => oauthProvider.providerId, { onDelete: 'cascade' }),

    // Encrypted Access Token
    encryptedAccessToken: text('encrypted_access_token').notNull(),
    accessTokenIv: text('access_token_iv').notNull(),
    accessTokenTag: text('access_token_tag').notNull(),
    accessTokenExpiresAt: timestamp('access_token_expires_at', {
      withTimezone: true,
    }),

    // Encrypted Refresh Token
    encryptedRefreshToken: text('encrypted_refresh_token').notNull(),
    refreshTokenIv: text('refresh_token_iv').notNull(),
    refreshTokenTag: text('refresh_token_tag').notNull(),

    // Optional ID Token
    encryptedIdToken: text('encrypted_id_token'),
    idTokenIv: text('id_token_iv'),
    idTokenTag: text('id_token_tag'),

    // Scopes
    scopes: text('scopes')
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),

    // Provider User Info
    providerUserId: text('provider_user_id'),
    providerUserEmail: text('provider_user_email'),
    providerUserName: text('provider_user_name'),
    providerMetadata: jsonb('provider_metadata').default(sql`'{}'`),

    // Status & Tracking
    status: text('status').default('active'),
    lastRefreshedAt: timestamp('last_refreshed_at', { withTimezone: true }),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    usageCount: integer('usage_count').default(0),
    lastError: text('last_error'),
    lastErrorAt: timestamp('last_error_at', { withTimezone: true }),

    // User Labels
    displayName: text('display_name'),
    description: text('description'),

    // Timestamps
    createdAt: timestamp('created_at', { withTimezone: true })
      .default(sql`timezone('utc', now())`)
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .default(sql`timezone('utc', now())`)
      .notNull(),
  },
);

/* ─────────────────────────  OAUTH STATE  ───────────────────────── */

/**
 * OAuth State
 * Temporary CSRF protection tokens (short-lived)
 */
export const oauthState = pgTable(
  'oauth_state',
  {
    stateId: text('state_id').primaryKey(),

    // Context
    ownerId: text('owner_id').notNull(),
    providerId: uuid('provider_id')
      .notNull()
      .references(() => oauthProvider.providerId, { onDelete: 'cascade' }),

    // PKCE
    codeVerifier: text('code_verifier'),

    // Redirect Context
    redirectUri: text('redirect_uri').notNull(),
    requestedScopes: text('requested_scopes')
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),

    // Security
    userAgent: text('user_agent'),
    ipAddress: text('ip_address'),

    // Expiry
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .default(sql`timezone('utc', now())`)
      .notNull(),
  },
);

/* ─────────────────────────  OAUTH RELATIONS  ───────────────────────── */

export const oauthProviderRelations = relations(oauthProvider, ({ many }) => ({
  connections: many(oauthConnection),
  states: many(oauthState),
}));

export const oauthConnectionRelations = relations(
  oauthConnection,
  ({ one }) => ({
    provider: one(oauthProvider, {
      fields: [oauthConnection.providerId],
      references: [oauthProvider.providerId],
    }),
  }),
);

export const oauthStateRelations = relations(oauthState, ({ one }) => ({
  provider: one(oauthProvider, {
    fields: [oauthState.providerId],
    references: [oauthProvider.providerId],
  }),
}));

/* ─────────────────────────  MCP SERVER  ───────────────────────── */

/**
 * MCP Server Configuration
 * Stores Model Context Protocol server connections for external tool integration
 */
export const mcpServer = pgTable('mcp_server', {
  serverId: uuid('server_id')
    .default(sql`uuid_generate_v4()`)
    .primaryKey(),

  // Identity
  name: text('name').notNull(),
  description: text('description'),

  // Ownership
  ownerId: text('owner_id').notNull(),
  ownerType: text('owner_type').notNull(), // 'user' | 'agent'

  // Connection configuration
  connectionType: text('connection_type').notNull(), // 'stdio' | 'sse'
  connectionConfig: jsonb('connection_config').notNull().$type<{
    command?: string; // For stdio: executable command
    args?: string[]; // For stdio: command arguments
    env?: Record<string, string>; // For stdio: environment variables
    url?: string; // For SSE: server URL
  }>(),

  // Connection status
  status: text('status').default('disconnected'), // 'connected' | 'disconnected' | 'error'
  lastError: text('last_error'),
  lastConnectedAt: timestamp('last_connected_at', { withTimezone: true }),

  // Discovery cache
  capabilities: jsonb('capabilities').$type<{
    tools?: boolean;
    resources?: boolean;
    prompts?: boolean;
  }>(),
  toolsDiscovered: jsonb('tools_discovered').$type<any[]>(),
  lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }),

  // Metadata
  isPublic: pgBoolean('is_public').default(false),
  tags: jsonb('tags').$type<string[]>(),

  createdAt: timestamp('created_at', { withTimezone: true })
    .default(sql`timezone('utc', now())`)
    .notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .default(sql`timezone('utc', now())`)
    .notNull(),
});

/* ─────────────────────────  MCP TOOL  ───────────────────────── */

/**
 * MCP Tool (denormalized for performance)
 * Cached tools discovered from MCP servers
 */
export const mcpTool = pgTable('mcp_tool', {
  mcpToolId: uuid('mcp_tool_id')
    .default(sql`uuid_generate_v4()`)
    .primaryKey(),

  // Server reference
  serverId: uuid('server_id')
    .notNull()
    .references(() => mcpServer.serverId, { onDelete: 'cascade' }),

  // Tool identity
  toolName: text('tool_name').notNull(),
  displayName: text('display_name'),
  description: text('description'),

  // Schema (MCP format, compatible with OpenAI ChatCompletionTool)
  inputSchema: jsonb('input_schema').notNull().$type<{
    type: 'object';
    properties?: Record<string, any>;
    required?: string[];
  }>(),

  // Metadata
  isActive: pgBoolean('is_active').default(true),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  usageCount: integer('usage_count').default(0),

  createdAt: timestamp('created_at', { withTimezone: true })
    .default(sql`timezone('utc', now())`)
    .notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .default(sql`timezone('utc', now())`)
    .notNull(),
});

/* ─────────────────────────  MCP RELATIONS  ───────────────────────── */

export const mcpServerRelations = relations(mcpServer, ({ many }) => ({
  tools: many(mcpTool),
}));

export const mcpToolRelations = relations(mcpTool, ({ one }) => ({
  server: one(mcpServer, {
    fields: [mcpTool.serverId],
    references: [mcpServer.serverId],
  }),
}));

/* ─────────────────────────  SKILL  ───────────────────────── */

/**
 * Skill — reusable, pluggable capability card (SKILL.md system).
 * Platform skills are seeded by migration; user/agent skills can be created via API.
 */
export const skill = pgTable('skill', {
  skillId: text('skill_id')
    .default(sql`uuid_generate_v4()::text`)
    .primaryKey(),

  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  description: text('description').notNull(),
  instructions: text('instructions').notNull(),

  tools: jsonb('tools').notNull().default(sql`'[]'::jsonb`).$type<string[]>(),
  triggers: jsonb('triggers').notNull().default(sql`'[]'::jsonb`).$type<string[]>(),

  ownerId: text('owner_id'),
  ownerType: text('owner_type').notNull().default('platform'), // 'platform' | 'user' | 'agent'

  isPublic: pgBoolean('is_public').notNull().default(true),
  isActive: pgBoolean('is_active').notNull().default(true),

  version: text('version').notNull().default('1.0.0'),
  tags: jsonb('tags').notNull().default(sql`'[]'::jsonb`).$type<string[]>(),
  icon: text('icon'),
  usageCount: integer('usage_count').notNull().default(0),

  source: text('source').notNull().default('platform'), // 'platform' | 'user' | 'import'
  sourceUrl: text('source_url'),

  createdAt: timestamp('created_at', { withTimezone: true })
    .default(sql`timezone('utc', now())`)
    .notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .default(sql`timezone('utc', now())`)
    .notNull(),
});

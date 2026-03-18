# Tool System Database Schema Redesign

## Overview
This document outlines the new database schema design for the enhanced tool system with:
- Granular access control (platform-wide, user-specific, agent-specific)
- Secure key management with encryption
- Workflow support with input/output mapping
- Comprehensive audit trails

---

## New/Modified Tables

### 1. Enhanced `tool` Table

```typescript
export const tool = pgTable('tool', {
  toolId: uuid('tool_id').default(sql`uuid_generate_v4()`).primaryKey(),
  name: text('name').notNull().unique(),
  displayName: text('display_name'),
  description: text('description'),

  // Tool specification
  schema: jsonb('schema').notNull().$type<ChatCompletionTool>(),

  // API specification for dynamic tools
  apiSpec: jsonb('api_spec').$type<{
    baseUrl: string;
    path: string;
    method: string;
    headers?: Record<string, string>;
    queryParams?: Record<string, string>;
    bodyTemplate?: any;
    authType?: 'none' | 'bearer' | 'api-key' | 'basic' | 'oauth2';
    authKeyName?: string; // Name of the key required (e.g., 'OPENAI_API_KEY')
  }>(),

  // Input/Output mapping for workflows
  inputSchema: jsonb('input_schema').$type<{
    type: 'object';
    properties: Record<string, {
      type: string;
      description?: string;
      required?: boolean;
      default?: any;
    }>;
    required?: string[];
  }>(),

  outputSchema: jsonb('output_schema').$type<{
    type: string;
    description?: string;
    properties?: Record<string, any>;
  }>(),

  // Access control
  visibility: text('visibility').default('private').notNull(), // 'public' | 'private' | 'platform'
  ownerId: text('owner_id'), // User/agent who created the tool
  ownerType: text('owner_type'), // 'user' | 'agent' | 'platform'

  // Metadata
  category: text('category'), // 'communication', 'data', 'ai', 'blockchain', etc.
  tags: jsonb('tags').$type<string[]>(),
  icon: text('icon'),
  version: text('version').default('1.0.0'),
  isDeprecated: boolean('is_deprecated').default(false),

  // Usage tracking
  executionCount: integer('execution_count').default(0),
  lastExecutedAt: timestamp('last_executed_at', { withTimezone: true }),

  // Rate limiting
  rateLimitPerMinute: integer('rate_limit_per_minute'),
  rateLimitPerHour: integer('rate_limit_per_hour'),

  createdAt: timestamp('created_at', { withTimezone: true }).default(sql`timezone('utc', now())`).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).default(sql`timezone('utc', now())`).notNull(),
});
```

### 2. New `tool_permission` Table

Manages granular access control for tools.

```typescript
export const toolPermission = pgTable('tool_permission', {
  id: uuid('id').default(sql`uuid_generate_v4()`).primaryKey(),

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

  createdAt: timestamp('created_at', { withTimezone: true }).default(sql`timezone('utc', now())`).notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }), // Optional expiration
});
```

### 3. New `tool_key` Table

Stores encrypted API keys and secrets required by tools.

```typescript
export const toolKey = pgTable('tool_key', {
  keyId: uuid('key_id').default(sql`uuid_generate_v4()`).primaryKey(),

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
  toolId: uuid('tool_id').references(() => tool.toolId, { onDelete: 'cascade' }),

  // Metadata
  keyType: text('key_type'), // 'api-key' | 'bearer-token' | 'oauth-token' | 'secret'
  isActive: boolean('is_active').default(true).notNull(),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  usageCount: integer('usage_count').default(0),

  // Masking for display (shows last 4 chars)
  maskedValue: text('masked_value'), // e.g., '****abc123'

  createdAt: timestamp('created_at', { withTimezone: true }).default(sql`timezone('utc', now())`).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).default(sql`timezone('utc', now())`).notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }), // For tokens that expire
});
```

### 4. New `tool_key_mapping` Table

Maps which keys to use for which tools, per user/agent.

```typescript
export const toolKeyMapping = pgTable('tool_key_mapping', {
  id: uuid('id').default(sql`uuid_generate_v4()`).primaryKey(),

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

  createdAt: timestamp('created_at', { withTimezone: true }).default(sql`timezone('utc', now())`).notNull(),
});
```

### 5. Enhanced `agent_tool` Table

Now references the new access control system.

```typescript
export const agentTool = pgTable('agent_tool', {
  id: uuid('id').default(sql`uuid_generate_v4()`).primaryKey(),

  agentId: text('agent_id')
    .notNull()
    .references(() => agent.agentId, { onDelete: 'cascade' }),

  toolId: uuid('tool_id')
    .notNull()
    .references(() => tool.toolId, { onDelete: 'cascade' }),

  // Configuration
  usageComments: text('usage_comments'),
  isEnabled: boolean('is_enabled').default(true),

  // Custom configuration per agent
  config: jsonb('config').$type<{
    customParams?: Record<string, any>;
    overrideDefaults?: Record<string, any>;
  }>(),

  createdAt: timestamp('created_at', { withTimezone: true }).default(sql`timezone('utc', now())`).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).default(sql`timezone('utc', now())`).notNull(),
});
```

### 6. New `tool_execution_log` Table

Comprehensive audit trail for tool executions.

```typescript
export const toolExecutionLog = pgTable('tool_execution_log', {
  logId: uuid('log_id').default(sql`uuid_generate_v4()`).primaryKey(),

  toolId: uuid('tool_id')
    .notNull()
    .references(() => tool.toolId, { onDelete: 'cascade' }),

  // Execution context
  agentId: text('agent_id').references(() => agent.agentId, { onDelete: 'cascade' }),
  sessionId: uuid('session_id').references(() => session.sessionId, { onDelete: 'cascade' }),
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
  keyId: uuid('key_id').references(() => toolKey.keyId, { onDelete: 'set null' }),

  // Rate limiting tracking
  rateLimitHit: boolean('rate_limit_hit').default(false),

  createdAt: timestamp('created_at', { withTimezone: true }).default(sql`timezone('utc', now())`).notNull(),
});
```

### 7. New `workflow` Table

For orchestrating multiple tools into workflows.

```typescript
export const workflow = pgTable('workflow', {
  workflowId: uuid('workflow_id').default(sql`uuid_generate_v4()`).primaryKey(),

  name: text('name').notNull(),
  description: text('description'),

  // Ownership
  ownerId: text('owner_id').notNull(), // userId or agentId
  ownerType: text('owner_type').notNull(), // 'user' | 'agent'

  // Workflow definition (graph structure)
  definition: jsonb('definition').notNull().$type<{
    nodes: Array<{
      id: string;
      toolId: string;
      position: { x: number; y: number };
      config?: Record<string, any>;
    }>;
    edges: Array<{
      id: string;
      source: string;
      target: string;
      sourceHandle?: string; // Output field name
      targetHandle?: string; // Input field name
      mapping?: Record<string, string>; // source field -> target field
    }>;
  }>(),

  // Metadata
  version: text('version').default('1.0.0'),
  isTemplate: boolean('is_template').default(false),
  visibility: text('visibility').default('private'), // 'public' | 'private'

  // Usage tracking
  executionCount: integer('execution_count').default(0),
  lastExecutedAt: timestamp('last_executed_at', { withTimezone: true }),

  createdAt: timestamp('created_at', { withTimezone: true }).default(sql`timezone('utc', now())`).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).default(sql`timezone('utc', now())`).notNull(),
});
```

### 8. New `workflow_execution` Table

Tracks workflow execution instances.

```typescript
export const workflowExecution = pgTable('workflow_execution', {
  executionId: uuid('execution_id').default(sql`uuid_generate_v4()`).primaryKey(),

  workflowId: uuid('workflow_id')
    .notNull()
    .references(() => workflow.workflowId, { onDelete: 'cascade' }),

  // Execution context
  agentId: text('agent_id').references(() => agent.agentId, { onDelete: 'cascade' }),
  sessionId: uuid('session_id').references(() => session.sessionId, { onDelete: 'cascade' }),
  taskId: uuid('task_id').references(() => task.taskId, { onDelete: 'cascade' }),

  // Status
  status: text('status').notNull(), // 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
  currentNode: text('current_node'), // ID of node currently executing

  // Timing
  startedAt: timestamp('started_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),

  // Input/Output
  inputData: jsonb('input_data').$type<Record<string, any>>(),
  outputData: jsonb('output_data').$type<any>(),

  // Node execution results
  nodeResults: jsonb('node_results').$type<Record<string, {
    status: 'success' | 'error' | 'skipped';
    output?: any;
    error?: string;
    duration?: number;
  }>>(),

  // Error tracking
  errorMessage: text('error_message'),

  createdAt: timestamp('created_at', { withTimezone: true }).default(sql`timezone('utc', now())`).notNull(),
});
```

---

## Access Control Logic

### Tool Visibility Levels:

1. **`platform`**: Built-in tools available to all users and agents (e.g., common-tools)
2. **`public`**: User-created tools available to all users (but may require own keys)
3. **`private`**: Only accessible to specific users/agents via `tool_permission`

### Permission Hierarchy:

1. **Platform tools**: Always accessible (staticDefs)
2. **Public tools**: Check if user/agent has keys configured
3. **Private tools**: Check `tool_permission` table for explicit access

### Key Resolution:

When executing a tool:
1. Check if tool requires authentication (`apiSpec.authType`)
2. If yes, resolve key in this order:
   - Agent-specific key (contextType='agent', contextId=agentId)
   - User-specific key (contextType='user', contextId=userId)
   - Global key (contextType='global')
3. Decrypt key at execution time (never store decrypted)
4. Inject into request headers/params as specified

---

## Encryption Strategy

### Key Encryption:
- Algorithm: AES-256-GCM
- Master encryption key: Stored in environment variable `TOOL_KEY_ENCRYPTION_MASTER`
- Per-key IV (Initialization Vector): Random, stored with each key
- Authentication tag: Ensures integrity

### Encryption Flow:
```
Plaintext API Key
  ↓
Generate random IV (16 bytes)
  ↓
Encrypt with AES-256-GCM (master key + IV)
  ↓
Store: encryptedValue, IV, authTag
```

### Decryption Flow (at runtime only):
```
Fetch: encryptedValue, IV, authTag
  ↓
Decrypt with AES-256-GCM (master key + IV + tag)
  ↓
Use in HTTP request (in-memory only)
  ↓
Clear from memory immediately
```

---

## Migration Strategy

1. **Phase 1**: Create new tables
   - `tool_permission`
   - `tool_key`
   - `tool_key_mapping`
   - `tool_execution_log`
   - `workflow`
   - `workflow_execution`

2. **Phase 2**: Enhance existing tables
   - Add new columns to `tool` table
   - Update `agent_tool` table

3. **Phase 3**: Migrate data
   - Set existing tools to `visibility='platform'` for static tools
   - Set existing tools to `visibility='private'` for user-created tools

4. **Phase 4**: Update code
   - Implement encryption service
   - Implement access control checks
   - Implement workflow engine

---

## Indexes for Performance

```sql
-- Tool lookups
CREATE INDEX idx_tool_name ON tool(name);
CREATE INDEX idx_tool_visibility ON tool(visibility);
CREATE INDEX idx_tool_owner ON tool(owner_id, owner_type);

-- Permission checks
CREATE INDEX idx_tool_permission_subject ON tool_permission(subject_id, subject_type);
CREATE INDEX idx_tool_permission_tool ON tool_permission(tool_id);

-- Key lookups
CREATE INDEX idx_tool_key_owner ON tool_key(owner_id, owner_type);
CREATE INDEX idx_tool_key_mapping_context ON tool_key_mapping(context_id, context_type);

-- Execution logs
CREATE INDEX idx_tool_execution_log_tool ON tool_execution_log(tool_id, created_at DESC);
CREATE INDEX idx_tool_execution_log_agent ON tool_execution_log(agent_id, created_at DESC);
CREATE INDEX idx_tool_execution_log_session ON tool_execution_log(session_id);

-- Workflows
CREATE INDEX idx_workflow_owner ON workflow(owner_id, owner_type);
CREATE INDEX idx_workflow_execution_workflow ON workflow_execution(workflow_id, created_at DESC);
```

---

## API Design

### Tool Management:
- `POST /v1/tools` - Create tool
- `GET /v1/tools` - List accessible tools
- `GET /v1/tools/:toolId` - Get tool details
- `PUT /v1/tools/:toolId` - Update tool
- `DELETE /v1/tools/:toolId` - Delete tool

### Key Management:
- `POST /v1/keys` - Add key
- `GET /v1/keys` - List keys (masked)
- `PUT /v1/keys/:keyId` - Update key
- `DELETE /v1/keys/:keyId` - Delete key
- `POST /v1/keys/:keyId/test` - Test key validity

### Permission Management:
- `POST /v1/tools/:toolId/permissions` - Grant permission
- `DELETE /v1/tools/:toolId/permissions/:permissionId` - Revoke permission
- `GET /v1/tools/:toolId/permissions` - List permissions

### Workflow Management:
- `POST /v1/workflows` - Create workflow
- `GET /v1/workflows` - List workflows
- `POST /v1/workflows/:workflowId/execute` - Execute workflow
- `GET /v1/workflows/executions/:executionId` - Get execution status

---

## Next Steps

1. Implement database schema changes
2. Create encryption/decryption service
3. Implement access control middleware
4. Refactor tool loading in `runAgent`
5. Create new API endpoints
6. Build workflow execution engine
7. Add audit logging
8. Create UI for key management

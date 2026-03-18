# Tools, Tasks & Workflows System - Implementation Guide

## Overview

This document provides a comprehensive guide to the newly redesigned tools system in Agent Commons. The system now supports:

- **Granular Access Control**: Tools can be public, private, or platform-wide with fine-grained permissions
- **Secure Key Management**: Encrypted storage of API keys with user/agent-level granularity
- **Workflow Support**: Connect tools into workflows with input/output mapping
- **Comprehensive Audit Trail**: Track all tool executions with detailed logging

## Architecture

### Core Components

#### 1. Database Schema ([models/schema.ts](models/schema.ts))

**New Tables:**
- `tool` (enhanced): Tool definitions with visibility, ownership, and I/O schemas
- `tool_permission`: Granular access control for tools
- `tool_key`: Encrypted API key storage (AES-256-GCM)
- `tool_key_mapping`: Maps keys to tools for specific contexts (user/agent/global)
- `tool_execution_log`: Comprehensive audit trail
- `workflow`: Workflow definitions (graph structure)
- `workflow_execution`: Workflow execution instances

**Key Changes:**
- `tool` table now has `visibility`, `ownerId`, `ownerType`, `apiSpec`, `inputSchema`, `outputSchema`
- `agent_tool` table enhanced with `isEnabled` and `config` fields
- All new tables have proper foreign key relationships and indexes

#### 2. Encryption Module ([modules/encryption/](src/modules/encryption/))

**EncryptionService:**
- AES-256-GCM authenticated encryption
- Random IV per encryption operation
- Master key from environment variable
- Utility methods for key rotation and validation

**Methods:**
```typescript
encrypt(plaintext: string) → { encryptedValue, iv, tag }
decrypt(encryptedValue, iv, tag) → string
maskValue(value: string) → string (e.g., '****abc123')
rotateEncryption(encryptedValue, iv, tag) → { encryptedValue, iv, tag }
```

#### 3. Tool Key Service ([tool/tool-key.service.ts](src/tool/tool-key.service.ts))

Manages encrypted API keys with CRUD operations.

**Key Methods:**
```typescript
createKey(params) → EncryptedKey
getDecryptedKey(keyId) → string (decrypts at runtime)
resolveKeyForTool(toolId, agentId, userId?) → string | null
listKeys(ownerId, ownerType) → EncryptedKey[]
updateKeyValue(keyId, newValue) → { success, maskedValue }
mapKeyToTool(params) → KeyMapping
```

**Key Resolution Priority:**
1. Agent-specific key (`contextType='agent'`, `contextId=agentId`)
2. User-specific key (`contextType='user'`, `contextId=userId`)
3. Global key (`contextType='global'`)

#### 4. Tool Access Service ([tool/tool-access.service.ts](src/tool/tool-access.service.ts))

Manages permissions and access control.

**Key Methods:**
```typescript
canExecuteTool(toolId, subjectId, subjectType) → boolean
hasPermission(toolId, subjectId, subjectType, permission) → boolean
grantPermission(params) → Permission
getAccessibleTools(subjectId, subjectType) → Tool[]
checkAgentToolAccess(toolId, agentId, userId?) → AccessCheckResult
```

**Visibility Levels:**
- `platform`: Available to all (static/built-in tools)
- `public`: Available to all users (but may require own keys)
- `private`: Only accessible with explicit permissions

**Permission Types:**
- `read`: Can view tool details
- `execute`: Can execute the tool
- `admin`: Can modify tool and grant permissions

#### 5. Tool Loader Service ([tool/tool-loader.service.ts](src/tool/tool-loader.service.ts))

Centralized tool loading for agents (replaces scattered logic in `agent.service.ts`).

**Key Methods:**
```typescript
loadToolsForAgent(params) → ToolDefinition[]
getToolByName(toolName, agentId, userId?) → ToolDefinition | null
getToolMetadata(toolId, agentId, userId?) → ToolMetadata
filterUsableTools(toolDefs) → ToolDefinition[]
```

**Loading Process:**
1. Load static (platform) tools from Typia definitions
2. Load dynamic tools from database with access control
3. Load agent-specific tools from `agent_tool` mappings
4. Load space-specific tools if in a space
5. Resolve and mark tools that have keys available

#### 6. Workflow Executor Service ([tool/workflow-executor.service.ts](src/tool/workflow-executor.service.ts))

Executes workflows (graphs of connected tools).

**Key Methods:**
```typescript
executeWorkflow(params) → executionId
getExecutionStatus(executionId) → Execution
cancelExecution(executionId) → { success }
listExecutions(workflowId, limit?) → Execution[]
```

**Features:**
- Topological sort for correct execution order
- Output-to-input mapping between tools
- Parallel execution of independent nodes (future)
- Error handling and recovery
- Execution logging

## Setup & Configuration

### 1. Environment Variables

Add to your `.env` file:

```bash
# Encryption master key (256-bit / 32 bytes in hex format)
# Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
TOOL_KEY_ENCRYPTION_MASTER=your_64_character_hex_string_here

# Example:
# TOOL_KEY_ENCRYPTION_MASTER=a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7b8c9d0e1f2
```

### 2. Database Migration

Run the Drizzle migration to create new tables:

```bash
# Generate migration
pnpm drizzle-kit generate

# Apply migration
pnpm drizzle-kit migrate
```

### 3. Update Existing Tools

Migrate existing tools to new schema:

```typescript
// Set visibility for existing tools
await db.update(tool).set({
  visibility: 'platform', // for static tools
  ownerId: null,
  ownerType: 'platform',
});

// Or for user-created tools
await db.update(tool).set({
  visibility: 'private',
  ownerId: userId,
  ownerType: 'user',
});
```

## Usage Examples

### 1. Creating a Tool with API Key

```typescript
// 1. Create the tool
const tool = await toolService.createTool({
  name: 'openai_completion',
  displayName: 'OpenAI Completion',
  description: 'Generate text completions using OpenAI GPT',
  schema: {
    type: 'function',
    function: {
      name: 'openai_completion',
      description: 'Generate text completions',
      parameters: {
        type: 'object',
        properties: {
          prompt: { type: 'string', description: 'The prompt' },
          maxTokens: { type: 'number', description: 'Max tokens' },
        },
        required: ['prompt'],
      },
    },
  },
  apiSpec: {
    baseUrl: 'https://api.openai.com/v1',
    path: '/completions',
    method: 'POST',
    authType: 'bearer',
    authKeyName: 'OPENAI_API_KEY',
    bodyTemplate: {
      model: 'gpt-4',
      prompt: '{{prompt}}',
      max_tokens: '{{maxTokens}}',
    },
  },
  inputSchema: {
    type: 'object',
    properties: {
      prompt: { type: 'string', required: true },
      maxTokens: { type: 'number', default: 100 },
    },
  },
  outputSchema: {
    type: 'object',
    properties: {
      completion: { type: 'string' },
    },
  },
  visibility: 'public', // Available to all users
  category: 'ai',
});

// 2. Add API key for a user
const key = await toolKeyService.createKey({
  keyName: 'OPENAI_API_KEY',
  value: 'sk-...',  // Actual API key
  ownerId: userId,
  ownerType: 'user',
  displayName: 'My OpenAI Key',
  keyType: 'api-key',
});

// 3. Map key to tool
await toolKeyService.mapKeyToTool({
  toolId: tool.toolId,
  keyId: key.keyId,
  contextId: userId,
  contextType: 'user',
  priority: 0,
});

// 4. Grant permission to an agent
await toolAccessService.grantPermission({
  toolId: tool.toolId,
  subjectId: agentId,
  subjectType: 'agent',
  permission: 'execute',
  grantedBy: userId,
});
```

### 2. Loading Tools for an Agent

```typescript
// In agent.service.ts runAgent method
const toolDefs = await toolLoaderService.loadToolsForAgent({
  agentId,
  userId: agent.owner,
  spaceId,
  staticToolDefs: staticToolsFromTypia,
  spaceToolDefs: spaceTools,
  endpoint: `http://localhost:${process.env.PORT}/v1/agents/tools`,
});

// Filter to only show tools with keys available (optional)
const usableTools = toolLoaderService.filterUsableTools(toolDefs);
```

### 3. Creating and Executing a Workflow

```typescript
// 1. Create workflow
const workflow = await db.insert(schema.workflow).values({
  name: 'Content Generation Pipeline',
  description: 'Generate, translate, and summarize content',
  ownerId: userId,
  ownerType: 'user',
  definition: {
    nodes: [
      {
        id: 'generate',
        toolId: generateToolId,
        position: { x: 0, y: 0 },
        config: { temperature: 0.7 },
      },
      {
        id: 'translate',
        toolId: translateToolId,
        position: { x: 200, y: 0 },
        config: { targetLanguage: 'es' },
      },
      {
        id: 'summarize',
        toolId: summarizeToolId,
        position: { x: 400, y: 0 },
      },
    ],
    edges: [
      {
        id: 'e1',
        source: 'generate',
        target: 'translate',
        sourceHandle: 'output',
        targetHandle: 'input',
      },
      {
        id: 'e2',
        source: 'translate',
        target: 'summarize',
        sourceHandle: 'translatedText',
        targetHandle: 'text',
      },
    ],
  },
  visibility: 'private',
});

// 2. Execute workflow
const executionId = await workflowExecutorService.executeWorkflow({
  workflowId: workflow.workflowId,
  agentId,
  sessionId,
  inputData: {
    topic: 'Artificial Intelligence',
    length: 500,
  },
  userId,
});

// 3. Check status
const status = await workflowExecutorService.getExecutionStatus(executionId);
console.log(status.status); // 'running' | 'completed' | 'failed' | 'cancelled'
console.log(status.outputData); // Final workflow output
```

### 4. Managing Keys Securely

```typescript
// List keys for a user (returns masked)
const keys = await toolKeyService.listKeys(userId, 'user');
// Returns: [{ keyId, keyName, maskedValue: '****abc123', ... }]

// Update a key value
await toolKeyService.updateKeyValue(keyId, newApiKey);

// Test if key is valid
const test = await toolKeyService.testKey(keyId);
if (!test.valid) {
  console.error('Invalid key:', test.error);
}

// Rotate encryption (new IV)
await toolKeyService.rotateKeyEncryption(keyId);

// Delete key
await toolKeyService.deleteKey(keyId);
```

## Next Steps

### 1. Immediate Tasks

- [ ] Generate and apply database migration
- [ ] Add `TOOL_KEY_ENCRYPTION_MASTER` to environment variables
- [ ] Update existing tools with visibility and ownership
- [ ] Test encryption service with sample keys

### 2. Refactor agent.service.ts

Replace tool loading logic in `runAgent` method:

```typescript
// OLD (around line 571-624):
const storedTools = await this.toolService.getAllTools();
const dynamicDefs = storedTools.map(...);
// ... lots of manual building

// NEW:
const toolDefs = await this.toolLoader.loadToolsForAgent({
  agentId,
  userId: agent.owner,
  spaceId,
  staticToolDefs: staticDefs,
  spaceToolDefs,
  endpoint: `http://localhost:${process.env.PORT}/v1/agents/tools`,
});
```

### 3. Create API Endpoints

Create controllers for:
- Tool management (`POST /tools`, `GET /tools/:id`, etc.)
- Key management (`POST /keys`, `GET /keys`, etc.)
- Permission management (`POST /tools/:id/permissions`, etc.)
- Workflow management (`POST /workflows`, `POST /workflows/:id/execute`, etc.)

### 4. Update agent-tools.controller

Integrate key resolution in tool execution:

```typescript
// Before executing dynamic tool, resolve key
if (tool.apiSpec?.authType && tool.apiSpec.authType !== 'none') {
  const key = await this.toolKeyService.resolveKeyForTool(
    tool.toolId,
    metadata.agentId,
    agent.owner,
  );

  if (!key) {
    throw new Error(`Missing API key: ${tool.apiSpec.authKeyName}`);
  }

  // Inject key into request
  if (tool.apiSpec.authType === 'bearer') {
    apiSpec.headers.Authorization = `Bearer ${key}`;
  } else if (tool.apiSpec.authType === 'api-key') {
    apiSpec.headers['X-API-Key'] = key;
  }
}
```

### 5. Add Audit Logging

In tool execution:

```typescript
const startTime = Date.now();
try {
  const result = await invokeTool(...);

  // Log successful execution
  await db.insert(schema.toolExecutionLog).values({
    toolId,
    agentId,
    sessionId,
    userId,
    status: 'success',
    startedAt: new Date(startTime),
    completedAt: new Date(),
    duration: Date.now() - startTime,
    inputArgs: sanitizeArgs(args),
    outputData: sanitizeOutput(result),
    keyId: usedKeyId,
  });

  return result;
} catch (error) {
  // Log failed execution
  await db.insert(schema.toolExecutionLog).values({
    toolId,
    agentId,
    sessionId,
    status: 'error',
    errorMessage: error.message,
    // ...
  });

  throw error;
}
```

### 6. Implement Workflow UI

Build a visual workflow editor (similar to n8n or Zapier):
- Drag-and-drop tool nodes
- Connect nodes with edges
- Visual I/O mapping
- Test execution
- View execution history

## Security Considerations

1. **Never log decrypted keys** - Only log keyId, never the actual value
2. **Use HTTPS in production** - Keys in transit must be encrypted
3. **Rotate master key periodically** - Use `rotateKeyEncryption` for all keys
4. **Implement rate limiting** - Use `rateLimitPerMinute` and `rateLimitPerHour` in tool table
5. **Audit regularly** - Review `tool_execution_log` for suspicious activity
6. **Expire permissions** - Use `expiresAt` in `tool_permission` table
7. **Validate all inputs** - Sanitize inputs before tool execution
8. **Limit tool access** - Default to `private` visibility for new tools

## Troubleshooting

### Encryption Errors

**Error:** `TOOL_KEY_ENCRYPTION_MASTER environment variable is required`
- **Solution:** Add the master key to your `.env` file
- Generate a new key: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

**Error:** `Failed to decrypt data - invalid key or corrupted data`
- **Solution:** The master key may have changed. Keys cannot be recovered without the original master key
- Prevention: Back up your master key securely

### Permission Errors

**Error:** `agent X does not have permission to execute tool Y`
- **Solution:** Grant permission with `toolAccessService.grantPermission()`
- Check tool visibility level - may need to change from `private` to `public`

### Key Resolution Issues

**Problem:** Tool execution fails with "Missing API key"
- **Check:** Is the key mapped to the tool? (`tool_key_mapping` table)
- **Check:** Is the key active? (`isActive` field)
- **Check:** Has the key expired? (`expiresAt` field)
- **Check:** Resolution priority: agent → user → global

### Workflow Execution Issues

**Error:** `Workflow contains cycles`
- **Solution:** Remove circular dependencies in your workflow graph
- Tools cannot depend on each other in a loop

## Performance Optimization

1. **Cache tool definitions** - Load frequently used tools into memory
2. **Batch key resolution** - Resolve all keys for an agent at once
3. **Index optimization** - Ensure indexes on frequently queried fields
4. **Connection pooling** - Use database connection pooling for high load
5. **Async workflow execution** - Workflows run in background, don't block

## Monitoring

Track these metrics:
- Tool execution success rate (from `tool_execution_log`)
- Average tool execution duration
- Key usage patterns (detect unusual activity)
- Permission grants/revocations
- Workflow success rate
- Rate limit hits

## Resources

- [Database Schema Documentation](models/schema-redesign.md)
- [Encryption Service Source](src/modules/encryption/encryption.service.ts)
- [Tool Loader Service Source](src/tool/tool-loader.service.ts)
- [Workflow Executor Source](src/tool/workflow-executor.service.ts)

## Support

For questions or issues:
1. Check this guide first
2. Review the code documentation
3. Check the database schema
4. Create an issue in the repository

---

**Last Updated:** 2025-11-26
**Version:** 1.0.0

# TypeScript SDK

The `@agent-commons/sdk` package gives you typed access to the full Agent Commons API from Node.js or any TypeScript/JavaScript environment.

---

## Installation

```bash
npm install @agent-commons/sdk
# or
pnpm add @agent-commons/sdk
```

---

## Setup

```typescript
import { CommonsClient } from '@agent-commons/sdk';

const client = new CommonsClient({
  baseUrl: 'https://api.agentcommons.io',
  apiKey: process.env.COMMONS_API_KEY,
});
```

Configuration options:

| Option | Type | Required | Description |
|---|---|---|---|
| `baseUrl` | `string` | yes | Base URL of the API |
| `apiKey` | `string` | yes* | API key from Settings → API Keys |
| `initiator` | `string` | no | Wallet address (alternative to apiKey) |
| `fetch` | `typeof fetch` | no | Custom fetch implementation (default: global fetch) |

---

## Agents

### Create an agent

```typescript
const { data: agent } = await client.agents.create({
  name: 'Research Bot',
  instructions: 'You are a research assistant. Be concise.',
  modelProvider: 'openai',
  modelId: 'gpt-4o',
  temperature: 0.3,
});

console.log(agent.agentId); // "agent_abc123"
```

### List agents

```typescript
const { data: all } = await client.agents.list();
const { data: mine } = await client.agents.list('0xWALLET');
```

### Get / update an agent

```typescript
const { data: agent } = await client.agents.get('agent_abc123');

await client.agents.update('agent_abc123', {
  instructions: 'Updated instructions',
  temperature: 0.7,
});
```

### Agent tools

```typescript
// List tools assigned to an agent
const { data: tools } = await client.agents.listTools('agent_abc123');

// Assign a tool
await client.agents.addTool('agent_abc123', { toolId: 'tool_xyz' });

// Remove a tool assignment (use the assignment record ID, not the toolId)
await client.agents.removeTool(assignmentId);
```

### Knowledgebase

```typescript
const { data: kb } = await client.agents.getKnowledgebase('agent_abc123');

await client.agents.updateKnowledgebase('agent_abc123', [
  { type: 'text', content: 'Background context...' },
]);
```

### Preferred connections

```typescript
// List agents this agent prefers to collaborate with
const { data: connections } = await client.agents.getPreferredConnections('agent_abc123');

// Add a preferred connection
await client.agents.addPreferredConnection('agent_abc123', {
  preferredAgentId: 'agent_xyz',
  usageComments: 'Use for image tasks',
});

// Remove (pass the connection record ID, not the agentId)
await client.agents.removePreferredConnection(connectionId);
```

### Autonomy / heartbeat

```typescript
// Get current status
const { data: status } = await client.agents.getAutonomy('agent_abc123');

// Enable the heartbeat (runs every 5 minutes)
await client.agents.setAutonomy('agent_abc123', { enabled: true, intervalSec: 300 });

// Trigger a single beat immediately (for testing)
await client.agents.triggerHeartbeat('agent_abc123');

// Manual fire-and-forget trigger (requires autonomy enabled)
await client.agents.trigger('agent_abc123');
```

### TTS voices

```typescript
// List available voices
const { data: voices } = await client.agents.listVoices('openai');
const { data: filtered } = await client.agents.listVoices('elevenlabs', 'rachel');
```

---

## Running agents

### Single run (returns complete response)

```typescript
const result = await client.run.once({
  agentId: 'agent_abc123',
  messages: [{ role: 'user', content: 'What is the capital of France?' }],
});
```

### Streaming

```typescript
for await (const event of client.agents.stream({
  agentId: 'agent_abc123',
  messages: [{ role: 'user', content: 'Write me a poem about AI.' }],
})) {
  if (event.type === 'token') process.stdout.write(event.content ?? '');
  if (event.type === 'toolStart') console.log(`[calling tool: ${event.toolName}]`);
  if (event.type === 'final') console.log('\nDone!');
}
```

Stream event types:

| Type | Fields | Description |
|---|---|---|
| `token` | `content` | A chunk of the response text |
| `toolStart` | `toolName`, `input` | Agent is calling a tool |
| `toolEnd` | `toolName`, `output` | Tool returned a result |
| `agent_step` | `payload` | Internal agent step update |
| `final` | `payload` | Run complete with final payload |
| `completed` | — | Run finished successfully |
| `failed` | `message` | Run failed |
| `cancelled` | — | Run was cancelled |
| `status` | `message` | Status update |
| `error` | `message` | An error occurred |
| `cli_tool_request` | `toolName`, `input` | CLI-side tool invocation (used internally by the CLI) |

---

## Sessions

```typescript
// List sessions for a specific agent + initiator
const { data: sessions } = await client.sessions.list('agent_abc123', '0xUSER');

// List all sessions for an agent (all initiators)
const { data: all } = await client.sessions.listByAgent('agent_abc123');

// List all sessions for a user across all agents
const { data: mine } = await client.sessions.listByUser('0xUSER');

// Create a session
const { data: session } = await client.sessions.create({
  agentId: 'agent_abc123',
  initiator: '0xUSER',
  title: 'Research session',
  source: 'web', // optional: 'web' | 'cli' — used for filtering in the UI
});

// Get a session
const { data: s } = await client.sessions.get(session.sessionId);

// Get full session with history, tasks, and spaces
const { data: full } = await client.sessions.getFull(session.sessionId);
```

---

## Tasks

### Create a task

```typescript
const { data: task } = await client.tasks.create({
  title: 'Daily news summary',
  description: 'Fetch the top 5 tech stories and summarize each in 2 sentences.',
  agentId: 'agent_abc123',
  sessionId: 'session_xyz',
  createdBy: '0xUSER',
  createdByType: 'user',
  executionMode: 'single',
});
```

### Schedule a recurring task

```typescript
const { data: task } = await client.tasks.create({
  title: 'Morning briefing',
  description: 'Summarize overnight news.',
  agentId: 'agent_abc123',
  sessionId: 'session_xyz',
  createdBy: '0xUSER',
  createdByType: 'user',
  executionMode: 'single',
  cronExpression: '0 8 * * 1-5', // 8am Mon-Fri
  isRecurring: true,
});
```

### Execute, stream, and cancel

```typescript
// Execute immediately
await client.tasks.execute(task.taskId);

// Stream task progress
for await (const event of client.tasks.stream(task.taskId)) {
  console.log(event.type, event.message);
}

// Cancel
await client.tasks.cancel(task.taskId);
```

---

## Workflows

### Create a workflow

```typescript
const workflow = await client.workflows.create({
  name: 'Summarize and Report',
  ownerId: '0xUSER',
  ownerType: 'user',
  definition: {
    nodes: [
      { id: 'input', type: 'input' },
      { id: 'process', type: 'agent_processor', config: { agentId: 'agent_abc123' } },
      { id: 'output', type: 'output' },
    ],
    edges: [
      { id: 'e1', source: 'input', target: 'process' },
      { id: 'e2', source: 'process', target: 'output' },
    ],
  },
});
```

Workflow node types: `tool` | `input` | `output` | `condition` | `transform` | `loop` | `agent_processor` | `human_approval`

### List, update, and delete workflows

```typescript
// List all workflows for an owner
const workflows = await client.workflows.list('0xUSER', 'user');

// Update a workflow
await client.workflows.update(workflow.workflowId, { name: 'Updated name' });

// Delete a workflow
await client.workflows.delete(workflow.workflowId);
```

### Execute and stream a workflow

```typescript
const execution = await client.workflows.execute(workflow.workflowId, {
  inputData: { url: 'https://news.ycombinator.com' },
});

for await (const event of client.workflows.stream(workflow.workflowId, execution.executionId)) {
  console.log(event.type, event.payload);
}
```

### Manage executions

```typescript
// Get a single execution
const exec = await client.workflows.getExecution(workflow.workflowId, execution.executionId);

// List recent executions
const history = await client.workflows.listExecutions(workflow.workflowId, 10);

// Cancel a running execution
await client.workflows.cancelExecution(workflow.workflowId, execution.executionId);
```

### Human approval

```typescript
// Approve a paused human_approval node
await client.workflows.approveExecution(workflow.workflowId, execution.executionId, {
  approvalToken: execution.approvalToken,
  approvalData: { approved: true },
});

// Reject
await client.workflows.rejectExecution(workflow.workflowId, execution.executionId, {
  approvalToken: execution.approvalToken,
  reason: 'Not ready',
});
```

---

## Tools

### List available tools

```typescript
const { data: tools } = await client.tools.list();
const { data: agentTools } = await client.tools.list({ agentId: 'agent_abc123' });
const { data: staticTools } = await client.tools.listStatic();
```

### Create a custom tool

```typescript
const { data: tool } = await client.tools.create({
  name: 'slack_notify',
  displayName: 'Slack Notify',
  description: 'Send a message to a Slack channel',
  schema: {
    type: 'object',
    properties: {
      channel: { type: 'string' },
      message: { type: 'string' },
    },
    required: ['channel', 'message'],
  },
  visibility: 'private',
});
```

### Tool keys (API credentials)

```typescript
// Store an API key for a tool
await client.toolKeys.create({
  toolId: tool.toolId,
  ownerId: '0xUSER',
  ownerType: 'user',
  keyName: 'SLACK_TOKEN',
  value: 'xoxb-your-slack-token',
});

// List keys for a tool
const { data: keys } = await client.toolKeys.list({ toolId: tool.toolId });

// Delete a key
await client.toolKeys.delete(keyId);
```

### Tool permissions

```typescript
// Grant execute permission to an agent
await client.toolPermissions.grant({
  toolId: tool.toolId,
  subjectId: 'agent_abc123',
  subjectType: 'agent',
  permission: 'execute',
});

// List permissions for a tool
const { data: perms } = await client.toolPermissions.list(tool.toolId);

// Revoke
await client.toolPermissions.revoke(permissionId);
```

---

## MCP Servers

```typescript
// List servers for an owner
const { servers } = await client.mcp.listServers('0xUSER', 'user');

// Create a new MCP server
const server = await client.mcp.createServer({
  name: 'GitHub Tools',
  connectionType: 'sse',
  connectionConfig: { url: 'https://github-mcp-server.example.com/sse' },
  ownerId: '0xUSER',
  ownerType: 'user',
});

// Get a server by ID
const s = await client.mcp.getServer(server.serverId);

// Connect to it
await client.mcp.connect(server.serverId);

// Sync its tools, resources, and prompts
const { toolsDiscovered } = await client.mcp.sync(server.serverId);

// List discovered tools
const { tools } = await client.mcp.listTools(server.serverId);

// List all MCP tools across every server for an owner
const { tools: allTools } = await client.mcp.listToolsByOwner('0xUSER', 'user');

// Get server status
const status = await client.mcp.getServerStatus(server.serverId);

// Update server config
await client.mcp.updateServer(server.serverId, { isPublic: true });

// Resources
const { resources } = await client.mcp.listResources(server.serverId);
const resource = await client.mcp.readResource(server.serverId, 'file:///README.md');

// Prompts
const { prompts } = await client.mcp.listPrompts(server.serverId);
const rendered = await client.mcp.getPrompt(server.serverId, 'summarize', { language: 'en' });

// Disconnect and delete
await client.mcp.disconnect(server.serverId);
await client.mcp.deleteServer(server.serverId);

// Browse public marketplace servers
const { servers: marketplace } = await client.mcp.getMarketplace();
```

MCP connection types: `'stdio'` | `'sse'` | `'http'` | `'streamable-http'`

---

## Memory

```typescript
// Store a memory
const { data: mem } = await client.memory.create({
  agentId: 'agent_abc123',
  memoryType: 'semantic',
  content: 'User prefers bullet-point summaries over prose.',
  summary: 'Formatting preference',
  tags: ['preferences'],
});

// Retrieve memories most relevant to a query
const { data: relevant } = await client.memory.retrieve(
  'agent_abc123',
  'user formatting preferences',
  5, // limit
);

// List all memories for an agent
const { data: all } = await client.memory.list('agent_abc123', { type: 'semantic', limit: 20 });

// Get memory stats
const { data: stats } = await client.memory.stats('agent_abc123');

// Update a memory
await client.memory.update(mem.memoryId, { importanceScore: 0.9 });

// Soft-delete a memory
await client.memory.delete(mem.memoryId);
```

Memory types: `'episodic'` | `'semantic'` | `'procedural'`

---

## Wallets

```typescript
// Create a wallet for an agent
const wallet = await client.wallets.create({
  agentId: 'agent_abc123',
  walletType: 'eoa',
  label: 'main',
});

// Check balance
const balance = await client.wallets.balance(wallet.id);
console.log('USDC:', balance.usdc);
console.log('ETH:', balance.native);

// Transfer
await client.wallets.transfer(wallet.id, {
  toAddress: '0xRecipientAddress',
  amount: '1.5',
  tokenSymbol: 'USDC',
});

// Get primary wallet for an agent
const primary = await client.wallets.primary('agent_abc123');

// Proxy an HTTP request with automatic x402 payment handling
const response = await client.wallets.x402Fetch('agent_abc123', {
  url: 'https://paid-api.example.com/data',
  method: 'GET',
});
```

Wallet types: `'eoa'` | `'erc4337'` | `'external'`

---

## Auth

```typescript
// Resolve the principalId (wallet address) for the current API key
// Useful so you don't need to hard-code the initiator address
const { principalId, principalType } = await client.auth.me();
```

---

## API Keys

```typescript
// Generate a new API key (plaintext returned only once)
const created = await client.apiKeys.create({
  principalId: '0xUSER',
  principalType: 'user',
  label: 'production',
});
console.log('Key:', created.key); // save this!

// List active keys (values not included)
const keys = await client.apiKeys.list('0xUSER', 'user');

// Revoke a key
await client.apiKeys.revoke(keyId);
```

---

## A2A (Agent-to-Agent)

```typescript
// Get an agent's A2A card
const card = await client.a2a.getAgentCard('agent_abc123');

// Send a task to an external agent
const a2aTask = await client.a2a.sendTask('agent_abc123', {
  message: {
    role: 'user',
    parts: [{ type: 'text', text: 'Summarize this document...' }],
  },
});

// Stream A2A task updates
for await (const event of client.a2a.stream('agent_abc123', a2aTask.id)) {
  console.log(event.type, event.content);
}

// Get task status
const taskStatus = await client.a2a.getTask('agent_abc123', a2aTask.id);

// Cancel a task
await client.a2a.cancelTask('agent_abc123', a2aTask.id);

// List recent A2A tasks for an agent
const { tasks } = await client.a2a.listTasks('agent_abc123', 20);
```

---

## Skills

```typescript
// List skills
const { data: skills } = await client.skills.list({ isPublic: true });

// Get a skill by ID or slug
const { data: skill } = await client.skills.get('summarize-content');

// Get the skill index (lightweight listing)
const { data: index } = await client.skills.getIndex();

// Create a skill
const { data: newSkill } = await client.skills.create({
  slug: 'my-skill',
  name: 'My Skill',
  description: 'Does something useful',
  instructions: 'When asked to...',
  tools: ['tool_abc'],
  isPublic: false,
});

// Update a skill
await client.skills.update('my-skill', { isPublic: true });

// Delete a skill
await client.skills.delete('my-skill');
```

---

## Models

```typescript
const { data, grouped } = await client.models.list();
// grouped: { openai: [...], anthropic: [...], ... }
```

---

## Usage / Observability

```typescript
// Agent usage stats
const { data: agentUsage } = await client.usage.getAgentUsage('agent_abc123', {
  from: '2025-01-01T00:00:00Z',
  to:   '2025-01-31T23:59:59Z',
});
console.log(agentUsage.totalCostUsd, agentUsage.totalTokens);

// Session usage stats
const { data: sessionUsage } = await client.usage.getSessionUsage('session_xyz');
```

---

## Error handling

The SDK throws `CommonsError` for API errors:

```typescript
import { CommonsClient, CommonsError } from '@agent-commons/sdk';

try {
  await client.run.once({ agentId: 'bad-id', messages: [...] });
} catch (error) {
  if (error instanceof CommonsError) {
    console.error(`API error ${error.status}: ${error.message}`);
    console.error('Details:', error.data);
  }
}
```

---

## TypeScript types

Key types exported from `@agent-commons/sdk`:

```typescript
import type {
  // Agents
  Agent,
  CreateAgentParams,
  ModelProvider, // 'openai' | 'anthropic' | 'google' | 'groq' | 'mistral' | 'ollama'
  ModelConfig,

  // Running
  Session,
  ChatMessage,
  RunParams,
  StreamEvent,
  StreamEventType,

  // Tasks
  Task,
  CreateTaskParams,

  // Workflows
  Workflow,
  WorkflowDefinition,
  WorkflowNode,
  WorkflowNodeType, // 'tool' | 'input' | 'output' | 'condition' | 'transform' | 'loop' | 'agent_processor' | 'human_approval'
  WorkflowEdge,
  WorkflowExecution,

  // Tools
  Tool,
  CreateToolParams,
  ToolKey,
  CreateToolKeyParams,
  ToolPermission,

  // A2A
  AgentCard,
  A2ATask,
  A2AMessage,
  A2AMessagePart,
  A2ASendTaskParams,
  A2ATaskState,

  // Memory
  AgentMemory,
  MemoryType, // 'episodic' | 'semantic' | 'procedural'
  CreateMemoryParams,
  UpdateMemoryParams,
  MemoryStats,

  // Skills
  Skill,
  SkillIndex,
  CreateSkillParams,

  // Wallets
  AgentWallet,
  WalletBalance,
  WalletType, // 'eoa' | 'erc4337' | 'external'
  CreateWalletParams,

  // API Keys
  ApiKey,
  CreatedApiKey,
  CreateApiKeyParams,
  ApiKeyPrincipalType,

  // MCP
  McpServer,
  McpResource,
  McpPrompt,
  McpConnectionType, // 'stdio' | 'sse' | 'http' | 'streamable-http'

  // Usage
  UsageEvent,
  UsageAggregation,
} from '@agent-commons/sdk';
```

---

## Full example: Autonomous research agent

```typescript
import { CommonsClient } from '@agent-commons/sdk';

const client = new CommonsClient({
  baseUrl: 'https://api.agentcommons.io',
  apiKey: process.env.COMMONS_API_KEY!,
});

async function main() {
  // 1. Create the agent
  const { data: agent } = await client.agents.create({
    name: 'Daily Researcher',
    instructions: `You are a research assistant. When given a topic:
      1. Search the web for the latest information
      2. Summarize in 5 clear bullet points
      3. Include sources`,
    modelProvider: 'anthropic',
    modelId: 'claude-sonnet-4-6',
    temperature: 0.2,
  });

  // 2. Create a session for conversation context
  const { data: session } = await client.sessions.create({
    agentId: agent.agentId,
    initiator: '0xUSER',
  });

  // 3. Schedule a recurring task
  await client.tasks.create({
    title: 'Daily AI news briefing',
    description: 'Research the top AI developments from the past 24 hours.',
    agentId: agent.agentId,
    sessionId: session.sessionId,
    createdBy: '0xUSER',
    createdByType: 'user',
    executionMode: 'single',
    cronExpression: '0 8 * * *',
    isRecurring: true,
  });

  // 4. Run it once now to test
  for await (const event of client.agents.stream({
    agentId: agent.agentId,
    sessionId: session.sessionId,
    messages: [{ role: 'user', content: 'Top AI news today?' }],
  })) {
    if (event.type === 'token') process.stdout.write(event.content ?? '');
    if (event.type === 'final') console.log('\n✓ Done');
  }
}

main();
```

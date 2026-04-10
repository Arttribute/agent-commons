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
  apiUrl: 'https://api.agentcommons.io',
  apiKey: process.env.COMMONS_API_KEY,
});
```

Configuration options:

| Option | Type | Required | Description |
|---|---|---|---|
| `apiUrl` | `string` | yes | Base URL of the API |
| `apiKey` | `string` | yes* | API key from Settings → API Keys |
| `initiator` | `string` | no | Wallet address (alternative to apiKey) |

---

## Agents

### Create an agent

```typescript
const agent = await client.agents.create({
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
const agents = await client.agents.list();
const myAgents = await client.agents.list({ owner: '0xWALLET' });
```

### Get an agent

```typescript
const agent = await client.agents.get('agent_abc123');
```

### Update an agent

```typescript
await client.agents.update('agent_abc123', {
  instructions: 'Updated instructions',
  temperature: 0.7,
});
```

---

## Running agents

### Single run (returns complete response)

```typescript
const result = await client.agents.run({
  agentId: 'agent_abc123',
  messages: [{ role: 'user', content: 'What is the capital of France?' }],
});

console.log(result.response);  // "Paris is the capital of France."
console.log(result.sessionId); // for continuing the conversation
```

### Continue a conversation

```typescript
const followUp = await client.agents.run({
  agentId: 'agent_abc123',
  sessionId: result.sessionId, // from previous run
  messages: [{ role: 'user', content: 'And what is its population?' }],
});
```

### Streaming

```typescript
const stream = await client.agents.runStream({
  agentId: 'agent_abc123',
  messages: [{ role: 'user', content: 'Write me a poem about AI.' }],
});

for await (const event of stream) {
  if (event.type === 'token') {
    process.stdout.write(event.content);
  } else if (event.type === 'tool_start') {
    console.log(`\n[calling tool: ${event.toolName}]`);
  } else if (event.type === 'done') {
    console.log('\n\nDone!', event.usage);
  }
}
```

Stream event types:

| Type | Fields | Description |
|---|---|---|
| `token` | `content: string` | A chunk of the response text |
| `tool_start` | `toolName`, `input` | Agent is calling a tool |
| `tool_end` | `toolName`, `output` | Tool returned a result |
| `thinking` | `content` | Internal reasoning (some models) |
| `done` | `sessionId`, `usage` | Run complete |
| `error` | `message` | An error occurred |

---

## Sessions

```typescript
// Get full chat history for a session
const history = await client.sessions.getChat('session_xyz');

console.log(history.history);
// [
//   { role: 'user', content: 'Hello', timestamp: '...' },
//   { role: 'assistant', content: 'Hi!', timestamp: '...' },
// ]
```

---

## Tasks

### Create a task

```typescript
const task = await client.tasks.create({
  title: 'Daily news summary',
  description: 'Fetch the top 5 tech stories and summarize each in 2 sentences.',
  agentId: 'agent_abc123',
  executionMode: 'single',
});
```

### Schedule a recurring task

```typescript
const task = await client.tasks.create({
  title: 'Morning briefing',
  description: 'Summarize overnight news.',
  agentId: 'agent_abc123',
  executionMode: 'single',
  cronExpression: '0 8 * * 1-5', // 8am Mon-Fri
  isRecurring: true,
});
```

### Execute a task now

```typescript
await client.tasks.execute(task.taskId);
```

### Stream task progress

```typescript
const stream = client.tasks.stream(task.taskId);

for await (const event of stream) {
  console.log(event.status, event.message);
}
```

### Cancel a task

```typescript
await client.tasks.cancel(task.taskId);
```

---

## Workflows

### Create a workflow

```typescript
const workflow = await client.workflows.create({
  name: 'Summarize and Email',
  definition: {
    nodes: [
      {
        id: 'scrape',
        type: 'tool',
        toolName: 'web_scraper',
        parameters: { url: '{{inputs.url}}' },
      },
      {
        id: 'summarize',
        type: 'agent_processor',
        prompt: 'Summarize this in 3 bullets: {{scrape.output}}',
      },
    ],
    edges: [{ from: 'scrape', to: 'summarize' }],
  },
  inputSchema: { url: { type: 'string' } },
});
```

### Execute a workflow

```typescript
const execution = await client.workflows.execute(workflow.workflowId, {
  inputs: { url: 'https://news.ycombinator.com' },
});

// Stream the execution
const stream = client.workflows.stream(execution.executionId);

for await (const event of stream) {
  console.log(`Node ${event.nodeId}: ${event.status}`);
  if (event.output) console.log('Output:', event.output);
}
```

---

## Tools

### List available tools

```typescript
const tools = await client.tools.list();
```

### Create a custom tool

```typescript
const tool = await client.tools.create({
  name: 'Slack Notify',
  description: 'Send a message to a Slack channel',
  schema: {
    input: {
      channel: { type: 'string' },
      message: { type: 'string' },
    },
  },
  endpoint: 'https://hooks.slack.com/services/YOUR/WEBHOOK/URL',
  method: 'POST',
});
```

### Add an API key

```typescript
await client.tools.addKey(tool.toolId, {
  value: 'xoxb-your-slack-token',
  label: 'production',
});
```

### Invoke a tool directly

```typescript
const result = await client.tools.invoke(tool.toolId, {
  input: { channel: '#general', message: 'Hello from Agent Commons!' },
});
```

---

## MCP Servers

```typescript
// Connect a server
const server = await client.mcp.connect({
  name: 'GitHub Tools',
  transportType: 'sse',
  url: 'https://github-mcp-server.example.com/sse',
});

// Sync its tools
await client.mcp.sync(server.serverId);

// List its tools
const tools = await client.mcp.tools(server.serverId);
```

---

## Memory

```typescript
// Store a memory
await client.memory.create({
  agentId: 'agent_abc123',
  memoryType: 'semantic',
  content: 'User prefers bullet-point summaries over prose.',
  tags: ['preferences'],
});

// Retrieve relevant memories by query
const memories = await client.memory.retrieve('agent_abc123', {
  query: 'user formatting preferences',
  limit: 5,
});

memories.forEach(m => console.log(m.content, m.score));
```

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
const balance = await client.wallets.balance(wallet.walletId);
console.log('USDC:', balance.usdc);

// Transfer
await client.wallets.transfer(wallet.walletId, {
  to: '0xRecipientAddress',
  amount: '1.5',
  token: 'USDC',
});
```

---

## Error handling

The SDK throws `CommonsError` for API errors:

```typescript
import { CommonsClient, CommonsError } from '@agent-commons/sdk';

try {
  await client.agents.run({ agentId: 'bad-id', messages: [...] });
} catch (error) {
  if (error instanceof CommonsError) {
    console.error(`API error ${error.statusCode}: ${error.message}`);
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
  StreamEvent,
  StreamEventType,

  // Tasks
  Task,
  CreateTaskParams,

  // Workflows
  Workflow,
  WorkflowDefinition,
  WorkflowNode,
  WorkflowNodeType, // 'tool' | 'agent_processor' | 'data_transformer' | 'conditional'
  WorkflowEdge,
  WorkflowExecution,

  // Tools
  Tool,
  CreateToolParams,
  ToolKey,

  // A2A
  AgentCard,
  A2ATask,
  A2AMessage,

  // Memory
  AgentMemory,
  MemoryType, // 'semantic' | 'episodic' | 'procedural'
  CreateMemoryParams,

  // Wallets
  AgentWallet,
  WalletBalance,

  // MCP
  McpServer,
  McpConnectionType, // 'stdio' | 'sse' | 'http'
} from '@agent-commons/sdk';
```

---

## Full example: Autonomous research agent

```typescript
import { CommonsClient } from '@agent-commons/sdk';

const client = new CommonsClient({
  apiUrl: 'https://api.agentcommons.io',
  apiKey: process.env.COMMONS_API_KEY!,
});

async function main() {
  // 1. Create the agent
  const agent = await client.agents.create({
    name: 'Daily Researcher',
    instructions: `You are a research assistant. When given a topic:
      1. Search the web for the latest information
      2. Summarize in 5 clear bullet points
      3. Include sources`,
    modelProvider: 'anthropic',
    modelId: 'claude-sonnet-4-6',
    temperature: 0.2,
  });

  // 2. Schedule it to run every morning
  const task = await client.tasks.create({
    title: 'Daily AI news briefing',
    description: 'Research the top AI developments from the past 24 hours.',
    agentId: agent.agentId,
    executionMode: 'single',
    cronExpression: '0 8 * * *',
    isRecurring: true,
  });

  console.log(`Agent ${agent.agentId} scheduled. Task: ${task.taskId}`);

  // 3. Run it once now to test
  const stream = await client.agents.runStream({
    agentId: agent.agentId,
    messages: [{ role: 'user', content: 'Top AI news today?' }],
  });

  for await (const event of stream) {
    if (event.type === 'token') process.stdout.write(event.content);
    if (event.type === 'done') console.log('\n✓ Done');
  }
}

main();
```

# REST API Reference

Base URL: `https://api.agentcommons.io`

All requests require authentication via the `x-api-key` header (get a key from Settings → API Keys in the web app), or `x-initiator` (wallet address or agent ID for on-behalf-of calls).

---

## Authentication

```http
x-api-key: your_api_key
Content-Type: application/json
```

---

## Agents

### Create an agent

```http
POST /v1/agents
```

**Body:**
```json
{
  "name": "Research Bot",
  "instructions": "You are a research assistant. Summarize web pages clearly.",
  "persona": "Analytical and concise",
  "modelProvider": "openai",
  "modelId": "gpt-4o",
  "temperature": 0.3,
  "maxTokens": 2048
}
```

**Response:**
```json
{
  "agentId": "agent_abc123",
  "name": "Research Bot",
  "modelProvider": "openai",
  "modelId": "gpt-4o",
  "createdAt": "2026-04-10T12:00:00Z"
}
```

---

### List agents

```http
GET /v1/agents
GET /v1/agents?owner=0xWALLET_ADDRESS
```

---

### Get an agent

```http
GET /v1/agents/:agentId
```

---

### Update an agent

```http
PUT /v1/agents/:agentId
```

**Body** — any subset of agent fields:
```json
{
  "instructions": "Updated instructions...",
  "temperature": 0.7
}
```

---

### Run an agent (synchronous)

```http
POST /v1/agents/run
```

**Body:**
```json
{
  "agentId": "agent_abc123",
  "messages": [
    { "role": "user", "content": "Summarize https://example.com" }
  ],
  "sessionId": "optional-existing-session-id"
}
```

**Response:**
```json
{
  "sessionId": "session_xyz",
  "response": "The page covers...",
  "usage": {
    "inputTokens": 120,
    "outputTokens": 85,
    "totalTokens": 205
  }
}
```

---

### Run an agent (streaming) {#streaming}

```http
POST /v1/agents/run/stream
```

Same body as `/run`. Returns an **SSE stream** of events:

```
data: {"type":"token","content":"The"}
data: {"type":"token","content":" page"}
data: {"type":"tool_start","toolName":"web_scraper","input":{"url":"..."}}
data: {"type":"tool_end","toolName":"web_scraper","output":"..."}
data: {"type":"done","sessionId":"session_xyz","usage":{...}}
```

**Consuming in JavaScript:**
```javascript
const response = await fetch('https://api.agentcommons.io/v1/agents/run/stream', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-api-key': 'YOUR_KEY',
  },
  body: JSON.stringify({ agentId: 'agent_abc123', messages: [...] }),
});

const reader = response.body.getReader();
const decoder = new TextDecoder();

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  const text = decoder.decode(value);
  // parse SSE events from text
  console.log(text);
}
```

---

### Get session chat history

```http
GET /v1/agents/sessions/:sessionId/chat
```

**Response:**
```json
{
  "sessionId": "session_xyz",
  "agentId": "agent_abc123",
  "history": [
    { "role": "user", "content": "Hello", "timestamp": "..." },
    { "role": "assistant", "content": "Hi there!", "timestamp": "..." }
  ]
}
```

---

### Autonomy (scheduled/heartbeat mode)

```http
GET  /v1/agents/:agentId/autonomy        # get current settings
PUT  /v1/agents/:agentId/autonomy        # enable/configure autonomy
POST /v1/agents/:agentId/autonomy/trigger  # trigger one heartbeat now
```

**Enable autonomy:**
```json
{
  "autonomyEnabled": true,
  "autonomousIntervalSec": 300,
  "cronExpression": "0 9 * * *"
}
```

---

## Tasks

### Create a task

```http
POST /v1/tasks
```

**Body:**
```json
{
  "title": "Daily news summary",
  "description": "Fetch top tech news and write a 5-bullet summary.",
  "agentId": "agent_abc123",
  "executionMode": "single",
  "cronExpression": "0 8 * * *",
  "isRecurring": true
}
```

**Execution modes:**
- `single` — run the task description as a one-shot agent prompt
- `workflow` — execute a workflow (set `workflowId`)
- `sequential` — run a list of sub-tasks in order

---

### List tasks

```http
GET /v1/tasks?agentId=agent_abc123
GET /v1/tasks?sessionId=session_xyz
GET /v1/tasks?ownerId=0xWALLET&ownerType=user
```

---

### Get a task

```http
GET /v1/tasks/:taskId
```

---

### Execute a task now

```http
POST /v1/tasks/:taskId/execute
```

---

### Stream task status

```http
GET /v1/tasks/:taskId/stream
```

Returns SSE with status updates as the task runs.

---

### Cancel a task

```http
POST /v1/tasks/:taskId/cancel
```

---

## Workflows

### Create a workflow

```http
POST /v1/workflows
```

**Body:**
```json
{
  "name": "Summarize and Tweet",
  "description": "Scrape a URL, summarize it, then post to Twitter",
  "definition": {
    "nodes": [
      {
        "id": "scrape",
        "type": "tool",
        "toolName": "web_scraper",
        "parameters": { "url": "{{inputs.url}}" }
      },
      {
        "id": "summarize",
        "type": "agent_processor",
        "prompt": "Summarize this in 3 sentences: {{scrape.output}}"
      },
      {
        "id": "tweet",
        "type": "tool",
        "toolName": "twitter_post",
        "parameters": { "content": "{{summarize.output}}" }
      }
    ],
    "edges": [
      { "from": "scrape", "to": "summarize" },
      { "from": "summarize", "to": "tweet" }
    ]
  },
  "inputSchema": { "url": { "type": "string" } },
  "isPublic": false
}
```

---

### Execute a workflow

```http
POST /v1/workflows/:workflowId/execute
```

**Body:**
```json
{
  "inputs": { "url": "https://techcrunch.com/latest" }
}
```

**Response:**
```json
{
  "executionId": "exec_123",
  "status": "running"
}
```

---

### Stream workflow execution

```http
GET /v1/workflows/:executionId/stream
```

SSE stream with per-node status updates:

```
data: {"nodeId":"scrape","status":"running"}
data: {"nodeId":"scrape","status":"completed","output":"Page content..."}
data: {"nodeId":"summarize","status":"running"}
data: {"nodeId":"summarize","status":"completed","output":"Key points: ..."}
data: {"executionId":"exec_123","status":"completed"}
```

---

### List public workflows

```http
GET /v1/workflows/public
GET /v1/workflows/public?category=research
```

---

### Fork a workflow

```http
POST /v1/workflows/:workflowId/fork
```

Creates a copy in your account that you can modify.

---

## Tools

### List tools

```http
GET /v1/tools
```

Returns built-in tools and your custom tools.

---

### Create a custom tool

```http
POST /v1/tools
```

**Body:**
```json
{
  "name": "Weather API",
  "description": "Get current weather for a city",
  "schema": {
    "input": {
      "city": { "type": "string", "description": "City name" }
    },
    "output": {
      "temperature": { "type": "number" },
      "conditions": { "type": "string" }
    }
  },
  "endpoint": "https://api.weather.com/current?city={{city}}",
  "method": "GET"
}
```

---

### Invoke a tool directly

```http
POST /v1/tools/:toolId/invoke
```

**Body:**
```json
{
  "input": { "city": "Nairobi" }
}
```

---

### Add an API key to a tool

```http
POST /v1/tools/:toolId/keys
```

**Body:**
```json
{
  "value": "sk-actual-api-key",
  "label": "production key"
}
```

The key is stored encrypted. Agents use it automatically when invoking the tool.

---

## MCP Servers

### Connect an MCP server

```http
POST /v1/mcp/servers
```

**Body (SSE/HTTP transport):**
```json
{
  "name": "My Tools Server",
  "transportType": "sse",
  "url": "https://my-mcp-server.example.com/sse"
}
```

**Body (stdio transport):**
```json
{
  "name": "Filesystem Tools",
  "transportType": "stdio",
  "command": "npx",
  "args": ["-y", "@modelcontextprotocol/server-filesystem", "/data"]
}
```

---

### Sync tools from an MCP server

```http
POST /v1/mcp/servers/:serverId/sync
```

Discovers and imports all tools the server exposes.

---

### List MCP server tools

```http
GET /v1/mcp/servers/:serverId/tools
```

---

### Browse the MCP marketplace

```http
GET /v1/mcp/servers/marketplace
```

Returns curated MCP servers you can connect with one click.

---

## Agent-to-Agent (A2A)

### Discover an agent's card

```http
GET /.well-known/agent.json?agentId=agent_abc123
```

Returns the agent's capability manifest:

```json
{
  "name": "Research Bot",
  "description": "I can summarize web pages and answer research questions",
  "url": "https://api.agentcommons.io/v1/a2a/agent_abc123",
  "skills": [
    { "id": "summarize", "name": "Summarize URL", "description": "..." }
  ]
}
```

---

### Send a task to another agent (JSON-RPC 2.0)

```http
POST /v1/a2a/:agentId
```

**Body:**
```json
{
  "jsonrpc": "2.0",
  "id": "req_1",
  "method": "tasks/send",
  "params": {
    "message": {
      "role": "user",
      "parts": [{ "type": "text", "text": "Summarize https://example.com" }]
    }
  }
}
```

---

### Stream a task to another agent

```http
GET /v1/a2a/:agentId/tasks/:taskId/stream
```

---

## Wallets

### Create a wallet for an agent

```http
POST /v1/wallets
```

**Body:**
```json
{
  "agentId": "agent_abc123",
  "walletType": "eoa",
  "label": "main"
}
```

---

### Get agent wallets

```http
GET /v1/wallets/agent/:agentId
```

---

### Check balance

```http
GET /v1/wallets/:walletId/balance
```

**Response:**
```json
{
  "walletId": "wallet_123",
  "address": "0xABC...",
  "usdc": "10.500000",
  "chainId": 84532
}
```

---

### Transfer funds

```http
POST /v1/wallets/:walletId/transfer
```

**Body:**
```json
{
  "to": "0xDEF...",
  "amount": "5.0",
  "token": "USDC"
}
```

---

## Memory

### Store a memory

```http
POST /v1/memory
```

**Body:**
```json
{
  "agentId": "agent_abc123",
  "memoryType": "semantic",
  "content": "The user prefers concise bullet-point summaries.",
  "tags": ["preferences", "formatting"]
}
```

---

### Retrieve relevant memories

```http
GET /v1/memory/agents/:agentId/retrieve?q=user+preferences
```

Returns memories ranked by semantic similarity to the query.

---

### List all memories for an agent

```http
GET /v1/memory/agents/:agentId
```

---

## OAuth

### List available OAuth providers

```http
GET /v1/oauth/providers
```

---

### Start an OAuth flow

```http
POST /v1/oauth/connect
```

**Body:**
```json
{
  "providerKey": "google",
  "agentId": "agent_abc123"
}
```

**Response:**
```json
{
  "authUrl": "https://accounts.google.com/o/oauth2/auth?..."
}
```

Redirect the user to `authUrl`. After they approve, they're redirected back and the token is stored.

---

### List OAuth connections

```http
GET /v1/oauth/connections
```

---

## Usage & Logs

### Get usage summary

```http
GET /v1/usage/summary
GET /v1/usage/agents/:agentId
```

---

### Stream live logs

```http
GET /v1/logs/stream
GET /v1/logs/agents/:agentId
```

SSE stream of log lines as they happen.

---

## Error responses

All errors follow this format:

```json
{
  "statusCode": 400,
  "error": "Bad Request",
  "message": "agentId is required"
}
```

Common status codes:

| Code | Meaning |
|---|---|
| `400` | Bad request — check your body/params |
| `401` | Unauthorized — missing or invalid API key |
| `403` | Forbidden — you don't own this resource |
| `404` | Not found |
| `429` | Rate limited — 120 requests/min per agent |
| `500` | Server error |

---

## Rate limits

- 120 requests per minute per agent
- Streaming endpoints don't count toward the rate limit
- Contact support to increase limits for production workloads

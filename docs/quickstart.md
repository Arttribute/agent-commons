# Quickstart

Get from zero to a running agent in under 5 minutes.

---

## Option 1: Web UI (no code)

1. Go to [agentcommons.io](https://www.agentcommons.io)
2. Connect your wallet using the **Sign In** button (powered by Privy — supports email, MetaMask, Coinbase Wallet)
3. Click **Create Agent** and fill in a name and instructions
4. Click the agent to open the chat and send your first message

That's it. Your agent is live.

---

## Option 2: REST API

### 1. Get an API key

In the web app, go to **Settings → API Keys** and create a key.

### 2. Create an agent

```bash
curl -X POST https://api.agentcommons.io/v1/agents \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -d '{
    "name": "My First Agent",
    "instructions": "You are a helpful assistant.",
    "modelProvider": "openai",
    "modelId": "gpt-4o"
  }'
```

**Response:**
```json
{
  "agentId": "agent_abc123",
  "name": "My First Agent",
  "modelProvider": "openai"
}
```

### 3. Run the agent

```bash
curl -X POST https://api.agentcommons.io/v1/agents/run \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -d '{
    "agentId": "agent_abc123",
    "messages": [{ "role": "user", "content": "Hello! What can you do?" }]
  }'
```

**Response:**
```json
{
  "sessionId": "session_xyz",
  "response": "Hi! I'm a helpful assistant. I can answer questions, help with writing, and more.",
  "usage": { "inputTokens": 24, "outputTokens": 18 }
}
```

---

## Option 3: TypeScript SDK

### Install

```bash
npm install @agent-commons/sdk
```

### Use

```typescript
import { CommonsClient } from '@agent-commons/sdk';

const client = new CommonsClient({
  apiUrl: 'https://api.agentcommons.io',
  apiKey: process.env.COMMONS_API_KEY,
});

// Create an agent
const agent = await client.agents.create({
  name: 'My First Agent',
  instructions: 'You are a helpful assistant.',
  modelProvider: 'openai',
  modelId: 'gpt-4o',
});

// Run it
const result = await client.agents.run({
  agentId: agent.agentId,
  messages: [{ role: 'user', content: 'Hello!' }],
});

console.log(result.response);
```

---

## Option 4: CLI

### Install

```bash
npm install -g @agent-commons/cli
```

### Set up credentials

```bash
agc login
```

A three-step wizard guides you through setup:

1. **API Endpoint** — press Enter to accept the default (`https://api.agentcommons.io`)
2. **API Key** — your browser opens automatically to agentcommons.io/settings. Generate a key and paste it back in the terminal.
3. **Wallet address** — paste your `0x…` address.

### Launch the interactive menu

```bash
agc
```

Use ↑ / ↓ to navigate, Enter to select. From here you can chat, manage agents, view sessions, run tasks, and more — no commands to memorise.

### Create an agent and start chatting

```bash
agc agents create
agc chat --agent <agentId>
```

Type messages and press Enter. Type `/quit` to exit (session is preserved for resume).

---

## Next steps

- [Configure your agent with tools and a custom model](./guides/agents.md)
- [Stream responses in real time](./api.md#streaming)
- [Build a multi-step workflow](./guides/workflows.md)
- [Schedule tasks to run automatically](./guides/tasks.md)

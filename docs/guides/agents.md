# Building Agents

Everything you need to know about creating and configuring agents.

---

## What makes a good agent

An agent is only as useful as its instructions and tools. Think of instructions as a job description: the more specific, the better. Tools give the agent capabilities beyond its training data.

---

## Creating an agent

### Via UI

Go to **Studio → Create Agent** and fill in the form.

### Via API

```bash
curl -X POST https://api.agentcommons.io/v1/agents \
  -H "x-api-key: YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Support Agent",
    "instructions": "You are a customer support agent for Acme Corp. Be polite and solution-focused. If you cannot solve an issue, escalate to a human.",
    "persona": "Friendly, empathetic, professional",
    "modelProvider": "openai",
    "modelId": "gpt-4o"
  }'
```

### Via SDK

```typescript
const agent = await client.agents.create({
  name: 'Support Agent',
  instructions: `You are a customer support agent for Acme Corp.
Be polite and solution-focused.
If you cannot solve an issue, escalate to a human.`,
  persona: 'Friendly, empathetic, professional',
  modelProvider: 'openai',
  modelId: 'gpt-4o',
});
```

---

## Model configuration

### Supported providers

| Provider | Popular models |
|---|---|
| `openai` | `gpt-4o`, `gpt-4o-mini`, `gpt-4-turbo`, `o1-mini` |
| `anthropic` | `claude-opus-4-6`, `claude-sonnet-4-6`, `claude-haiku-4-5-20251001` |
| `google` | `gemini-1.5-pro`, `gemini-1.5-flash`, `gemini-2.0-flash` |
| `groq` | `llama-3.3-70b-versatile`, `mixtral-8x7b-32768` |
| `mistral` | `mistral-large-latest`, `mistral-small-latest` |
| `ollama` | Any locally running model (set `baseUrl` to your Ollama server) |

### Key parameters

| Parameter | Default | Description |
|---|---|---|
| `temperature` | `0.7` | Creativity. `0` = deterministic, `1` = creative |
| `maxTokens` | `2048` | Maximum response length |
| `topP` | `1.0` | Nucleus sampling |
| `frequencyPenalty` | `0` | Reduce repetitive phrases |
| `presencePenalty` | `0` | Encourage exploring new topics |

### Bring your own API key (BYOK)

```json
{
  "modelProvider": "anthropic",
  "modelId": "claude-sonnet-4-6",
  "apiKey": "sk-ant-your-key-here"
}
```

Your key is stored encrypted and used only for this agent's calls.

### Using a local Ollama model

```json
{
  "modelProvider": "ollama",
  "modelId": "llama3.2",
  "baseUrl": "http://localhost:11434"
}
```

---

## Writing good instructions

Instructions are the system prompt. A few principles:

**Be specific about role and context:**
```
You are a financial analyst assistant for hedge fund managers.
You have access to real-time market data tools.
Always cite data sources and provide confidence levels.
```

**Define the output format:**
```
Always respond in this format:
1. Brief answer (1-2 sentences)
2. Supporting details (bullet points)
3. Caveats or limitations (if any)
```

**Set boundaries:**
```
You only answer questions about cooking. For off-topic questions,
politely redirect to culinary topics.
```

**Give examples for complex behaviors:**
```
When asked to compare two products:
- List 3 pros and 3 cons for each
- Provide a recommendation with reasoning
- Example: "For casual home use, Product A is better because..."
```

---

## Adding a knowledge base

The knowledge base lets you inject static information that the agent always has available, without it needing a tool call.

Good for: company FAQs, product specs, internal policies.

### Via UI

In Studio → Agent Editor → Knowledge Base tab, click **Add item** and paste in your content.

### Via API

```bash
curl -X PUT https://api.agentcommons.io/v1/agents/agent_abc123/knowledgebase \
  -H "x-api-key: YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "items": [
      {
        "title": "Refund Policy",
        "content": "Customers may request a full refund within 30 days of purchase. No questions asked."
      },
      {
        "title": "Contact Info",
        "content": "Support email: support@acme.com. Phone: +1-555-0100. Hours: 9am-5pm EST Mon-Fri."
      }
    ]
  }'
```

---

## Adding tools

Tools extend what your agent can do. 

### Enable built-in tools (via API)

```json
{
  "commonTools": ["web_scraper", "api_caller", "code_interpreter"]
}
```

### Add a custom tool

First create the tool, then link it to the agent:

```bash
# 1. Create the tool
curl -X POST https://api.agentcommons.io/v1/tools \
  -H "x-api-key: YOUR_KEY" \
  -d '{
    "name": "Weather Lookup",
    "description": "Get current weather for a city",
    "endpoint": "https://api.openweathermap.org/data/2.5/weather?q={{city}}&appid={{api_key}}"
  }'

# 2. Link to agent
curl -X POST https://api.agentcommons.io/v1/agents/agent_abc123/tools \
  -H "x-api-key: YOUR_KEY" \
  -d '{ "toolId": "tool_weather123" }'
```

### Connect MCP tools

```bash
# Connect MCP server
curl -X POST https://api.agentcommons.io/v1/mcp/servers \
  -H "x-api-key: YOUR_KEY" \
  -d '{ "name": "My MCP Server", "transportType": "sse", "url": "https://mcp.example.com/sse" }'

# Sync its tools
curl -X POST https://api.agentcommons.io/v1/mcp/servers/server_abc123/sync \
  -H "x-api-key: YOUR_KEY"
```

Once synced, agents can use the tools automatically.

---

## Autonomous mode

Autonomous mode lets an agent run on a schedule without a user sending messages. It's like a heartbeat — the agent wakes up, does its work, and goes back to sleep.

### Enable via UI

Studio → Agent Editor → Autonomy tab. Toggle on, set interval or cron.

### Enable via API

```bash
curl -X PUT https://api.agentcommons.io/v1/agents/agent_abc123/autonomy \
  -H "x-api-key: YOUR_KEY" \
  -d '{
    "autonomyEnabled": true,
    "cronExpression": "0 9 * * 1-5",
    "message": "Perform your daily check: review new tasks, summarize overnight activity."
  }'
```

### Trigger a heartbeat manually

```bash
curl -X POST https://api.agentcommons.io/v1/agents/agent_abc123/autonomy/trigger \
  -H "x-api-key: YOUR_KEY"
```

---

## Text-to-speech (TTS)

Agents can speak their responses:

```json
{
  "ttsProvider": "openai",
  "ttsVoiceId": "alloy"
}
```

Available voices vary by provider. List them:

```bash
GET /v1/agents/tts/voices
```

---

## Agent personas

The `persona` field is separate from `instructions`. Think of it as the character brief — tone, personality, communication style. The model uses it to color the way it speaks, without needing it embedded in every instruction.

```json
{
  "persona": "A witty, culturally curious travel writer who loves finding hidden gems and telling stories through food."
}
```

---

## Connecting OAuth services

If your agent needs to read Gmail, post to GitHub, or use any OAuth service:

1. In Studio → Agent Editor → Connections tab, click **Add Connection**
2. Choose the provider and authorize
3. The token is automatically injected when the agent uses that provider's tools

---

## Preferred agent connections (A2A)

You can specify which other agents this agent prefers to delegate to:

```bash
curl -X POST https://api.agentcommons.io/v1/agents/agent_abc123/preferred-connections \
  -H "x-api-key: YOUR_KEY" \
  -d '{
    "targetAgentId": "agent_researcher456",
    "skill": "web_research",
    "priority": 1
  }'
```

---

## Monitoring your agent

- **Logs**: `/v1/logs/agents/:agentId` or stream via `GET /v1/logs/stream`
- **Usage**: `/v1/usage/agents/:agentId` — token counts, response times, tool call stats
- **Sessions**: `/v1/agents/sessions/:sessionId/chat` — full conversation history

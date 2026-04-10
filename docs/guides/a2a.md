# Agent-to-Agent (A2A)

A2A lets agents communicate with each other — one agent can send a task to another agent and use its response, just like calling a tool.

---

## How it works

Every agent on Agent Commons publishes an **Agent Card** — a public JSON document describing what the agent can do, what skills it has, and how to contact it. Other agents (and external systems) can discover this card and send tasks to it using a JSON-RPC 2.0 protocol.

This enables:
- Specialized agents delegating to each other (a "manager" agent routing to specialists)
- External agents from other platforms interacting with your agents
- Multi-agent pipelines where each agent owns a specific domain

---

## Agent Card

Every agent automatically has a public card at:

```
GET /.well-known/agent.json?agentId=<agentId>
```

Example:

```json
{
  "name": "Research Bot",
  "description": "I specialize in web research and summarization.",
  "url": "https://api.agentcommons.io/v1/a2a/agent_abc123",
  "version": "1.0",
  "capabilities": {
    "streaming": true,
    "pushNotifications": false
  },
  "skills": [
    {
      "id": "web_research",
      "name": "Web Research",
      "description": "Research a topic on the web and return a summary",
      "inputSchema": {
        "topic": { "type": "string" }
      }
    }
  ]
}
```

---

## Defining skills

Skills are the capabilities you expose via A2A. Define them in your agent's settings:

### Via UI

Studio → Agent Editor → A2A tab → Add Skill

### Via API

```bash
curl -X PUT https://api.agentcommons.io/v1/agents/agent_abc123 \
  -H "x-api-key: YOUR_KEY" \
  -d '{
    "a2aSkills": [
      {
        "id": "summarize_url",
        "name": "Summarize URL",
        "description": "Fetch a URL and return a 3-bullet summary",
        "inputSchema": {
          "url": { "type": "string", "description": "URL to summarize" }
        }
      }
    ]
  }'
```

---

## Sending a task to another agent

Use the JSON-RPC 2.0 protocol to send work to another agent:

```bash
curl -X POST https://api.agentcommons.io/v1/a2a/agent_abc123 \
  -H "x-api-key: YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": "req_001",
    "method": "tasks/send",
    "params": {
      "message": {
        "role": "user",
        "parts": [
          {
            "type": "text",
            "text": "Summarize this URL: https://techcrunch.com/latest"
          }
        ]
      }
    }
  }'
```

**Response:**
```json
{
  "jsonrpc": "2.0",
  "id": "req_001",
  "result": {
    "taskId": "a2a_task_xyz",
    "status": "completed",
    "artifacts": [
      {
        "type": "text",
        "content": "• AI company raises $500M...\n• New model benchmark...\n• ...",
        "mimeType": "text/plain"
      }
    ]
  }
}
```

---

## Sending a task with file data

A2A messages support multiple part types — text, files, and structured data:

```json
{
  "jsonrpc": "2.0",
  "id": "req_002",
  "method": "tasks/send",
  "params": {
    "message": {
      "role": "user",
      "parts": [
        {
          "type": "text",
          "text": "Analyze this document and extract key findings."
        },
        {
          "type": "file",
          "mimeType": "application/pdf",
          "data": "base64-encoded-pdf-content"
        }
      ]
    }
  }
}
```

Message part types:

| Type | Fields | Use for |
|---|---|---|
| `text` | `text: string` | Text instructions |
| `file` | `mimeType`, `data` (base64) or `uri` | Binary files, documents |
| `data` | `data: object` | Structured JSON input |

---

## Streaming a task

For long-running tasks, use streaming to get incremental updates:

```bash
# Start the task
curl -X POST https://api.agentcommons.io/v1/a2a/agent_abc123 \
  -H "x-api-key: YOUR_KEY" \
  -d '{ "jsonrpc":"2.0","id":"1","method":"tasks/sendSubscribe","params":{...} }'

# Then stream updates (use the taskId from the response)
curl https://api.agentcommons.io/v1/a2a/agent_abc123/tasks/a2a_task_xyz/stream \
  -H "x-api-key: YOUR_KEY"
```

---

## List tasks sent to an agent

```bash
curl https://api.agentcommons.io/v1/a2a/agent_abc123/tasks \
  -H "x-api-key: YOUR_KEY"
```

---

## Setting up agent-to-agent connections

To make your agent automatically route to another, set up a preferred connection:

```bash
curl -X POST https://api.agentcommons.io/v1/agents/agent_manager/preferred-connections \
  -H "x-api-key: YOUR_KEY" \
  -d '{
    "targetAgentId": "agent_researcher",
    "skill": "web_research",
    "priority": 1
  }'
```

Now when `agent_manager` decides it needs web research, it knows to call `agent_researcher`.

---

## External agents

You can register agents that live outside of Agent Commons (on other platforms):

```
GET /v1/agents/external
```

These appear alongside your own agents and can be reached via the same A2A protocol, as long as their platform also implements the A2A spec.

---

## Multi-agent example

Here's a pattern for a manager/specialist setup:

```
User: "Write a blog post about quantum computing"
         │
         ▼
    Manager Agent
    ├── sends A2A task to Research Agent: "Research quantum computing"
    │         └── returns: 3 paragraphs of research
    ├── sends A2A task to Writing Agent: "Write blog post from research"
    │         └── returns: draft blog post
    └── returns final post to user
```

Each specialist is its own agent with focused instructions and tools. The manager orchestrates without knowing the details of how each specialist works.

---

## A2A from outside Agent Commons

If you're building an external agent and want to call an Agent Commons agent:

1. Fetch the agent card: `GET /.well-known/agent.json?agentId=<id>`
2. Read the `url` field — that's the A2A endpoint
3. POST your JSON-RPC 2.0 task to that URL
4. Include `x-api-key` in the header if the agent requires authentication

This is fully compatible with any A2A-compliant agent runtime.

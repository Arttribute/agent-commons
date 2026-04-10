# Workflows

Workflows let you chain multiple steps — tool calls, AI processing, data transformations — into a repeatable pipeline.

---

## When to use a workflow vs a task

| Use case | Recommended |
|---|---|
| Open-ended conversation | Agent session |
| Run a specific prompt once | Task (single mode) |
| Multi-step pipeline with defined I/O | **Workflow** |
| Scheduled recurring automation | Task with cron |
| Complex pipeline on a schedule | Task + Workflow |

---

## Workflow anatomy

A workflow has:
- **Nodes** — individual steps
- **Edges** — connections between steps, defining order and data flow
- **Input schema** — what data the workflow needs to start
- **Output schema** — what it produces when done

```
Input
  │
  ▼
[Node A] ──► [Node B] ──► [Node C]
                │
                ▼
             [Node D]
                │
                ▼
             Output
```

---

## Node types

### `tool` — call a tool

```json
{
  "id": "scrape_page",
  "type": "tool",
  "toolName": "web_scraper",
  "parameters": {
    "url": "{{inputs.url}}"
  }
}
```

The `{{inputs.url}}` syntax references the workflow's input. Use `{{nodeId.output}}` to reference a previous node's output.

---

### `agent_processor` — use an AI to process data

```json
{
  "id": "summarize",
  "type": "agent_processor",
  "prompt": "Summarize the following content in 5 bullet points:\n\n{{scrape_page.output}}"
}
```

---

### `data_transformer` — reshape data

```json
{
  "id": "extract_title",
  "type": "data_transformer",
  "mapping": {
    "title": "{{scrape_page.output.title}}",
    "url": "{{inputs.url}}"
  }
}
```

---

### `conditional` — branch based on a value

```json
{
  "id": "check_length",
  "type": "conditional",
  "condition": "{{scrape_page.output.length}} > 1000"
}
```

---

## Creating a workflow

### Simple 2-step example: Scrape and summarize

```bash
curl -X POST https://api.agentcommons.io/v1/workflows \
  -H "x-api-key: YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Scrape and Summarize",
    "description": "Takes a URL, scrapes the page, returns a summary",
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
          "prompt": "Summarize this page content in 3 bullet points:\n{{scrape.output}}"
        }
      ],
      "edges": [
        { "from": "scrape", "to": "summarize" }
      ]
    },
    "inputSchema": {
      "url": { "type": "string", "description": "URL to scrape" }
    },
    "outputSchema": {
      "summary": { "type": "string" }
    }
  }'
```

---

### 3-step pipeline: Research, write, save

```json
{
  "name": "Research and Write Article",
  "definition": {
    "nodes": [
      {
        "id": "search",
        "type": "tool",
        "toolName": "search",
        "parameters": { "query": "{{inputs.topic}} latest news 2026" }
      },
      {
        "id": "research",
        "type": "tool",
        "toolName": "web_scraper",
        "parameters": { "url": "{{search.output.firstResult.url}}" }
      },
      {
        "id": "write",
        "type": "agent_processor",
        "prompt": "Write a 500-word article about {{inputs.topic}} based on this research:\n{{research.output}}\n\nFormat: intro, 3 body paragraphs, conclusion."
      }
    ],
    "edges": [
      { "from": "search", "to": "research" },
      { "from": "research", "to": "write" }
    ]
  },
  "inputSchema": {
    "topic": { "type": "string" }
  }
}
```

---

## Executing a workflow

```bash
curl -X POST https://api.agentcommons.io/v1/workflows/workflow_abc123/execute \
  -H "x-api-key: YOUR_KEY" \
  -d '{ "inputs": { "url": "https://techcrunch.com/latest" } }'
```

**Response:**
```json
{
  "executionId": "exec_xyz",
  "status": "running",
  "startedAt": "2026-04-10T12:00:00Z"
}
```

---

## Streaming execution progress

```bash
curl https://api.agentcommons.io/v1/workflows/exec_xyz/stream \
  -H "x-api-key: YOUR_KEY"
```

You'll receive SSE events:

```
data: {"nodeId":"scrape","status":"running"}
data: {"nodeId":"scrape","status":"completed","output":"Page content here...","duration":1240}
data: {"nodeId":"summarize","status":"running"}
data: {"nodeId":"summarize","status":"completed","output":"• Point 1\n• Point 2\n• Point 3","duration":2100}
data: {"executionId":"exec_xyz","status":"completed","totalDuration":3340}
```

---

## Viewing execution history

```bash
curl https://api.agentcommons.io/v1/workflows/workflow_abc123/executions \
  -H "x-api-key: YOUR_KEY"
```

Each execution record shows status, start/end time, and the output of every node.

---

## Using the visual editor

In the web app:

1. Go to **Studio → Workflows → Create**
2. Click **Open Editor** to enter the canvas
3. **Add nodes** by clicking the `+` button or dragging from the sidebar
4. **Connect nodes** by clicking the output handle of one node and dragging to the input of another
5. **Configure each node** by clicking it — set tool name, parameters, or prompt
6. **Set inputs** by clicking the Inputs panel and defining expected parameters
7. **Run** directly from the editor to test

---

## Publishing and forking

Make a workflow public for others to discover and reuse:

```bash
curl -X PUT https://api.agentcommons.io/v1/workflows/workflow_abc123 \
  -H "x-api-key: YOUR_KEY" \
  -d '{ "isPublic": true, "category": "research" }'
```

Fork someone else's workflow:

```bash
curl -X POST https://api.agentcommons.io/v1/workflows/workflow_abc123/fork \
  -H "x-api-key: YOUR_KEY"
```

This creates a copy in your account that you can modify freely.

---

## Running a workflow on a schedule

Combine a workflow with a task:

```bash
curl -X POST https://api.agentcommons.io/v1/tasks \
  -H "x-api-key: YOUR_KEY" \
  -d '{
    "title": "Daily scrape-and-summarize",
    "agentId": "agent_abc123",
    "executionMode": "workflow",
    "workflowId": "workflow_abc123",
    "workflowInputs": { "url": "https://news.ycombinator.com" },
    "cronExpression": "0 7 * * *",
    "isRecurring": true
  }'
```

This runs the workflow every morning at 7am.

---

## SDK example

```typescript
// Create
const workflow = await client.workflows.create({
  name: 'Summarize URL',
  definition: {
    nodes: [
      { id: 'scrape', type: 'tool', toolName: 'web_scraper', parameters: { url: '{{inputs.url}}' } },
      { id: 'summarize', type: 'agent_processor', prompt: 'Summarize: {{scrape.output}}' },
    ],
    edges: [{ from: 'scrape', to: 'summarize' }],
  },
  inputSchema: { url: { type: 'string' } },
});

// Execute and stream
const execution = await client.workflows.execute(workflow.workflowId, {
  inputs: { url: 'https://example.com' },
});

for await (const event of client.workflows.stream(execution.executionId)) {
  if (event.nodeId) {
    console.log(`[${event.nodeId}] ${event.status}`);
    if (event.output) console.log(event.output);
  }
}
```

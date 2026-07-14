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
- **Edges** — typed field mappings between steps, defining order and data flow
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
  -H "Authorization: Bearer $AGENT_COMMONS_API_KEY" \
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
        {
          "id": "scrape-summary",
          "source": "scrape",
          "target": "summarize",
          "mapping": { "result.content": "data.content" },
          "targetTypes": { "data.content": "string" }
        }
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
  -H "Authorization: Bearer $AGENT_COMMONS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "inputData": { "url": "https://techcrunch.com/latest" } }'
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
curl -N https://api.agentcommons.io/v1/workflows/workflow_abc123/executions/exec_xyz/stream \
  -H "Authorization: Bearer $AGENT_COMMONS_API_KEY"
```

You'll receive SSE events:

```
data: {"type":"status","status":"running","currentNode":"scrape","nodeResults":{}}
data: {"type":"status","status":"running","currentNode":"summarize","nodeResults":{"scrape":{"status":"success"}}}
data: {"type":"completed","outputData":{"summary":"..."},"nodeResults":{}}
```

---

## Viewing execution history

```bash
curl https://api.agentcommons.io/v1/workflows/workflow_abc123/executions \
  -H "Authorization: Bearer $AGENT_COMMONS_API_KEY"
```

Each execution record shows status, start/end time, and the output of every node.

---

## Using the visual editor

In the web app:

1. Go to **Studio → Workflows → Create**
2. Click **Open Editor** to enter the canvas
3. **Add nodes** by clicking the `+` button or dragging from the sidebar
4. **Connect nodes** by dragging handles. Dynamic `any` values are resolved to the target type at runtime.
5. Open **Details → Edit** to map a precise upstream field to each input, add dotted fields such as `message.subject`, or expose nested result fields.
6. For agent steps, choose the workflow architecture, agent role, supervisor, handoff policy, and context/session policy under **Coordination**.
7. **Run** directly from the fixed action in the Run tab and inspect live node results under Logs.

Multiple edges may assemble one target object. For example, these mappings build
`message` from two different steps:

```json
[
  { "mapping": { "result.subject": "message.subject" }, "targetTypes": { "message.subject": "string" } },
  { "mapping": { "result.body": "message.body" }, "targetTypes": { "message.body": "string" } }
]
```

`targetTypes` is optional for exact mappings. When present, the executor performs
explicit JSON conversions and returns an actionable mapping error if a dynamic
value cannot be converted.

---

## Multi-agent coordination

Agent nodes support `sequential`, `hierarchical`, `peer_to_peer`, and `hybrid`
architectures. The graph still defines deterministic execution and handoff order;
agent configuration adds the collaboration contract:

```json
{
  "id": "researcher",
  "type": "agent_processor",
  "config": {
    "agentId": "agent_123",
    "architecture": "hierarchical",
    "role": "specialist",
    "reportsTo": "orchestrator",
    "handoffPolicy": "on_success",
    "contextPolicy": "shared",
    "sessionPolicy": "workflow",
    "checkIn": "after_step"
  }
}
```

Independent agent branches execute concurrently. Sequential edges provide direct
handoffs, `reportsTo` records hierarchy, and peer IDs are populated automatically
when peer-to-peer architecture is selected. Coordination metadata is attached to
each agent result for downstream steps and run monitoring.

---

## Poll, cancel, and approve from external systems

All workflow management and execution routes require a bearer API key and verify
workflow ownership. Webhook trigger URLs are the exception: they use a rotatable,
high-entropy secret embedded in the URL and store only its hash.

```bash
# Poll
curl https://api.agentcommons.io/v1/workflows/$WORKFLOW_ID/executions/$EXECUTION_ID \
  -H "Authorization: Bearer $AGENT_COMMONS_API_KEY"

# Cancel
curl -X POST https://api.agentcommons.io/v1/workflows/$WORKFLOW_ID/executions/$EXECUTION_ID/cancel \
  -H "Authorization: Bearer $AGENT_COMMONS_API_KEY"

# Resume a human-approval step
curl -X POST https://api.agentcommons.io/v1/workflows/$WORKFLOW_ID/executions/$EXECUTION_ID/approve \
  -H "Authorization: Bearer $AGENT_COMMONS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"approvalToken":"...","approvalData":{"reviewedBy":"ops"}}'
```

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

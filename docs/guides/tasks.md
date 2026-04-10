# Tasks & Scheduling

Tasks are the way to give agents discrete, trackable units of work — with support for scheduling, dependencies, and results storage.

---

## Task vs session

| | Session | Task |
|---|---|---|
| Initiated by | User typing a message | Code, scheduler, or manual trigger |
| Duration | Open-ended chat | Defined goal with completion |
| Tracking | Message history | Status, progress, results |
| Scheduling | Manual | Cron, one-time, dependency-based |

Use sessions for conversations. Use tasks for automation.

---

## Creating a task

### Minimal task (run now)

```bash
curl -X POST https://api.agentcommons.io/v1/tasks \
  -H "x-api-key: YOUR_KEY" \
  -d '{
    "title": "Summarize today'\''s news",
    "description": "Go to https://news.ycombinator.com, get the top 5 stories, and write a one-line summary of each.",
    "agentId": "agent_abc123",
    "executionMode": "single"
  }'
```

Then execute it:

```bash
curl -X POST https://api.agentcommons.io/v1/tasks/task_abc123/execute \
  -H "x-api-key: YOUR_KEY"
```

---

## Execution modes

### `single` — agent runs the description as a prompt

The description becomes the user message. The agent uses its tools and model to complete it.

```json
{
  "executionMode": "single",
  "description": "Write a Python function that parses a CSV file and returns a list of dicts."
}
```

### `workflow` — execute a defined workflow

```json
{
  "executionMode": "workflow",
  "workflowId": "workflow_abc123",
  "workflowInputs": { "url": "https://example.com" }
}
```

### `sequential` — run a list of sub-tasks in order

```json
{
  "executionMode": "sequential",
  "subtasks": [
    { "description": "Research the topic" },
    { "description": "Write a draft based on the research" },
    { "description": "Review and polish the draft" }
  ]
}
```

Each sub-task receives the output of the previous one as context.

---

## Scheduling

### One-time scheduled task

Run at a specific time:

```bash
curl -X POST https://api.agentcommons.io/v1/tasks \
  -H "x-api-key: YOUR_KEY" \
  -d '{
    "title": "Send weekly report",
    "description": "Compile this week'\''s metrics and write a summary email.",
    "agentId": "agent_abc123",
    "executionMode": "single",
    "scheduledFor": "2026-04-14T09:00:00Z"
  }'
```

### Recurring cron task

Use standard cron syntax:

```bash
curl -X POST https://api.agentcommons.io/v1/tasks \
  -H "x-api-key: YOUR_KEY" \
  -d '{
    "title": "Daily briefing",
    "description": "Summarize overnight activity.",
    "agentId": "agent_abc123",
    "executionMode": "single",
    "cronExpression": "0 8 * * 1-5",
    "isRecurring": true
  }'
```

Common cron patterns:

| Pattern | Meaning |
|---|---|
| `0 8 * * *` | Every day at 8am |
| `0 8 * * 1-5` | Weekdays at 8am |
| `*/30 * * * *` | Every 30 minutes |
| `0 9 * * 1` | Every Monday at 9am |
| `0 0 1 * *` | First of every month at midnight |

---

## Task dependencies

A task can wait for other tasks to finish before it runs:

```bash
# First, create the research task
curl -X POST https://api.agentcommons.io/v1/tasks \
  -H "x-api-key: YOUR_KEY" \
  -d '{
    "title": "Research topic",
    "description": "Research quantum computing recent breakthroughs.",
    "agentId": "agent_researcher",
    "executionMode": "single"
  }'
# → task_research123

# Then create a writing task that depends on it
curl -X POST https://api.agentcommons.io/v1/tasks \
  -H "x-api-key: YOUR_KEY" \
  -d '{
    "title": "Write article",
    "description": "Write a 500-word article using the research findings.",
    "agentId": "agent_writer",
    "executionMode": "single",
    "dependsOn": ["task_research123"]
  }'
```

The writing task won't start until the research task completes. The output of the research task is automatically passed as context.

---

## Tool constraints

Control which tools a task can use:

```json
{
  "toolConstraintType": "hard",
  "taskTools": ["web_scraper", "search"],
  "toolInstructions": "Only use the search tool to find sources. Do not make API calls."
}
```

| Constraint type | Behavior |
|---|---|
| `none` | Use all agent tools (default) |
| `soft` | Prefer listed tools, others allowed |
| `hard` | Only the listed tools, no others |

---

## Monitoring task progress

### Poll for status

```bash
curl https://api.agentcommons.io/v1/tasks/task_abc123 \
  -H "x-api-key: YOUR_KEY"
```

```json
{
  "taskId": "task_abc123",
  "title": "Summarize today's news",
  "status": "completed",
  "resultContent": "1. OpenAI releases new model...\n2. ...",
  "summary": "Completed news summary with 5 items.",
  "startedAt": "2026-04-10T08:00:01Z",
  "completedAt": "2026-04-10T08:00:15Z"
}
```

Task statuses: `pending` → `running` → `completed` / `failed` / `cancelled`

### Stream live updates

```bash
curl https://api.agentcommons.io/v1/tasks/task_abc123/stream \
  -H "x-api-key: YOUR_KEY"
```

SSE events:

```
data: {"status":"running","message":"Starting task execution..."}
data: {"status":"running","message":"Fetching HackerNews...","toolCall":"web_scraper"}
data: {"status":"running","message":"Generating summary..."}
data: {"status":"completed","result":"1. OpenAI releases..."}
```

### View in the UI

Go to **Studio → Tasks** or open `/studio/tasks/[taskId]` directly for a live dashboard view.

---

## SDK example

```typescript
// Create and schedule
const task = await client.tasks.create({
  title: 'Weekly report',
  description: 'Summarize this week\'s analytics data.',
  agentId: 'agent_abc123',
  executionMode: 'single',
  cronExpression: '0 17 * * 5', // Fridays at 5pm
  isRecurring: true,
});

// Execute now for testing
await client.tasks.execute(task.taskId);

// Stream progress
for await (const event of client.tasks.stream(task.taskId)) {
  console.log(event.status, event.message ?? '');
  if (event.status === 'completed') {
    console.log('Result:', event.result);
    break;
  }
}
```

---

## CLI example

```bash
# Create and execute interactively
agc task create \
  --title "Research quantum computing" \
  --description "Summarize the top 5 recent breakthroughs in quantum computing." \
  --agent agent_abc123

agc task execute task_abc123

# Watch it run
agc task stream task_abc123
```

---

## Priority levels

```json
{ "priority": "high" }
```

Priority values: `low`, `medium` (default), `high`, `critical`

Higher priority tasks are executed first when multiple tasks are queued for the same agent.

---

## Cancelling and retrying

```bash
# Cancel a running task
curl -X POST https://api.agentcommons.io/v1/tasks/task_abc123/cancel \
  -H "x-api-key: YOUR_KEY"

# Delete a task entirely
curl -X DELETE https://api.agentcommons.io/v1/tasks/task_abc123 \
  -H "x-api-key: YOUR_KEY"
```

To "retry" a failed task, execute it again:

```bash
curl -X POST https://api.agentcommons.io/v1/tasks/task_abc123/execute \
  -H "x-api-key: YOUR_KEY"
```

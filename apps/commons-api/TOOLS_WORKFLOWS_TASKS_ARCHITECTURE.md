# Tools → Workflows → Tasks Architecture

## 🎯 Overview

This document describes the **streamlined, elegant orchestration** of Tools, Workflows, and Tasks in Agent Commons.

**Core Principle:** Maximum functionality with minimum complexity.

---

## 📐 Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                          TOOLS                                  │
│  (Static Platform Tools + Dynamic User Tools)                  │
│  • Common tools (createGoal, interactWithAgent, etc.)          │
│  • User-created tools with API specs                           │
│  • Input/Output schemas for composition                        │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ↓
┌─────────────────────────────────────────────────────────────────┐
│                       WORKFLOWS                                 │
│  (Graphs of connected tools)                                   │
│  • Nodes: tools, agent_processor, input, output                │
│  • Edges: data flow with I/O mapping                           │
│  • Validation: cycle detection, reachability                   │
│  • Public/Private sharing and remixing                         │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ↓
┌─────────────────────────────────────────────────────────────────┐
│                         TASKS                                   │
│  (Executable units with optional workflows + scheduling)        │
│  • Single execution or workflow-based                           │
│  • Cron scheduling (recurring or one-time)                      │
│  • Dependency resolution (wait for other tasks)                 │
│  • Created by users OR agents                                   │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ↓
┌─────────────────────────────────────────────────────────────────┐
│                      runAgent()                                 │
│  (Agent execution engine)                                       │
│  • Picks up next executable task                                │
│  • Executes workflow if task has workflowId                     │
│  • Uses task-specific tools or agent defaults                   │
│  • Marks task complete when done                                │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🔧 Tools

**Definition:** Reusable functions that agents can call

**Types:**
1. **Static Platform Tools** (`common-tool.service.ts`)
   - Built-in tools all agents have access to
   - Examples: `interactWithAgent`, `createSpace`, `generateImage`
   - Defined via Typia (type-safe)

2. **Dynamic User Tools** (stored in `tool` table)
   - User-created tools with API specs
   - Can be public or private
   - Require API keys (managed securely)

**Key Features:**
- **Input/Output Schemas**: Define what data tools accept and return
- **Access Control**: Who can use which tools
- **Key Management**: Encrypted storage of API keys (user/agent-level)

**Schema:**
```typescript
tool {
  toolId, name, description
  schema (OpenAI function schema)
  apiSpec (how to call external APIs)
  inputSchema (for workflow composition)
  outputSchema (for workflow composition)
  visibility ('platform' | 'public' | 'private')
  ownerId, ownerType
}
```

---

## 🔄 Workflows

**Definition:** Directed Acyclic Graphs (DAGs) of connected tools

**Structure:**
```typescript
workflow {
  workflowId, name, description
  ownerId, ownerType

  definition: {
    startNodeId,
    endNodeId,
    nodes: [
      { id, type, toolId, position, config }
    ],
    edges: [
      { id, source, target, mapping }
    ]
  }

  inputSchema (workflow inputs)
  outputSchema (workflow outputs)
  actualOutputSchema (captured from first run)

  isPublic (shareable/remixable)
  category, tags
}
```

**Node Types:**
1. **`tool`** - Regular tool execution
2. **`agent_processor`** - Let agent think/process (no workflow recursion)
3. **`input`** - Workflow input node
4. **`output`** - Workflow output node

**Validation Rules:**
- ✅ Must have clear **start** and **end** nodes
- ✅ No cycles (enforced via DFS cycle detection)
- ✅ End node must be **reachable** from start node
- ✅ All tool nodes reference **valid tools**

**Public Workflows:**
- Discoverable by other users
- Can be forked/remixed
- Category + tags for organization

**Data Flow:**
```
Input Node → Tool A → Tool B → Agent Processor → Tool C → Output Node
          (output.x → input.y)          (analyze)
```

---

## ✅ Tasks

**Definition:** Executable units that agents work on

**New Design (Goals Removed):**
```typescript
task {
  taskId
  agentId, sessionId (required - tasks are per agent-session)

  title, description
  status ('pending' | 'running' | 'completed' | 'failed' | 'cancelled')
  priority

  // Execution mode
  executionMode ('single' | 'workflow' | 'sequential')

  // Workflow integration
  workflowId (optional)
  workflowInputs (data to pass to workflow)

  // Scheduling
  cronExpression ('*/5 * * * *' = every 5 mins)
  scheduledFor (one-time scheduled execution)
  isRecurring
  nextRunAt, lastRunAt

  // Dependencies
  dependsOn ([taskId, taskId, ...])

  // Overrides
  tools (optional tool list for this task)

  // Creation tracking
  createdBy, createdByType ('user' | 'agent')
}
```

**Key Changes from Old System:**
- ❌ **No more Goals** - Tasks are self-contained
- ✅ **Workflow integration** - Tasks can execute workflows
- ✅ **Cron scheduling** - Built into tasks (no separate autonomy service)
- ✅ **Dependencies** - Tasks can depend on other tasks
- ✅ **Agent-created** - Agents can create tasks for themselves

**Execution Modes:**

1. **`single`** - Execute once, agent picks it up via `runAgent`
2. **`workflow`** - Execute a workflow when triggered
3. **`sequential`** - Part of a sequence (agent-created todos)

**Scheduling:**

**One-time:**
```typescript
scheduledFor: new Date('2025-12-01T10:00:00Z')
```

**Recurring (Cron):**
```typescript
cronExpression: '*/5 * * * *'  // Every 5 minutes
cronExpression: '0 9 * * 1-5'  // 9 AM weekdays
isRecurring: true
```

**Dependencies:**
```typescript
dependsOn: [taskA.taskId, taskB.taskId]
// This task won't run until taskA and taskB are completed
```

---

## 🔄 Task Execution Flow

### 1. User Creates Task

```typescript
// Option A: Simple task
taskService.createTask({
  agentId,
  sessionId,
  title: 'Research DAO governance models',
  description: 'Find and summarize top 5 DAO governance models',
  executionMode: 'single',
  createdBy: userId,
  createdByType: 'user',
});

// Option B: Workflow task
taskService.createTask({
  agentId,
  sessionId,
  title: 'Generate weekly report',
  executionMode: 'workflow',
  workflowId: reportWorkflowId,
  workflowInputs: { week: 48, year: 2025 },
  cronExpression: '0 9 * * 1',  // Every Monday at 9 AM
  isRecurring: true,
  createdBy: userId,
  createdByType: 'user',
});

// Option C: Task with dependencies
taskService.createTask({
  agentId,
  sessionId,
  title: 'Analyze results',
  dependsOn: [researchTaskId, summaryTaskId],
  createdBy: agentId,
  createdByType: 'agent',
});
```

### 2. Agent Creates Task (While Running)

Inside `runAgent`, agent can create tasks for itself:

```typescript
// Agent uses createTask tool
await commonToolService.createTask({
  agentId,
  sessionId,
  title: 'Follow up with user tomorrow',
  scheduledFor: tomorrow9AM,
  createdBy: agentId,
  createdByType: 'agent',
});
```

### 3. Task Execution

**A. Cron-triggered:**
```
Cron fires → taskExecutionService.executeTask(taskId)
  → If workflow task: execute workflow
  → If single task: agent picks it up via runAgent
  → Mark complete
  → Update nextRunAt for recurring tasks
```

**B. Agent-triggered (sequential):**
```
runAgent() → taskExecutionService.getNextExecutableTask(agentId, sessionId)
  → Check dependencies
  → Return highest priority ready task
  → Execute
  → Mark complete
```

### 4. Workflow Execution Within Task

```
Task with workflowId
  → workflowService.executeWorkflow()
  → Validate workflow (no cycles)
  → Execute nodes in topological order
  → Map outputs to inputs between nodes
  → Return final output
  → Store in task.resultContent
```

---

## 🤖 Agent as Tool in Workflow

**Problem:** How to let agents process data in workflows without infinite loops?

**Solution: `agent_processor` Node Type**

```typescript
{
  id: 'think',
  type: 'agent_processor',
  config: {
    instruction: 'Analyze the search results and extract key insights',
    maxTokens: 500
  }
}
```

**Restrictions:**
- Cannot trigger another workflow
- Cannot create new sessions
- Limited to current session context
- Has timeout (max 2 minutes)
- Execution depth = 1 (no recursion)

**Use Cases:**
- Analyze data between tools
- Make decisions (route to different tools)
- Transform outputs
- Generate summaries

**Example Workflow:**
```
Search DAO proposals → Agent Processor → Summarize → Send Email
                    (extract key points)
```

---

## 🗑️ Removed Complexity

### Goals Table (Deprecated)

**Why removed:**
- Unnecessary abstraction
- Tasks can handle everything goals did
- Simpler data model
- Fewer database queries

**Migration:**
- Convert existing goals to tasks
- Update session queries to return tasks only

### Autonomy Service (Deprecated)

**Why removed:**
- Expensive (runs runAgent on cron regardless of work)
- Inflexible (agent-level cron, not task-level)
- Superseded by task-based scheduling

**Migration:**
- Convert autonomy cron to recurring tasks
- Delete autonomy module and service

---

## 🔐 Security Considerations

### 1. Workflow Recursion Prevention

- `agent_processor` nodes cannot trigger workflows
- Execution depth tracked and limited
- Timeout enforcement

### 2. Task Scheduling

- Cron expressions validated before scheduling
- Max execution time per task
- Failed tasks don't retry infinitely

### 3. Dependencies

- Circular dependencies detected during creation
- Max dependency chain depth

---

## 📊 Database Schema Summary

### New Tables:
- `workflow` - Workflow definitions
- `workflow_execution` - Workflow runs
- `tool_key` - Encrypted API keys
- `tool_permission` - Access control
- `tool_execution_log` - Audit trail

### Enhanced Tables:
- `task` - Now with workflows, cron, dependencies
- `tool` - Now with I/O schemas and visibility

### Deprecated Tables:
- ~~`goal`~~ - Replaced by tasks
- ~~`task_dependency`~~ - Now uses `dependsOn` array

---

## 🚀 Usage Examples

### Example 1: Simple Todo List

Agent creates sequential tasks for itself:

```typescript
// Agent running in session
await createTask({
  title: 'Research topic',
  priority: 3,
  createdBy: agentId,
  createdByType: 'agent',
});

await createTask({
  title: 'Write summary',
  dependsOn: [researchTaskId],
  priority: 2,
  createdBy: agentId,
  createdByType: 'agent',
});

// runAgent() will pick them up in order
```

### Example 2: Scheduled Workflow

User creates recurring report workflow:

```typescript
await createTask({
  title: 'Weekly DAO Activity Report',
  executionMode: 'workflow',
  workflowId: daoReportWorkflowId,
  workflowInputs: { lookbackDays: 7 },
  cronExpression: '0 9 * * 1', // Every Monday 9 AM
  isRecurring: true,
  createdBy: userId,
  createdByType: 'user',
});
```

### Example 3: Workflow with Agent Processor

```typescript
const workflow = {
  startNodeId: 'input',
  endNodeId: 'output',
  nodes: [
    { id: 'input', type: 'input' },
    {
      id: 'search',
      type: 'tool',
      toolId: semanticSearchToolId
    },
    {
      id: 'analyze',
      type: 'agent_processor',
      config: {
        instruction: 'Extract top 3 insights from search results',
        maxTokens: 300
      }
    },
    {
      id: 'format',
      type: 'tool',
      toolId: formatReportToolId
    },
    { id: 'output', type: 'output' }
  ],
  edges: [
    { source: 'input', target: 'search' },
    { source: 'search', target: 'analyze', mapping: { 'results': 'data' } },
    { source: 'analyze', target: 'format', mapping: { 'insights': 'content' } },
    { source: 'format', target: 'output' }
  ]
};
```

---

## 🎨 Frontend Integration

### Workflow Builder UI

**Components needed:**
1. **Canvas** - Drag-and-drop node editor
2. **Tool Palette** - Available tools to add
3. **Property Panel** - Configure selected node
4. **Connection Handler** - Draw edges between nodes
5. **Validation Indicator** - Show cycle detection results

**Libraries:**
- React Flow / React Diagrams for graph editor
- Monaco Editor for JSON schema editing

### Task Management UI

**Views needed:**
1. **Task List** - All tasks for session
2. **Task Calendar** - Scheduled tasks
3. **Dependency Graph** - Visual task dependencies
4. **Execution History** - Past task runs

---

## 📝 Migration Checklist

- [ ] Run database migration (add new tables/columns)
- [ ] Convert existing goals to tasks
- [ ] Update session queries (remove goal references)
- [ ] Delete autonomy service
- [ ] Convert autonomy crons to recurring tasks
- [ ] Update agent.service.ts runAgent method
- [ ] Test workflow cycle detection
- [ ] Test task dependency resolution
- [ ] Test cron scheduling
- [ ] Update API endpoints

---

## 🧪 Testing Scenarios

1. **Cycle Detection:**
   - Create workflow with A → B → C → A
   - Should reject with error

2. **Task Dependencies:**
   - Create Task B depends on Task A
   - Task B should not execute until Task A completes

3. **Cron Scheduling:**
   - Create recurring task with `*/1 * * * *`
   - Verify executes every minute

4. **Workflow Execution:**
   - Create workflow with 3 tools
   - Verify data flows correctly between nodes

5. **Agent Processor:**
   - Include agent_processor node in workflow
   - Verify it cannot trigger another workflow

---

## 📚 Key Services

| Service | Purpose | Location |
|---------|---------|----------|
| `ToolLoaderService` | Load tools for agents | `tool/tool-loader.service.ts` |
| `WorkflowService` | Workflow CRUD + validation | `tool/workflow.service.ts` |
| `WorkflowExecutorService` | Execute workflows | `tool/workflow-executor.service.ts` |
| `TaskExecutionService` | Task execution + scheduling | `task/task-execution.service.ts` |
| `ToolKeyService` | Key management | `tool/tool-key.service.ts` |
| `ToolAccessService` | Access control | `tool/tool-access.service.ts` |

---

## 🎯 Design Principles

1. **Minimal Abstractions** - Tools, Workflows, Tasks. That's it.
2. **Clear Boundaries** - Each layer has a specific purpose
3. **No Loops** - Workflows are DAGs, no infinite recursion
4. **Flexible Scheduling** - Cron built into tasks
5. **Dependency Resolution** - Tasks wait for dependencies
6. **Secure by Default** - Keys encrypted, access controlled
7. **Frontend-Ready** - Structured for visual editors

---

**Version:** 2.0.0
**Last Updated:** 2025-11-27
**Status:** ✅ Implementation Complete

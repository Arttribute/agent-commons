# AGENT COMMONS — MASTER PLAN
> Version 1.4 — March 2026 | Phases 1–5 complete. Next: Skills system, Auth hardening, Tests, Observability.
> A comprehensive review, critique, and forward roadmap for the Agent Commons platform.

---

## TABLE OF CONTENTS

1. [Vision](#1-vision)
2. [Critical Review of Current Implementation](#2-critical-review-of-current-implementation)
   - 2.1 What Has Been Done Well
   - 2.2 What Is Bad / Broken
   - 2.3 What Needs Improvement
3. [Industry Context: The 2026 Agent Landscape](#3-industry-context-the-2026-agent-landscape)
4. [Architecture Principles for V2](#4-architecture-principles-for-v2)
5. [Complete System Plan](#5-complete-system-plan)
   - 5.1 Multi-Model Provider System
   - 5.2 Agent Wallet — Owner-Controlled Architecture
   - 5.3 OpenClaw / Open Agent Standards Compliance
   - 5.4 Terminal CLI Interface
   - 5.5 Workflow Engine V2
   - 5.6 Task System V2
   - 5.7 Tool System V2
   - 5.8 MCP System V2
   - 5.9 Skills System
   - 5.10 Memory System
   - 5.11 Agent Observability & Cost Tracking
   - 5.12 Multi-Agent Coordination
   - 5.13 API V2 Design
6. [Migration & Phased Rollout](#6-migration--phased-rollout)
7. [Tech Stack Decisions](#7-tech-stack-decisions)

---

## 1. VISION

Agent Commons is a **decentralized, open, composable AI agent platform** where:

- Any user can create, run, and monetize AI agents
- Agents operate autonomously — browsing the web, calling APIs, executing workflows, transacting on-chain
- Agents are first-class citizens: they own wallets, earn tokens, publish resources, and collaborate
- The system is model-agnostic: users bring their own API keys and choose their own LLM
- The platform is open-standards compliant: MCP, A2A, SKILL.md, AGENTS.md
- Agent owners retain full custody of their agent's private keys — the platform never holds them
- The platform is accessible from a web UI, an API, and a terminal CLI

The north star is a **commons of intelligent agents** — open, interoperable, self-sustaining, and owned by their creators.

---

## 2. CRITICAL REVIEW OF CURRENT IMPLEMENTATION

### 2.1 What Has Been Done Well

#### Architecture & Code Quality
- **Clean module-based NestJS architecture**: Services, controllers, and DTOs are well separated. Each domain (tool, workflow, task, mcp, oauth, space) has its own module — the project is ready to split into microservices if needed.
- **Drizzle ORM with PostgreSQL**: Solid choice. Typed queries, lightweight, and migration-friendly. The schema is comprehensive and well-designed.
- **Workflow DAG engine**: The topological sort + cycle detection implementation in `WorkflowExecutorService` is technically solid. Kahn's algorithm for topological ordering and DFS-based cycle detection are the correct approaches. The execution record tracking with `nodeResults` JSONB is a good pattern.
- **Unified Tool Loader**: `ToolLoaderService` is an excellent abstraction — it unifies static, dynamic, MCP, and space tools behind a single interface with a well-defined precedence order. This is the right pattern.
- **Tool permission system**: The combination of `ToolAccessService` + `ToolKeyService` + `ToolPermission` table gives a clean separation between "can this entity use this tool" and "what API key should be used for this tool."
- **MCP integration**: The MCP module is well-structured — server CRUD, connection management, tool discovery/sync, and invocation are cleanly separated. The sync process (add/update/remove tools) is correct.
- **OAuth system**: Multi-provider OAuth with token injection into tool calls is sophisticated and well-designed. Token injection at the tool execution layer is the right abstraction boundary.
- **Smart contract integration**: On-chain registry, ERC20 token, ERC1155 resources, task rewards, and attribution tracking form a coherent on-chain economy.
- **Space system with RTC**: WebRTC-based real-time spaces with speech-to-text and TTS is an ambitious and well-executed feature.
- **LangGraph for agent state**: Using LangGraph with `PostgresSaver` for persistent checkpointing is industry best practice.
- **Task dependency resolution**: The `getNextExecutable` pattern with dependency checking and priority ordering is the right design for a task queue.

#### Documentation
- Multiple comprehensive implementation docs (IMPLEMENTATION_SUMMARY.md, TASK-SYSTEM-IMPLEMENTATION.md, TOOLS_WORKFLOWS_TASKS_ARCHITECTURE.md) show strong knowledge capture.
- The schema is well-named and self-documenting.

---

### 2.2 What Is Bad / Broken

#### CRITICAL: Single LLM Provider Lock-In
The entire agent execution system is hardcoded to OpenAI via LangChain. The `agent` table stores LLM params (`temperature`, `maxTokens`, `topP`) but the model is always OpenAI GPT-4o. There is no provider abstraction layer. This is a fundamental architectural problem that affects every user and makes multi-model support impossible without a major refactor.

**Specific issues:**
- `AgentService` directly instantiates `ChatOpenAI` — no interface, no factory
- Session `model` field is `{name: string}` JSONB with no provider field
- No API key management for end-user LLM keys (only platform key)
- Users cannot bring their own OpenAI/Anthropic/Google key

#### CRITICAL: Platform Holds Agent Private Keys
The current implementation creates Coinbase MPC wallets during agent creation and stores the `WalletData` export (including private key material) directly in the `agent.wallet` JSONB column. This means:

- The platform has access to every agent's private key material
- If the database is compromised, every agent's wallet is compromised
- Agent owners cannot manage their own keys
- There is no way for an owner to revoke the platform's access to their agent's wallet
- This violates the core principle of a decentralized commons

#### Workflow System: Sequential-Only Execution
The `WorkflowExecutorService` executes nodes sequentially even when the topology allows parallelism. In a DAG workflow, independent branches should execute concurrently. The current implementation processes nodes one-by-one which means a workflow with two independent API calls takes 2x as long as it should.

#### Workflow System: No Conditional Branching
There are no `condition` node types. Workflows cannot take different paths based on runtime data. This severely limits the expressiveness of the workflow system. Any real-world automation workflow needs `if/else` branches.

#### Workflow System: Agent Processor Nodes are Placeholder
The `agent_processor` node type in the workflow definition is referenced but the execution logic is not implemented. The executor has no handler for agent processor nodes. This means any workflow using AI decision-making inside the graph cannot function.

#### Task System: Cron Execution Not Production-Ready
The cron scheduling in `TaskExecutionService` uses in-memory cron jobs (likely node-cron or similar). These jobs are lost on service restart. In a cloud deployment (Cloud Run, where the API currently runs), container restarts are common. All scheduled tasks are lost on restart.

#### MCP: No Connection Pooling / Health Checks
Each MCP tool invocation creates a new connection to the MCP server. For `stdio` transport, this means spawning a new child process for each tool call. For `sse`, this means establishing a new HTTP connection. This is expensive and does not scale. There are no connection pools, no health check loops, and no automatic reconnection.

#### Static Tools via Typia: Fragile Build Pipeline
The static tool definitions are generated via Typia LLM application at build time. This means any change to a static tool function signature requires a rebuild. Typia's LLM application feature is also poorly documented and introduces a complex build-time transformation dependency (`ts-patch`). This is hard to maintain.

#### No Streaming Responses
Agent execution returns a complete response only after the full LangGraph run completes. For long-running agents, the user sees a blank screen for potentially minutes. There is no SSE streaming of agent messages/tokens to the frontend.

#### Missing: Rate Limiting, Quotas, and Circuit Breakers
No rate limiting on tool execution (a single agent could call an external API thousands of times). No per-user/per-agent token quotas. No circuit breakers to stop runaway agents. These are essential for a multi-tenant production system.

#### Frontend/Backend API Duplication
Every Next.js `/api` route is a thin wrapper that does nothing but proxy to the NestJS backend. This doubles the network hops for every API call and adds latency. The frontend should call the NestJS API directly via environment variables.

---

### 2.3 What Needs Improvement

#### Agent Architecture: LangGraph Version
The codebase uses `@langchain/langgraph@0.2.63`, which is a pre-stable version. LangGraph v1.0 (stable) was released in late 2025 with no-breaking-change commitments. Migration to v1.0 is needed for production stability.

#### Tool Discovery & Marketplace
The tool system has all the database infrastructure for a marketplace (ratings, usage counts, visibility, categories) but there is no discovery UI or ranking algorithm. The `discoverPublicWorkflows` endpoint exists for workflows but there is no equivalent for tools.

#### Workflow Editor: No Undo/Redo
The React Flow editor has no undo/redo stack. This is a UX regression from basic text editing and makes the workflow editor frustrating to use.

#### Session Model: Weak Model Config
The `session.model` field is `{name: string}` JSONB. It needs to hold: `provider`, `modelId`, `temperature`, `maxTokens`, `topP`, `apiKey (encrypted)`, `baseUrl` (for custom endpoints / Ollama).

#### Error Messages: Too Generic
`workflow-executor.service.ts` throws generic errors like "Tool execution failed" without the underlying error details. These need structured error objects with `toolName`, `nodeId`, `originalError`, and `retryable` boolean for effective debugging.

#### Database: Missing Indexes
The `workflow_execution` table has no index on `(workflowId, status)`. Querying active executions for a workflow requires a full table scan. Similar issues exist on the `task` table for `(agentId, status)` queries.

#### Security: Encrypted Keys at Rest
`toolKey.encryptedValue` stores API keys — but the encryption service needs an audit. The key derivation and storage pattern should be reviewed to ensure keys are encrypted with a proper KDF (not just base64 encoded).

#### Test Coverage: Gaps
The test files that exist are mostly integration stubs. Core business logic (workflow cycle detection, topological sort, task dependency resolution) needs unit test coverage. There is no CI/CD test gate.

---

## 3. INDUSTRY CONTEXT: THE 2026 AGENT LANDSCAPE

This section summarizes the key industry developments that inform the V2 architecture.

### 3.1 Dominant Frameworks
- **LangGraph v1.0**: Now stable. Best for stateful, cyclic, graph-based agent workflows with precise execution control. The right choice to continue using for our orchestration layer.
- **Claude Agent SDK**: Anthropic's production SDK for building agents powered by Claude. Runs on Bedrock and Vertex in addition to the Anthropic API. The `query()` generator model with subagents, skills, and hooks is the architecture we should emulate for our own agent runtime.
- **OpenAI Agents SDK**: Agents + Handoffs + Guardrails. Provider-agnostic via LiteLLM.
- **CrewAI**: Role-based teams, fastest execution, best for collaborative multi-agent tasks.
- **PydanticAI**: Type-safe, model-agnostic, dependency-injected. Strong Python ecosystem choice.
- **OpenClaw**: Self-hosted, MCP-native, local-first. 300k+ stars. The standard-bearer for open agent platforms.

### 3.2 Standards That Are Now Non-Negotiable
- **MCP (Model Context Protocol)**: Donated to Linux Foundation. Every framework supports it. It is the standard for agent-to-tool connectivity. We already implement it — we need to complete the implementation (resources, prompts, streamable HTTP transport).
- **A2A (Agent2Agent Protocol)**: Google-originated, now Linux Foundation. 50+ enterprise endorsements. Enables agent-to-agent communication across frameworks. We need to implement this for multi-agent coordination.
- **SKILL.md Format**: Standardized by OpenClaw/Anthropic. A YAML-frontmatter Markdown file describing a skill. OpenAI has also adopted this. We need a skills system using this format.
- **AGENTS.md Convention**: Project-level context file loaded into agent system prompt. An open standard for declaring agent capabilities and project context.
- **OpenTelemetry GenAI Semantic Conventions**: The standard for agent observability. Every major platform uses it.

### 3.3 Multi-Model Provider Patterns
- **LiteLLM** is the dominant universal provider adapter (100+ models, OpenAI-compatible interface).
- The pattern is a `ModelProvider` interface + per-provider adapter classes.
- **Intelligent routing**: Route to cheap models for simple tasks, frontier models for complex reasoning.
- **37% of enterprises** use 5+ models in production in 2026.
- Users expect **BYOK** (Bring Your Own Key) — they should pay their own API bills.

### 3.4 Wallet Management Evolution
- **ERC-4337 Account Abstraction** with session keys is the standard for agent wallets.
- **The owner holds the master key**; agents get scoped, revocable session keys.
- **ZeroDev** (ERC-4337 + ERC-7579), **Privy Delegated Actions**, **Lit Protocol Vincent**, and **Turnkey** are the leading solutions.
- Coinbase MPC where the platform holds a key share is no longer acceptable for a decentralized commons.

### 3.5 Terminal CLI as a First-Class Interface
- Claude Code, Codex CLI, Aider, Cursor CLI — all major agent platforms now support terminal interfaces.
- The REPL-style agent loop with streaming output, diff-based edits, and sandboxed shell execution is the expected pattern.
- Agents must be runnable from the terminal without a browser.

### 3.6 Skills: The Modular Capability Pattern
- OpenClaw's ClawHub has 3,200+ MCP skills. Vercel's `skills.sh` has 20k+ installs.
- The SKILL.md format (YAML frontmatter + Markdown instructions) is the emerging standard.
- Progressive disclosure: scan 100-token metadata at startup, load full 5k-token instructions only when needed.
- This is the right architecture for our tool/capability system.

---

## 4. ARCHITECTURE PRINCIPLES FOR V2

1. **Provider Agnostic First**: No hardcoded LLM provider anywhere. Every LLM call goes through a `ModelProvider` interface.
2. **Owner-Controlled Keys**: The platform never stores or has access to agent private keys. Agents use delegated session keys granted by their owner.
3. **Open Standards Compliant**: MCP, A2A, SKILL.md, AGENTS.md, OpenTelemetry GenAI — use the standard, not a proprietary equivalent.
4. **Progressive Disclosure**: Don't load everything into context. Skills, tools, and prompts are discovered progressively based on relevance.
5. **Streaming First**: Every agent run streams tokens and tool events to the client in real-time.
6. **BYOK (Bring Your Own Key)**: Users supply their own LLM API keys. The platform does not pay for user inference.
7. **Parallelism by Default**: Workflow nodes with no data dependencies execute concurrently.
8. **Persistent Scheduling**: Cron jobs and recurring tasks are stored durably in the database, not in-memory.
9. **CLI as a First-Class Citizen**: Everything possible in the web UI is possible from the terminal.
10. **Observability Built-In**: Every agent run emits traces, metrics, and structured logs in OpenTelemetry format.

---

## 5. COMPLETE SYSTEM PLAN

---

### 5.1 Multi-Model Provider System

#### Problem
The entire system is hardcoded to OpenAI. Users cannot use Claude, Gemini, Mistral, or local models.

#### Design

**Model Provider Abstraction**

Define a `ModelProvider` interface that every LLM adapter implements:

```typescript
// apps/commons-api/src/modules/model-provider/model-provider.interface.ts

interface ModelProviderConfig {
  provider: 'openai' | 'anthropic' | 'google' | 'mistral' | 'groq' | 'ollama' | 'custom';
  modelId: string;             // e.g., "gpt-4o", "claude-sonnet-4-6", "gemini-2.0-flash"
  apiKey?: string;             // User's own key (BYOK)
  baseUrl?: string;            // For Ollama or custom OpenAI-compatible endpoints
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  contextWindow?: number;      // Model's context limit
}

interface StreamEvent {
  type: 'token' | 'tool_use' | 'tool_result' | 'done' | 'error';
  content?: string;
  toolCall?: { id: string; name: string; args: Record<string, any> };
  toolResult?: { id: string; content: string };
  error?: string;
}

interface ModelProvider {
  readonly config: ModelProviderConfig;

  // Non-streaming completion
  complete(messages: Message[], tools?: ToolDefinition[]): Promise<ModelResponse>;

  // Streaming completion — yields events
  stream(messages: Message[], tools?: ToolDefinition[]): AsyncGenerator<StreamEvent>;

  // Count tokens (for budget/routing decisions)
  countTokens(messages: Message[]): Promise<number>;
}
```

**Provider Implementations**

Create adapter classes for each provider:

```
apps/commons-api/src/modules/model-provider/
├── model-provider.module.ts
├── model-provider.factory.ts       # Creates provider from config
├── model-provider.interface.ts
├── providers/
│   ├── openai.provider.ts          # Wraps LangChain ChatOpenAI
│   ├── anthropic.provider.ts       # Wraps LangChain ChatAnthropic
│   ├── google.provider.ts          # Wraps LangChain ChatGoogleGenerativeAI
│   ├── mistral.provider.ts
│   ├── groq.provider.ts
│   └── ollama.provider.ts          # Wraps ChatOllama (local models)
└── model-registry.ts               # Catalogue of models + capabilities + pricing
```

**Model Registry**

Maintain a catalog of supported models with their capabilities and pricing for cost tracking and routing:

```typescript
const MODEL_REGISTRY: ModelRegistryEntry[] = [
  {
    provider: 'anthropic',
    modelId: 'claude-sonnet-4-6',
    displayName: 'Claude Sonnet 4.6',
    contextWindow: 200000,
    supportsTools: true,
    supportsStreaming: true,
    inputPricePer1kTokens: 0.003,
    outputPricePer1kTokens: 0.015,
    tier: 'frontier',
  },
  {
    provider: 'openai',
    modelId: 'gpt-4o',
    // ...
  },
  {
    provider: 'ollama',
    modelId: 'llama3.2',
    contextWindow: 128000,
    inputPricePer1kTokens: 0,      // Local = free
    outputPricePer1kTokens: 0,
    tier: 'local',
  },
  // ... all supported models
];
```

**Session Model Config Update**

Update the `session.model` JSONB to hold full provider config:

```typescript
// New session model field schema
interface SessionModelConfig {
  provider: string;
  modelId: string;
  apiKey?: string;          // Encrypted at rest; user's BYOK key
  baseUrl?: string;         // For Ollama / custom endpoints
  temperature?: number;
  maxTokens?: number;
  topP?: number;
}
```

**Agent Model Config Update**

Add provider fields to the `agent` table:
- `modelProvider` (string, default `'openai'`)
- `modelId` (string, default `'gpt-4o'`)
- `modelApiKey` (encrypted string, nullable — uses platform key if null)
- `modelBaseUrl` (string, nullable)

**Intelligent Model Routing (Optional, Phase 2)**

Implement a `ModelRouter` that selects the optimal model based on:
- Task complexity score (simple query → Haiku/GPT-4o-mini, complex reasoning → Opus/o3)
- User's token budget for the session
- Provider availability (health check fallback)
- Tool requirements (not all models support all tool schemas)

**Frontend: Model Selector**

Add a model selector component to the agent creation and session configuration UI:
- Group models by provider
- Show context window, pricing, and capability badges (tools, vision, streaming)
- BYOK: if user enters their own API key for a provider, use it; otherwise fall back to platform key (with cost attribution)

---

### 5.2 Agent Wallet — Owner-Controlled Architecture

#### Problem
The platform stores `WalletData` (including private key material) in the `agent.wallet` JSONB column. This is a centralized custody model that violates decentralized commons principles and creates a single point of failure.

#### Design: Three-Tier Wallet Architecture

We support three wallet models, in order of preference:

**Tier 1: ERC-4337 Smart Account with Session Keys (Recommended)**

The agent owner deploys an ERC-4337 smart account (via ZeroDev Kernel) that they own with their personal key. They grant the Agent Commons platform a time-limited, scoped session key.

```
Owner EOA (master key, held by owner only)
    └── Smart Account (ERC-4337 Kernel contract, deployed on Base)
            ├── Owner Validator (full permissions, held by owner)
            └── Session Key Validator (scoped permissions, held by platform per-agent)
                    ├── Call Policy: allowed_contracts[], allowed_functions[]
                    ├── Rate Limit Policy: max 0.1 ETH/day
                    └── Expiry: timestamp-based, renewable by owner
```

Implementation:
- Use ZeroDev Kernel SDK for smart account creation
- The platform generates session keys (ephemeral keypairs) per agent
- The platform presents the session key + permission params to the owner for a single signature approval
- The signed session key is stored in the database (it's safe to store — it has limited permissions)
- Agent transactions use the session key to submit UserOperations
- Owner can revoke at any time by calling the smart account's revoke function (no platform involvement needed)
- Platform NEVER sees or stores the owner's master key

**Tier 2: Privy Delegated Actions (For Web3 Onboarding)**

For users who are onboarded via Privy (already integrated), use Privy's Delegated Actions model:
- User creates a Privy embedded wallet (they own it)
- User grants the agent a Privy delegated action policy (spending limits, allowed protocols)
- Agent uses the delegated action credential to sign transactions
- User can revoke via Privy dashboard

**Tier 3: Turnkey Server Wallets (For Enterprise / Backend Agents)**

For agents that are programmatically created without an active user session (API-first, programmatic creation):
- Use Turnkey to provision a server wallet
- The wallet is tied to a Turnkey policy that the customer (API key holder) controls
- Turnkey's TEE architecture ensures Turnkey itself cannot access the key
- Policy rules enforce transaction limits and allowed operations

#### Database Changes

```sql
-- Remove wallet JSONB from agent table (contains private keys!)
ALTER TABLE agent DROP COLUMN wallet;

-- Add new wallet reference table
CREATE TABLE agent_wallet (
  wallet_id       TEXT PRIMARY KEY,
  agent_id        TEXT NOT NULL REFERENCES agent(agent_id),
  wallet_type     TEXT NOT NULL,  -- 'erc4337_session_key' | 'privy_delegated' | 'turnkey'

  -- For ERC-4337 session keys
  smart_account_address  TEXT,         -- The smart contract wallet address (public, safe to store)
  session_key_address    TEXT,         -- Session key public address (safe to store)
  session_key_encrypted  TEXT,         -- Encrypted session private key (limited permissions)
  session_permissions    JSONB,        -- Call policy, rate limits, expiry
  session_expires_at     TIMESTAMP,

  -- For Privy
  privy_wallet_id        TEXT,
  privy_policy_id        TEXT,

  -- For Turnkey
  turnkey_wallet_id      TEXT,
  turnkey_policy_id      TEXT,

  chain_id        TEXT DEFAULT 'base-sepolia',
  wallet_address  TEXT NOT NULL,       -- The public address (all wallet types)
  is_active       BOOLEAN DEFAULT TRUE,
  created_at      TIMESTAMP DEFAULT NOW(),
  last_used_at    TIMESTAMP
);
```

#### Migration from Current System

1. Export all current `agent.wallet` data to a secure vault (one-time migration)
2. For existing agents, contact owners to re-authorize via the new session key flow
3. Offer a migration assistant in the UI: "Upgrade your agent's wallet to self-custody"
4. After a sunset period, remove the `wallet` column from the `agent` table

---

### 5.3 OpenClaw / Open Agent Standards Compliance

We align with the standards used by OpenClaw and the broader open agent ecosystem.

#### MCP: Complete the Implementation

Current gaps to close:
- **Streamable HTTP transport**: Implement alongside existing stdio/SSE (required for MCP 2025-11-25 spec compliance)
- **Resource discovery**: `mcp-server.service.ts` only discovers tools. Add `listResources()` and `readResource()` support
- **Prompt discovery**: Add `listPrompts()` and `getPrompt()` support
- **Structured tool annotations**: Add `readOnly` and `destructive` flags to MCP tool schema storage
- **OAuth 2.1 for MCP servers**: Implement the MCP OAuth authorization flow for remote MCP servers
- **Connection pooling**: Implement a connection pool for stdio MCP servers (reuse processes, don't spawn per-call)

#### A2A (Agent2Agent Protocol) Implementation

Add support for the Agent2Agent protocol for cross-framework agent communication:

```
apps/commons-api/src/a2a/
├── a2a.module.ts
├── a2a.controller.ts        # Exposes A2A-compliant HTTP endpoints
├── a2a.service.ts           # Core A2A protocol logic
├── agent-card.service.ts    # Generate Agent Cards (capability declarations)
└── dto/
    ├── agent-card.dto.ts    # A2A Agent Card format
    ├── task.dto.ts          # A2A Task lifecycle
    └── message.dto.ts       # A2A message format
```

Every agent exposes an **Agent Card** at `/.well-known/agent-card.json` describing its capabilities, tools, supported input/output types, and authentication requirements.

#### SKILL.md Skills System

Implement a skills system compatible with the OpenClaw/Claude Code SKILL.md format:

```
.agent-commons/skills/
├── web-research/
│   └── SKILL.md         # Frontmatter: name, description, triggers, tools
├── data-analysis/
│   └── SKILL.md
└── blockchain-ops/
    └── SKILL.md
```

SKILL.md frontmatter format:
```yaml
---
name: web-research
description: Search the web, read URLs, extract structured data from web pages
triggers:
  - "search for"
  - "find information about"
  - "browse to"
  - "look up"
tools:
  - web_search
  - fetch_url
  - extract_content
version: "1.0.0"
author: "agent-commons"
---

## Web Research Skill

When the user asks you to research something on the web...
[instructions]
```

Skills are stored in the database and can be:
- Platform skills (built-in)
- User/agent-created skills
- Imported from ClawHub (OpenClaw's skill registry) or skills.sh
- Published to a public marketplace

#### AGENTS.md Convention

Every agent gets a generated `AGENTS.md` file based on its configuration:
- Agent name, persona, instructions
- Available tools (with brief descriptions)
- Constraints and permissions
- Workflow access
- This is returned as part of the A2A Agent Card and used as system context for other agents

---

### 5.4 Terminal CLI Interface

#### Hard Prerequisite: Streaming API

The CLI is **entirely blocked on the streaming SSE endpoint**. Currently `POST /v1/agents/run` holds the HTTP connection open until the full LangGraph run completes, which can be minutes. The CLI needs tokens as they arrive.

The streaming endpoint must be built **before the CLI** (it is included in Phase 1):

```
POST /v1/agents/run/stream
Authorization: Bearer <api-key>
Content-Type: application/json

→ Response: text/event-stream (SSE)
```

**SSE Event Schema** (all events are JSON):

```typescript
// Token arriving from the LLM
event: token
data: { "content": "Based on my research" }

// Agent is invoking a tool
event: tool_use
data: { "toolCallId": "tc_abc", "toolName": "web_search", "args": { "query": "LangGraph v1" } }

// Tool execution returned a result
event: tool_result
data: { "toolCallId": "tc_abc", "toolName": "web_search", "result": "...", "durationMs": 312 }

// Agent completed a full reasoning step (one LangGraph node)
event: agent_step
data: { "stepIndex": 2, "thought": "I should now fetch the full article..." }

// Agent run finished successfully
event: done
data: { "sessionId": "sess_abc", "totalTokens": 1240, "durationMs": 4200, "costUsd": 0.018 }

// An error occurred (agent stops)
event: error
data: { "code": "tool_execution_failed", "message": "web_search timed out", "retryable": true }
```

The same SSE format is used by the web UI for real-time chat rendering, so this unblocks both the frontend streaming and the CLI.

---

#### Design: `agc` CLI (Agent Commons CLI)

```bash
# Install globally
npm install -g @agent-commons/cli

# --- Auth ---
agc login                                    # Opens browser for OAuth, saves token
agc logout                                   # Clears ~/.agc/config.json auth token
agc whoami                                   # Show current authenticated user

# --- Agents ---
agc agents list                              # List all agents you own
agc agents get <agent-id>                    # Show agent details
agc agents create --name "..." --model claude-sonnet-4-6
agc agents update <agent-id> [options]

# --- Run (single-shot) ---
agc run <agent-id> "do this thing"           # Single prompt, prints response
agc run <agent-id> --file prompt.txt         # Read prompt from file
echo "summarize this" | agc run <agent-id>   # Piped input
agc run <agent-id> "..." --output json       # Machine-readable JSON output

# --- Chat (interactive REPL) ---
agc chat <agent-id>                          # Start interactive session
agc chat <agent-id> --resume <session-id>    # Resume previous session
agc chat                                     # Uses defaultAgentId from config

# --- Workflows ---
agc workflow list
agc workflow run <workflow-id> --input '{"url": "https://..."}'
agc workflow run <workflow-id> --input-file data.json --watch   # stream progress
agc workflow status <execution-id>

# --- Tasks ---
agc task list --agent <agent-id>
agc task create --agent <id> --title "..." --description "..."
agc task cancel <task-id>

# --- Tools ---
agc tools list
agc tools search "github pull request"
agc tools exec <tool-name> --args '{"repo": "..."}'

# --- Sessions ---
agc sessions list
agc sessions resume <session-id>
agc sessions delete <session-id>

# --- Skills ---
agc skills list
agc skills install <skill-slug>              # From Agent Commons marketplace
agc skills install clawhub:<skill-slug>      # From ClawHub
agc skills create <name>                     # Generate SKILL.md template
agc skills publish <path-to-skill-dir>

# --- MCP ---
agc mcp list                                 # List connected MCP servers
agc mcp connect "npx @mcp/server-filesystem ~/projects"
agc mcp sync <server-id>                     # Re-discover tools from server
```

---

#### Package Structure

Lives as a new workspace package in the monorepo:

```
packages/agc-cli/
├── src/
│   ├── index.ts                    # Entry point — registers all Commander.js commands
│   ├── commands/
│   │   ├── auth.ts                 # login, logout, whoami
│   │   ├── agents.ts               # agents list/get/create/update
│   │   ├── run.ts                  # Single-shot execution (streaming)
│   │   ├── chat.ts                 # Interactive REPL loop
│   │   ├── workflow.ts             # workflow list/run/status
│   │   ├── task.ts                 # task list/create/cancel
│   │   ├── tools.ts                # tools list/search/exec
│   │   ├── sessions.ts             # sessions list/resume/delete
│   │   ├── skills.ts               # skills list/install/create/publish
│   │   └── mcp.ts                  # mcp list/connect/sync
│   ├── ui/
│   │   ├── stream-renderer.ts      # Consume SSE stream, print tokens + tool events
│   │   ├── diff-renderer.ts        # Render file diffs for code-editing agents
│   │   ├── table.ts                # CLI table formatting
│   │   └── spinner.ts              # Loading spinners (ora)
│   ├── config/
│   │   ├── config.ts               # Read/write ~/.agc/config.json
│   │   └── auth.ts                 # Token storage, refresh logic
│   └── client/
│       └── api-client.ts           # Typed HTTP client (generated from OpenAPI spec)
├── package.json                    # name: "@agent-commons/cli", bin: { "agc": "./dist/index.js" }
├── tsup.config.ts                  # Bundle to single CJS file in dist/
└── README.md
```

`tsup.config.ts`:
```typescript
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs'],
  outDir: 'dist',
  clean: true,
  minify: false,         // Keep readable for debugging
  banner: { js: '#!/usr/bin/env node' },  // Make executable
});
```

---

#### Interactive REPL (`agc chat`) — Detailed Flow

```
$ agc chat agent_abc123

Agent Commons CLI v1.0.0
Connected to: Research Agent  |  Model: claude-sonnet-4-6  |  Session: sess_xyz
Type /help for commands. Ctrl+C to exit.
─────────────────────────────────────────────────────────

You: Research the latest developments in LangGraph

 Searching...
 [tool] web_search("LangGraph 2026 latest") → 5 results (312ms)
 [tool] fetch_url("https://blog.langchain.com/langgraph-1dot0") → 4.2KB (891ms)

Research Agent: LangGraph reached v1.0 stable in late 2025, marking its first
major stable release with a commitment to no breaking changes until v2.0...

You: /session save my-langgraph-research   # Named save
Session saved as: sess_xyz (alias: my-langgraph-research)

You: /workflow list
  wf_abc  Web Research Pipeline     public
  wf_def  Code Review Workflow      private

You: /task create "Summarize this into a report"

You: /help
  /session save [alias]   Save session for later resume
  /session info           Show current session details
  /workflow list          List available workflows
  /workflow run <id>      Run a workflow
  /task create <title>    Create a task
  /task list              List pending tasks
  /skills list            List installed skills
  /clear                  Clear screen
  /exit                   Exit (session is auto-saved)
```

**REPL implementation details:**
- Uses Node.js `readline` for input (supports arrow key history, Ctrl+C handling)
- Renders SSE events from `POST /v1/agents/run/stream` in real-time:
  - `token` events: write directly to stdout (no newline, continuous stream)
  - `tool_use` events: print `[tool] toolName(args)` in dim colour before the token stream
  - `tool_result` events: print result summary + duration in dim colour
  - `error` events: print in red, show `retryable` hint
  - `done` event: print cost + token summary in dim footer
- Session ID is saved after first message; `--resume` reuses it
- Ctrl+C mid-stream cancels the current request (sends `DELETE /v1/sessions/:id/current-run`), does not exit
- Ctrl+C outside a stream exits cleanly

---

#### Single-shot Mode (`agc run`) — For Scripts and Pipelines

```bash
# Simple usage
agc run agent_abc123 "what is the capital of France?"

# Piped input
cat my-document.txt | agc run agent_abc123 "summarize this document"

# File input
agc run agent_abc123 --file prompt.txt

# JSON output for scripts
result=$(agc run agent_abc123 "analyze this" --output json)
echo $result | jq '.response'

# Attach a local MCP server for this run only
agc run agent_abc123 "read my project files" \
  --mcp "npx @mcp/server-filesystem ~/projects"

# Override model for this run
agc run agent_abc123 "quick question" --model ollama/llama3.2

# Run a workflow instead of an agent
agc workflow run wf_abc --input '{"url": "https://example.com"}' --output json
```

**`--output json` format:**
```json
{
  "response": "The capital of France is Paris.",
  "sessionId": "sess_abc",
  "agentId": "agent_abc123",
  "model": { "provider": "anthropic", "modelId": "claude-sonnet-4-6" },
  "usage": { "inputTokens": 45, "outputTokens": 12, "costUsd": 0.0002 },
  "toolsUsed": [],
  "durationMs": 1240
}
```

---

#### Authentication Flow

```bash
$ agc login

Opening browser for authentication...
→ https://agentcommons.io/cli-auth?code=abc123

Waiting for authorization... ✓

Logged in as: alice@example.com
API key saved to: ~/.agc/config.json

$ agc whoami
alice@example.com  |  Plan: Pro  |  API: https://api.agentcommons.io
```

The `agc login` command:
1. Generates a random `state` + `code_verifier` (PKCE)
2. Opens the browser to `https://agentcommons.io/cli-auth?state=...&code_challenge=...`
3. Starts a local HTTP server on a random port listening for the OAuth callback
4. User authenticates in the browser; the platform redirects to `http://localhost:<port>/callback?code=...`
5. CLI exchanges the code for an API token
6. Token is written to `~/.agc/config.json`
7. Local HTTP server shuts down

Alternatively, users can skip browser auth and paste an API key directly:
```bash
agc login --api-key agc_sk_...
```

API keys are generated from the Agent Commons web dashboard and have named scopes.

---

#### Config File (`~/.agc/config.json`)

```json
{
  "apiUrl": "https://api.agentcommons.io",
  "apiKey": "agc_sk_...",
  "userId": "usr_abc123",
  "defaultAgentId": "agent_abc123",
  "defaultModel": {
    "provider": "anthropic",
    "modelId": "claude-sonnet-4-6",
    "apiKey": "sk-ant-..."
  },
  "mcpServers": [
    {
      "name": "filesystem",
      "command": "npx @modelcontextprotocol/server-filesystem ~/projects"
    },
    {
      "name": "brave-search",
      "command": "npx @mcp/server-brave-search",
      "env": { "BRAVE_API_KEY": "..." }
    }
  ],
  "output": "pretty"
}
```

**Environment variable overrides** (take precedence over config file):
```
AGC_API_URL       Override API endpoint (e.g., for self-hosted deployments)
AGC_API_KEY       Override API key
AGC_AGENT_ID      Override default agent
AGC_MODEL         Override default model (format: "provider/modelId")
AGC_OUTPUT        Output format: "pretty" | "json" | "silent"
```

---

#### Error Handling in the CLI

All CLI commands follow a consistent error pattern:

```bash
$ agc run agent_abc123 "do something"

Error: Agent not found (404)
  Agent ID: agent_abc123
  Run `agc agents list` to see your agents.
  Exit code: 1
```

```bash
$ agc chat agent_abc123
...
[stream error] Tool execution failed: web_search timed out (retryable)
Retrying in 2s... (attempt 2/3)
[stream error] Tool execution failed: web_search timed out (retryable)
Retrying in 4s... (attempt 3/3)
Fatal: Tool web_search failed after 3 attempts. Session saved: sess_xyz
Resume with: agc chat agent_abc123 --resume sess_xyz
Exit code: 2
```

Error codes:
- `1` — user error (bad args, not found, unauthorized)
- `2` — agent/tool execution failure
- `3` — network/connectivity error
- `130` — user interrupted (Ctrl+C)

---

#### Build & Publish

```bash
# In packages/agc-cli/
pnpm build        # tsup → dist/index.js
pnpm link         # Test locally: agc command available globally
pnpm publish      # Publishes @agent-commons/cli to npm

# User install
npm install -g @agent-commons/cli
# or
npx @agent-commons/cli chat my-agent
```

The `package.json` `bin` field:
```json
{
  "name": "@agent-commons/cli",
  "version": "1.0.0",
  "bin": { "agc": "./dist/index.js" },
  "files": ["dist"]
}
```

---

### 5.5 Workflow Engine V2

#### Current Issues
- Sequential execution only
- No conditional branching
- No loop constructs
- `agent_processor` nodes unimplemented
- No streaming of execution progress

#### New Node Types

```typescript
type WorkflowNodeType =
  | 'input'               // Entry point — defines workflow input schema
  | 'output'              // Exit point — defines workflow output schema
  | 'tool'                // Execute a tool (static, dynamic, or MCP)
  | 'agent_processor'     // Run an LLM agent step (reasoning, transformation)
  | 'condition'           // Branch: evaluates expression, routes to true/false edge
  | 'loop'                // Repeat a subgraph N times or while condition holds
  | 'parallel'            // Fan-out: pass same input to multiple downstream nodes
  | 'merge'               // Fan-in: collect results from multiple upstream nodes
  | 'transform'           // Pure data transformation (JSONata/JMESPath expression)
  | 'delay'               // Wait N seconds (useful for rate limiting or scheduling)
  | 'subworkflow'         // Embed another workflow as a node
  | 'human_approval'      // Pause and wait for human approval (HITL gate)
  | 'webhook'             // Emit a webhook and optionally wait for response
```

#### Parallel Execution

Refactor `WorkflowExecutorService` to support concurrent branch execution:

```typescript
// Instead of sequential processing of topological order:
async executeWorkflow(def: WorkflowDefinition, inputs: any) {
  const graph = buildExecutionGraph(def);

  // Process nodes in waves: each wave contains nodes whose dependencies are complete
  const waves = computeExecutionWaves(graph);

  for (const wave of waves) {
    // All nodes in a wave are independent — execute concurrently
    const results = await Promise.all(
      wave.map(nodeId => this.executeNode(nodeId, graph, context))
    );
    // Update context with all wave results before moving to next wave
    wave.forEach((nodeId, i) => context.nodeOutputs[nodeId] = results[i]);
  }
}
```

#### Conditional Branching

```typescript
interface ConditionNode extends WorkflowNode {
  type: 'condition';
  config: {
    expression: string;    // JSONata or simple JS expression: "$.score > 0.8"
    trueEdgeId: string;    // Edge to follow when condition is true
    falseEdgeId: string;   // Edge to follow when condition is false
  };
}
```

#### Agent Processor Nodes

Implement `agent_processor` nodes that run an LLM inference step:

```typescript
interface AgentProcessorNode extends WorkflowNode {
  type: 'agent_processor';
  config: {
    agentId?: string;        // Use a specific agent's config (persona, tools)
    model?: ModelConfig;     // Or specify inline model config
    systemPrompt?: string;   // Processor-specific system prompt
    outputSchema?: JSONSchema; // Structured output schema (if supported by model)
    tools?: string[];        // Tool names available to this processor
    maxIterations?: number;  // Max LLM turns (prevent infinite loops)
  };
}
```

#### Human Approval Node (HITL)

```typescript
interface HumanApprovalNode extends WorkflowNode {
  type: 'human_approval';
  config: {
    approverUserId?: string;  // Specific user to notify; defaults to workflow owner
    message?: string;         // Context message shown to approver
    timeoutMs?: number;       // Auto-approve/reject after timeout
    timeoutAction: 'approve' | 'reject' | 'escalate';
    approveEdgeId: string;    // Continue with this edge on approval
    rejectEdgeId: string;     // Continue with this edge on rejection
  };
}
```

When a workflow reaches a `human_approval` node:
1. Execution pauses and state is checkpointed to the DB
2. A notification is sent to the approver (email, Slack, in-app)
3. Approver reviews workflow state and approves/rejects via API or UI
4. Execution resumes from the checkpoint with the appropriate edge

#### Streaming Execution Progress

Add SSE endpoint for real-time workflow execution updates:

```
GET /v1/workflows/:workflowId/executions/:executionId/stream
```

Emits events:
```
event: node_started
data: {"nodeId": "n1", "nodeName": "web_search", "timestamp": "..."}

event: node_completed
data: {"nodeId": "n1", "output": {...}, "durationMs": 234}

event: node_failed
data: {"nodeId": "n1", "error": "...", "retryable": true}

event: workflow_completed
data: {"output": {...}, "totalDurationMs": 1234}
```

---

### 5.6 Task System V2

#### Durable Cron Scheduling

Replace in-memory cron with database-driven scheduling:

```sql
CREATE TABLE scheduled_task_run (
  run_id          TEXT PRIMARY KEY,
  task_id         TEXT NOT NULL REFERENCES task(task_id),
  scheduled_for   TIMESTAMP NOT NULL,
  status          TEXT DEFAULT 'pending',  -- pending | running | completed | failed | skipped
  started_at      TIMESTAMP,
  completed_at    TIMESTAMP,
  error           TEXT,
  triggered_by    TEXT,  -- 'cron' | 'manual' | 'dependency'
  session_id      TEXT   -- Session used for this run
);

-- Index for scheduler polling
CREATE INDEX idx_scheduled_task_run_pending
  ON scheduled_task_run(scheduled_for)
  WHERE status = 'pending';
```

A **TaskScheduler** service polls this table every 10 seconds (or uses PostgreSQL `NOTIFY`/`LISTEN` for push-based triggers). This survives container restarts because the schedule is in the database.

**Cron expression support**: Use `cron-parser` library. Store the expression in the task, compute next run time on each completion, insert into `scheduled_task_run`.

**Overlap detection**: Before starting a run, check if a previous run for the same task is still `running`. If so, either skip or queue (configurable per task).

#### Task DAG: Better Dependency Resolution

Current `getNextExecutable` only checks direct dependencies. Implement transitive dependency resolution:

```typescript
// All ancestors (recursive) must be completed before a task is executable
async getNextExecutable(agentId: string, sessionId: string): Promise<Task | null> {
  const pendingTasks = await this.getTasksByStatus(agentId, sessionId, 'pending');

  for (const task of pendingTasks.sort((a, b) => b.priority - a.priority)) {
    const allDepsCompleted = await this.areAllAncestorsCompleted(task.taskId);
    if (allDepsCompleted) return task;
  }

  return null;
}
```

#### Task Cancellation & Timeout

- Add `cancelTask(taskId)` endpoint that:
  1. If task is `pending`: mark as `cancelled`
  2. If task is `started`: send cancellation signal to the executing agent
  3. Cancel any pending cron runs

- Add `timeoutMs` field to task. If execution exceeds the timeout, auto-cancel.

---

### 5.7 Tool System V2

#### Tool Marketplace

Build a full tool discovery and marketplace experience:

```
GET /v1/tools/marketplace
  ?category=blockchain&sort=rating&page=1&limit=20

GET /v1/tools/search
  ?q=github+pull+request&provider=github
```

Ranking algorithm for public tools:
- `score = (executionCount * 0.3) + (rating * 0.4) + (recentActivity * 0.3)`
- Boost tools with active MCP server connections
- Boost tools with valid OAuth configurations

#### Tool Versioning

Add semantic versioning to tools:
- `tool.version` (already exists)
- `tool.changelog` (new) — what changed in this version
- `tool.deprecatesVersion` — migration path from old version
- Agents reference `toolId@version` to pin a specific version

#### Tool Analytics Dashboard

Surface tool usage metrics:
- `executionCount`, `lastExecutedAt` (already exists)
- `avgLatencyMs` — P50/P95 execution latency
- `errorRate` — failure percentage over last 7 days
- `costPerExecution` — token cost for AI-powered tools

#### Static Tool Refactor: Away from Typia

Replace Typia LLM application with explicit JSON Schema definitions for static tools. The Typia approach is a build-time black box that is hard to debug and maintain.

```typescript
// Instead of Typia-generated schemas, define explicitly:
export const CREATE_TASK_TOOL: ToolDefinition = {
  type: 'function',
  function: {
    name: 'create_task',
    description: 'Create a new task for an agent to execute',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Task title' },
        description: { type: 'string', description: 'Detailed task description' },
        agentId: { type: 'string', description: 'ID of the agent to assign the task to' },
        priority: { type: 'number', minimum: 1, maximum: 10, default: 5 },
        scheduledFor: { type: 'string', format: 'date-time', description: 'When to execute (ISO 8601)' },
      },
      required: ['title', 'description', 'agentId'],
    },
  },
};
```

This is verbose but explicit, debuggable, and has no build-time magic.

---

### 5.8 MCP System V2

#### Connection Pool

Implement a connection pool for MCP servers to avoid spawning a new process per tool call:

```typescript
// apps/commons-api/src/mcp/mcp-connection-pool.service.ts

class McpConnectionPool {
  private pools: Map<string, McpConnection[]> = new Map();
  private maxPoolSize = 5;

  async acquire(serverId: string): Promise<McpConnection>;
  async release(serverId: string, conn: McpConnection): Promise<void>;
  async healthCheck(serverId: string): Promise<boolean>;
  async drainPool(serverId: string): Promise<void>;  // On server config change
}
```

#### Resource and Prompt Support

Extend the MCP module to handle MCP Resources and Prompts (not just Tools):

```
apps/commons-api/src/mcp/
├── mcp-resource.service.ts      # listResources, readResource
├── mcp-resource.controller.ts
├── mcp-prompt.service.ts        # listPrompts, getPrompt
├── mcp-prompt.controller.ts
└── mcp-sampling.service.ts      # Handle sampling requests from servers
```

Add `mcpResource` and `mcpPrompt` database tables.

#### Streamable HTTP Transport

Implement the MCP 2025-11-25 Streamable HTTP transport to support remote MCP servers (not just local stdio):

```typescript
// Support three MCP transport types
type McpTransportType =
  | 'stdio'           // Local process (current, keep)
  | 'sse'             // Legacy SSE (current, deprecate eventually)
  | 'streamable-http' // New standard: HTTP with streaming (implement)
```

#### MCP Server Health Dashboard

Add a health status endpoint and UI panel:
- Connection status with last ping time
- Tool count and last sync
- Error rate and last error message
- Auto-reconnect attempts and backoff state

---

### 5.9 Skills System

#### Architecture

Skills are the modular capability units of Agent Commons, aligned with the OpenClaw SKILL.md standard.

**Database Schema:**

```sql
CREATE TABLE skill (
  skill_id         TEXT PRIMARY KEY,
  name             TEXT NOT NULL,
  slug             TEXT UNIQUE NOT NULL,       -- URL-friendly identifier
  description      TEXT NOT NULL,
  instructions     TEXT NOT NULL,              -- Full SKILL.md body
  frontmatter      JSONB NOT NULL,             -- Parsed YAML frontmatter
  tools            TEXT[] DEFAULT '{}',        -- Tool names the skill uses
  triggers         TEXT[] DEFAULT '{}',        -- Phrases that activate this skill
  owner_id         TEXT,
  owner_type       TEXT DEFAULT 'platform',    -- 'platform' | 'user' | 'agent'
  visibility       TEXT DEFAULT 'public',      -- 'public' | 'private'
  version          TEXT DEFAULT '1.0.0',
  rating           DECIMAL(3,2) DEFAULT 0,
  usage_count      INTEGER DEFAULT 0,
  icon             TEXT,
  tags             TEXT[] DEFAULT '{}',
  source           TEXT,                       -- 'local' | 'clawhub' | 'skills.sh' | 'custom'
  source_url       TEXT,
  is_active        BOOLEAN DEFAULT TRUE,
  created_at       TIMESTAMP DEFAULT NOW(),
  updated_at       TIMESTAMP DEFAULT NOW()
);
```

**Progressive Disclosure Loading:**

When an agent session starts, load ONLY the skill index (name + description + triggers ~100 tokens each):

```typescript
interface SkillIndex {
  skills: Array<{
    skillId: string;
    name: string;
    description: string;       // One line
    triggers: string[];        // Activation phrases
  }>;
}
```

When the agent needs a skill (matched by LLM or by trigger phrase), load the full instructions on demand.

**Skill Invocation:**

Add a `Skill` meta-tool to the agent's tool list (always present):
```json
{
  "name": "invoke_skill",
  "description": "Invoke a skill to access specialized capabilities",
  "parameters": {
    "skillName": "string",
    "context": "any"
  }
}
```

**CLI Skill Management:**

```bash
agc skills list
agc skills install web-research       # Install from Agent Commons marketplace
agc skills install clawhub:gmail      # Install from ClawHub
agc skills create my-skill            # Create new skill (generates SKILL.md template)
agc skills publish my-skill           # Publish to Agent Commons marketplace
```

---

### 5.10 Memory System

Implement a four-tier memory architecture:

```
apps/commons-api/src/memory/
├── memory.module.ts
├── memory.service.ts           # Unified memory interface
├── types/
│   ├── working-memory.ts       # In-context (current messages, active task state)
│   ├── episodic-memory.ts      # Past events: what happened, when, outcome
│   ├── semantic-memory.ts      # Facts and domain knowledge (RAG over knowledgebase)
│   └── procedural-memory.ts   # Skills, workflows, how-to instructions
└── storage/
    ├── vector-store.ts         # Supabase pgvector (already integrated)
    └── kv-store.ts             # Redis for fast working memory
```

**Database additions:**

```sql
CREATE TABLE agent_memory (
  memory_id      TEXT PRIMARY KEY,
  agent_id       TEXT NOT NULL REFERENCES agent(agent_id),
  session_id     TEXT,
  memory_type    TEXT NOT NULL,  -- 'episodic' | 'semantic' | 'procedural'
  content        TEXT NOT NULL,
  embedding      vector(1536),   -- For semantic search
  importance     DECIMAL(3,2),   -- 0.0-1.0, used for memory consolidation
  access_count   INTEGER DEFAULT 0,
  last_accessed  TIMESTAMP,
  created_at     TIMESTAMP DEFAULT NOW(),
  expires_at     TIMESTAMP      -- Optional TTL for episodic memories
);
```

Memory consolidation: After each session, run an async job that:
1. Extracts key facts from the session messages
2. Scores importance of each memory
3. Deduplicates with existing memories (via semantic similarity)
4. Stores as `episodic` or `semantic` memories

---

### 5.11 Agent Observability & Cost Tracking

#### OpenTelemetry Integration

Add OTel instrumentation to the agent execution path:

```typescript
// apps/commons-api/src/modules/telemetry/telemetry.module.ts

import { NodeSDK } from '@opentelemetry/sdk-node';
import { GenAISpanAttributes } from '@opentelemetry/semantic-conventions/incubating';

// Instrument every LLM call with GenAI semantic conventions
const span = tracer.startSpan('gen_ai.chat');
span.setAttributes({
  [GenAISpanAttributes.GEN_AI_SYSTEM]: 'anthropic',
  [GenAISpanAttributes.GEN_AI_REQUEST_MODEL]: 'claude-sonnet-4-6',
  [GenAISpanAttributes.GEN_AI_USAGE_INPUT_TOKENS]: inputTokens,
  [GenAISpanAttributes.GEN_AI_USAGE_OUTPUT_TOKENS]: outputTokens,
  'gen_ai.session.id': sessionId,
  'gen_ai.agent.id': agentId,
});
```

#### Cost Tracking

Add a `usage_event` table for per-call cost attribution:

```sql
CREATE TABLE usage_event (
  event_id          TEXT PRIMARY KEY,
  agent_id          TEXT NOT NULL,
  session_id        TEXT,
  task_id           TEXT,
  workflow_execution_id TEXT,

  provider          TEXT NOT NULL,     -- 'anthropic' | 'openai' | etc.
  model_id          TEXT NOT NULL,

  input_tokens      INTEGER NOT NULL,
  output_tokens     INTEGER NOT NULL,
  cached_tokens     INTEGER DEFAULT 0,

  input_cost_usd    DECIMAL(10,6),     -- Computed from model pricing table
  output_cost_usd   DECIMAL(10,6),
  total_cost_usd    DECIMAL(10,6),

  is_byok           BOOLEAN DEFAULT FALSE,  -- True if user supplied their own key

  created_at        TIMESTAMP DEFAULT NOW()
);

-- Index for per-agent cost aggregation
CREATE INDEX idx_usage_event_agent ON usage_event(agent_id, created_at);
```

Expose per-session/per-agent/per-workflow cost aggregations via API. Show cost breakdown in the UI.

#### Execution Logs V2

Restructure execution logs as structured JSON events:

```sql
CREATE TABLE execution_log (
  log_id        TEXT PRIMARY KEY,
  trace_id      TEXT NOT NULL,        -- OTel trace ID
  span_id       TEXT NOT NULL,        -- OTel span ID
  parent_span_id TEXT,

  agent_id      TEXT,
  session_id    TEXT,
  workflow_execution_id TEXT,
  task_id       TEXT,

  event_type    TEXT NOT NULL,        -- 'llm_call' | 'tool_call' | 'tool_result' | 'agent_step' | 'error'
  event_data    JSONB NOT NULL,       -- Full event payload (redact PII)

  duration_ms   INTEGER,
  created_at    TIMESTAMP DEFAULT NOW()
);
```

---

### 5.12 Multi-Agent Coordination

#### A2A Protocol Implementation

Each agent exposes an A2A-compliant interface:

```
GET  /v1/agents/:agentId/.well-known/agent-card
     → AgentCard (capabilities, tools, auth requirements)

POST /v1/agents/:agentId/a2a/tasks
     → Create a task for this agent from another agent

GET  /v1/agents/:agentId/a2a/tasks/:taskId
     → Poll task status

POST /v1/agents/:agentId/a2a/tasks/:taskId/cancel
     → Cancel a running task
```

#### Supervisor Pattern

Implement a `SupervisorAgent` node type in the workflow system. A supervisor:
1. Receives a high-level goal
2. Decomposes it into subtasks
3. Routes subtasks to specialist agents
4. Aggregates results

This maps naturally to the workflow DAG: a supervisor is an `agent_processor` node whose output feeds into multiple specialized `tool` or `subworkflow` nodes.

#### Agent-to-Agent Communication in Spaces

Spaces already support multiple agents. Extend with structured inter-agent messaging:
- Agents can `@mention` other agents in a space message
- The mentioned agent receives the message as input and responds
- This is effectively A2A communication over the existing space WebSocket layer

---

### 5.13 API V2 Design

#### Remove Frontend API Proxy Layer

The Next.js `/app/api/*` routes are pass-through proxies. Remove them. The frontend should call the NestJS API directly.

```typescript
// apps/commons-app/lib/api-client.ts
const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://api.agentcommons.io';

// Direct calls to NestJS API — no Next.js proxy
export const api = {
  agents: {
    run: (data) => fetch(`${API_BASE}/v1/agents/run`, { method: 'POST', body: JSON.stringify(data) }),
    // ...
  }
};
```

#### OpenAPI Spec Generation

Generate an OpenAPI 3.1 spec from the NestJS controllers using `@nestjs/swagger`. This spec:
- Powers the `agc` CLI's typed API client (generated via `openapi-typescript`)
- Enables external developers to build integrations
- Is published at `https://api.agentcommons.io/docs`

#### Streaming Endpoints

Streaming is a **Phase 1 priority** — it unblocks both the web UI (live chat) and the `agc` CLI. Without it, users stare at a blank screen for multi-minute agent runs.

The full SSE event schema is defined in section 5.4. Endpoints:

```
POST /v1/agents/run/stream
  → SSE stream of: token | tool_use | tool_result | agent_step | done | error

GET  /v1/workflows/:id/executions/:executionId/stream
  → SSE stream of: node_started | node_completed | node_failed | workflow_completed | error

GET  /v1/tasks/:id/stream
  → SSE stream of: task_started | task_progress | tool_use | tool_result | task_completed | error
```

**Implementation notes:**
- Use NestJS `@Sse()` decorator with `Observable<MessageEvent>` return type
- Auth via `Authorization: Bearer` header (EventSource browser API doesn't support headers — use `?token=` query param for browser clients, or a short-lived stream token)
- Set `Cache-Control: no-cache`, `X-Accel-Buffering: no` (disables nginx buffering)
- Heartbeat: emit a `ping` comment every 15 seconds to keep the connection alive through proxies
- On client disconnect (connection closed), cancel the in-flight LangGraph run immediately to avoid wasted compute

#### API Versioning

Establish clear versioning: current API is `/v1`. New breaking changes go to `/v2`. Both are maintained simultaneously during transition periods.

---

## 6. MIGRATION & PHASED ROLLOUT

> **Last updated: 2026-03-18** — Phases 1–10 complete ✅. Remaining: skills marketplace UI, task dependency graph, execution_log V2, npm publish, CI (deferred).

### Critical Security Issues (addressed this session)
- [x] Strip `wallet` JSONB and `modelApiKey` from all agent API responses — `omit` in AgentController
- [x] Remove dead `pauseAgent` undecorated stub from AgentController
- [x] Remove GoalService injection from AgentService — `goal` table is commented-out, service was never called
- [x] Remove GoalModule from AgentModule imports
- [x] Fix `useAgentStream` stale closure — options now stored in `useRef`, `stream` callback only re-creates on `initiator` change
- [x] Remove dead `eventsource-parser` dependency from `@agent-commons/sdk`
- [x] Encrypt `agent.modelApiKey` at rest — `encryptApiKey`/`decryptApiKey` helpers in `AgentService`; `enc:{iv}:{tag}:{value}` format, backward-compatible with plaintext
- [x] Encrypt `session.model.apiKey` at rest — `encryptModelApiKey` in `SessionService`; `decryptModelApiKey` called in `AgentService` before `buildFromSessionModel`
- [x] Add API authentication — global `ApiKeyGuard` in `src/modules/auth/`; enforced when `API_AUTH_REQUIRED=true` + `API_SECRET_KEY=<secret>`; `@Public()` decorator for exempt routes; safe default (pass-through) in dev

### Phase 1: Foundation (Weeks 1-4)
**Goal: Fix critical issues and lay the infrastructure every other phase depends on**

**Streaming API — do this first, everything else is unblocked by it:**
- [x] Implement `POST /v1/agents/run/stream` SSE endpoint — `AgentController @Post @Sse` + `AgentService` Observable
- [x] Implement `GET /v1/workflows/:id/executions/:executionId/stream` SSE endpoint — polling-based, emits `status/completed/failed` events
- [x] Implement `GET /v1/tasks/:id/stream` SSE endpoint — polling-based, emits `status/completed/failed` events
- [x] Add heartbeat ping every 15s to agent stream; every 5s to workflow/task streams
- [x] `X-Accel-Buffering: no` global middleware in `main.ts` — prevents nginx/proxy SSE buffering
- [x] Update web UI chat to consume SSE stream — `useAgentStream` hook + `chat-input-box.tsx` rewritten
- [x] Generate OpenAPI spec (`@nestjs/swagger`) — installed, configured in `main.ts`

**Model Provider System:**
- [x] Implement `ModelProvider` interface and factory — `src/modules/model-provider/` with `ModelProviderFactory`, `ModelConfig`, `StreamEvent` interfaces
- [x] Add OpenAI, Anthropic, Google, Groq, Ollama adapters — all in `src/modules/model-provider/providers/`
- [x] Update `session.model` schema to include `provider` and `modelId` — factory supports legacy `{name}` format
- [x] Update `agent` table with `modelProvider`, `modelId`, `modelApiKey`, `modelBaseUrl` — in `models/schema.ts` + migration `phase1-model-provider-and-scheduler.mjs`
- [x] Refactor `AgentService` to use `ModelProviderFactory` — no longer hardcodes `ChatOpenAI`
- [x] Add frontend model selector to agent creation (`Presets` component) and agent edit (`AgentIdentity` dialog)

**Critical Fixes:**
- [x] Fix workflow parallel execution — `WorkflowExecutorService` now uses `computeExecutionWaves()` + `Promise.all` per wave
- [x] Implement durable cron scheduling — `TaskSchedulerService` polls `scheduled_task_run` table every 15s with optimistic locking; replaces in-memory `CronJob`
- [x] `TaskExecutionService` refactored — removed `CronJob` dependency, delegates scheduling to `TaskSchedulerService`
- [x] Add missing database indexes — `idx_scheduled_task_run_due`, `idx_session_agent_created`, `idx_task_status_priority` in migration
- [x] `main.ts` updated — CORS, SSE `X-Accel-Buffering: no` global middleware, URI versioning, Swagger
- [x] `AppModule` updated — `ModelProviderModule` (global) and `TaskModule` registered
- [x] UI overhaul — `agent-output.tsx`, `initiator-message.tsx`, `agent-metrics.tsx`, `agent-identity.tsx`, `studio/[tab]/page.tsx`, `studio/agents/[agent]/page.tsx` all cleaned up
- [x] Workflow UI — `workflows-list-view.tsx` uses `useWorkflows` SDK hook; `test-panel.tsx` uses `useWorkflowExecutionStream` SSE hook
- [x] Task UI — `TaskManagementView` rewritten to use `useTasks` + `useAgents` hooks + SDK actions; `CreateTaskDialog` and `CreateTaskForm` rewritten to use `useAgents`, `useWorkflows`, `commons.sessions`, `commons.tools`, `commons.tasks.create`
- [x] Add `sessions` resource to `CommonsClient` SDK — `sessions.list`, `sessions.create`, `sessions.get`
- [x] Add `toolKeys`, `toolPermissions`, `tools.create/update/delete`, `agents.createLiaison` to SDK
- [x] Encrypt `agent.modelApiKey` and `session.model.apiKey` at rest
- [x] Remove Next.js API proxy layer — all component fetch calls migrated to SDK; 15+ proxy routes deleted (agents, workflows, sessions, tools, tool-keys, tool-permissions, v1/tasks); remaining routes are OAuth, spaces, MCP, SSE streaming, TTS, static tools

### Phase 2: Wallet Migration (Weeks 5-8) ✅ COMPLETE
**Goal: Move to owner-controlled wallet architecture**

- [x] Design and implement `agent_wallet` table — EOA keypair approach (viem, Base Sepolia); `phase10-wallet-migration.mjs`
- [x] `WalletService` — create, list, primary, balance (USDC on Base Sepolia via viem); private keys encrypted at rest
- [x] `WalletController` — `GET/POST /v1/wallets`, `/agent/:id`, `/agent/:id/primary`, `/:id/balance`
- [x] `agc chat` wallet header — fetches primary wallet + USDC balance at session start
- [x] `AgentFinances` component — shows wallet address + USDC balance in agent studio right panel
- [x] Remove `wallet` JSONB column from `agent` table — `phase11-drop-wallet-column.mjs` + schema updated
- [x] Remove Coinbase MPC SDK, old on-chain hooks (`useChainClients`, `useAgentRegistry`, `useCommonToken`), `FundAgent` component, contract ABIs
- [ ] ZeroDev ERC-4337 / Privy Delegated Actions — deferred; replaced with simpler EOA approach for V1

### Phase 3: Workflow & Task V2 (Weeks 9-12) ✅ COMPLETE
**Goal: Full-featured workflow and task engines**

- [x] Implement `condition`, `transform`, `loop`, `agent_processor`, `human_approval` node types
- [x] Dynamic graph walker with dead-edge tracking for conditional branching
- [x] Implement `agent_processor` node execution (LLM inference in workflow)
- [x] Add HITL human approval flow (pause/resume via `approve`/`reject` endpoints + approval token)
- [x] Workflow execution streaming (SSE) — `awaiting_approval` event in stream
- [x] Add task cancellation with hard cascade to workflow executions
- [x] Add `timeoutMs` on task schema + enforce in `waitForWorkflowCompletion`
- [x] DB migration: `approval_token`, `approval_data`, `paused_node_outputs`, `paused_at_node` columns
- [x] SDK: `WorkflowNodeType`, `approveExecution`, `rejectExecution`, `cancelExecution`
- [ ] Build task queue UI with dependency visualization (deferred — basic `TaskManagementView` exists, DAG graph pending)

### Phase 4: Open Standards (Weeks 13-16) ✅ COMPLETE
**Goal: MCP v2, A2A, Skills**

- [x] MCP StreamableHTTP transport (`http` / `streamable-http` connection types)
- [x] MCP legacy SSE transport (`sse` connection type)
- [x] MCP Resource support — `listResources`, `readResource`
- [x] MCP Prompt support — `listPrompts`, `getPrompt`
- [x] MCP connection pooling — idle eviction, exponential-backoff reconnect
- [x] Full sync: tools + resources + prompts in one `POST /sync` call
- [x] A2A protocol — Agent Card at `GET /.well-known/agent.json`
- [x] A2A JSON-RPC 2.0 endpoint `POST /v1/a2a/:agentId`
- [x] A2A methods: `tasks/send`, `tasks/sendSubscribe` (SSE), `tasks/get`, `tasks/cancel`
- [x] A2A push notification config (`tasks/pushNotificationConfig/set|get`)
- [x] A2A SSE stream endpoint `GET /v1/a2a/:agentId/tasks/:taskId/stream`
- [x] `invoke_skill` meta-tool — call any A2A-compatible external agent as a workflow tool
- [x] `a2a_task` DB table with full state machine
- [x] SDK: `client.a2a.*` and `client.mcp.*` namespaced resources
- [x] **A2A `dispatchToAgent` wired to real LangGraph execution** — `AgentService.runAgent()` called via `firstValueFrom(stream$.pipe(filter(final)))`; `callerId` used as session initiator; handles string and array content blocks from all providers
- [ ] Skills system marketplace UI (browse + install page in web app — pending)

### Phase 5: SDK + Terminal CLI (Weeks 17-20) ✅ COMPLETE
**Goal: Published SDK and full `agc` CLI — both powered by `@agent-commons/sdk`**

**`@agent-commons/sdk`:**
- [x] Scaffold `packages/commons-sdk` — `CommonsClient`, typed resources, SSE streaming
- [x] All A2A types, MCP types, WorkflowNodeType union exported
- [x] `client.agents`, `client.workflows`, `client.tasks`, `client.tools`, `client.sessions`, `client.a2a`, `client.mcp` namespaced APIs
- [x] `client.skills`, `client.memory`, `client.usage`, `client.wallets` namespaced APIs
- [x] Add to pnpm workspace
- [x] Write SDK tests — 40 unit tests covering all namespaces (jest + ts-jest, mock fetch)
- [ ] Publish to npm: `npm publish --access public`
- [ ] Set up CI auto-publish on `v*` tags (deferred with CI)

**`agc` CLI (`packages/agc-cli/`):**
- [x] Scaffold — Commander.js, `tsup`, `tsconfig`, `~/.agc/config.json`
- [x] `agc login` / `agc logout` / `agc whoami` / `agc config get|set`
- [x] `agc agents list/get/create`
- [x] `agc sessions list/get/create`
- [x] `agc tools list/get/exec`
- [x] `agc workflow list/get/run/executions/approve/reject` — `--watch` SSE, `awaiting_approval` HITL display
- [x] `agc task list/get/create/execute/cancel` — `--execute --watch` SSE streaming
- [x] `agc run "<prompt>"` — single-shot streaming, `--no-stream`, `--json`
- [x] `agc chat` — interactive REPL, inline token streaming, tool event display, `--resume <sessionId>`
- [x] `agc mcp list/get/add/connect/disconnect/sync/tools/resources/read/prompts/prompt/remove`
- [x] Session `--resume <sessionId>` — validates session, skips creation, shows "resumed" badge
- [x] Exit codes: 0 success, 1 user error, 130 Ctrl+C
- [x] Environment variable overrides: `AGC_API_URL`, `AGC_API_KEY`, `AGC_INITIATOR`, `AGC_AGENT_ID`
- [x] Build: 56 KB single CJS bundle with `#!/usr/bin/env node` shebang
- [x] `agc skills list/get/index/create/install/publish/unpublish/update/delete` — 8 commands in `packages/agc-cli/src/commands/skills.ts`
- [x] `agc chat` wallet info header + cost/token footer on session end
- [ ] Publish to npm as `@agent-commons/cli`

### Phase 6: Skills System ✅ COMPLETE (marketplace UI pending)
**Goal: Modular capability units — progressive disclosure, marketplace, SKILL.md standard**

- [x] `skill` DB table (slug, instructions, frontmatter JSONB, tools[], triggers[], owner, visibility, source) — `phase6-skills.mjs`
- [x] `SkillService` — CRUD + progressive index loading (`/v1/skills/index` returns name + description + triggers only)
- [x] `SkillController` — `GET/POST /v1/skills`, `GET /v1/skills/:id`, `GET /v1/skills/index`, `PUT`, `DELETE`
- [x] Seed 5 platform built-in skills: web-research, data-analysis, code-review, blockchain-ops, file-ops
- [x] Wire `invoke_skill` meta-tool to local skills DB — hybrid: local slug lookup + external A2A HTTP fallback
- [x] `agc skills` CLI — 8 commands: list, get, index, create, install, publish, unpublish, update, delete
- [ ] Skills marketplace UI in web app — browse/install page (pending)

### Phase 7: Auth Hardening + Test Coverage ✅ COMPLETE (CI deferred)
**Goal: Production-safe defaults and a CI test gate**

- [x] Flip `API_AUTH_REQUIRED` default to `true` — changed `=== 'true'` to `!== 'false'` in `api-key.guard.ts`; opt-out not opt-in
- [x] Per-tenant rate limiting — `RateLimitGuard` sliding-window in-memory (120 req/min/agent default); `@RateLimit()` decorator
- [x] Audit `toolKey.encryptedValue` — confirmed AES-256-GCM with per-key IV + auth tag in `EncryptionService`
- [x] Remove remaining Next.js proxy routes — `/api/v1/mcp/*`, `/api/tools/available`, `/api/tools/static`, and 15+ more all deleted
- [x] Unit tests — `UsageService`, `WorkflowExecutorService`, `A2aService`, `TaskSchedulerService`, `cron.util` (141 tests, 12 suites)
- [x] Integration tests — HITL pause/resume (`workflow-hitl.integration.spec.ts`), A2A dispatch (`a2a-dispatch.integration.spec.ts`)
- [ ] CI pipeline (GitHub Actions) — explicitly deferred for careful design

### Phase 8: Observability & Cost Tracking ✅ COMPLETE (execution_log V2 pending)
**Goal: Full visibility into agent execution cost and behaviour**

- [x] `usage_event` table — per-LLM-call cost attribution (provider, model, tokens, cost_usd, is_byok, duration_ms)
- [x] `UsageService.record()` — called fire-and-forget after every LangGraph invoke in `AgentService`
- [x] `GET /v1/usage/agents/:agentId` and `GET /v1/usage/sessions/:sessionId` aggregation endpoints
- [x] Cost summary in `agc chat` session footer — `final` SSE event carries `payload.usage`; CLI renders tokens + cost
- [x] Structured LLM trace logging — `handleLLMEnd` callback emits JSON line (traceId=LangChain runId, agentId, sessionId, tokens)
- [x] Cost dashboard in web app — `CostDashboard` component with stat cards + event log; wired in agent studio right panel
- [ ] Structured `execution_log` V2 with OTel trace/span IDs threaded through workflow + agent executions (pending)

### Phase 9: Agent Memory System ✅ COMPLETE
**Goal: Agents that learn and improve across sessions**

- [x] `agent_memory` table (episodic / semantic / procedural, importance score, TTL, tags, source_type) — `phase9-agent-memory.mjs`
- [x] `MemoryService` — CRUD, keyword-based retrieval (`buildMemoryBlock`), consolidation after sessions
- [x] Memory consolidation — runs after each session via `AgentService`; extracts facts using LLM, deduplicates, scores importance
- [x] Inject relevant memories into system prompt — `buildMemoryBlock(agentId, query)` called at session start, injected via `buildSystemPrompt`
- [x] Memory UI in agent studio — `AgentMemoryView` component with list, search, type filter, stats strip, add/delete; wired in right panel

### Phase 10: Wallet Migration ✅ COMPLETE
**Goal: Owner-controlled wallets; platform never holds private keys**

- [x] `agent_wallet` table — EOA keypairs via viem, encrypted private keys, USDC balance on Base Sepolia; `phase10-wallet-migration.mjs`
- [x] `WalletService` — create, list, primary, balance; `WalletController` — full REST API at `/v1/wallets`
- [x] `AgentFinances` component — wallet address + USDC balance in agent studio
- [x] `agent.wallet` JSONB column sunsetted — `phase11-drop-wallet-column.mjs` + schema updated
- [ ] ZeroDev ERC-4337 / Privy Delegated Actions — deferred; EOA approach adopted for V1 simplicity

---

## 7. TECH STACK DECISIONS

### Framework Decision: NestJS (Locked)

**NestJS is the chosen backend framework. This decision is final for V1 and should not be revisited until after a stable V1 ships.**

Rationale for staying with NestJS over alternatives like Hono:
- The codebase has deep investment in NestJS patterns (DI, modules, guards, gateways)
- The complexity of this system — stateful LangGraph agents, socket.io WebSocket gateways, MCP connection pools, OAuth flows, nested multi-layer service dependencies — benefits directly from NestJS's DI container. The alternative is manually wiring the same dependency graph, which is just building a worse NestJS.
- Our bottleneck is LLM latency (seconds), not framework overhead (microseconds). Hono's performance advantage is irrelevant here.
- NestJS on Fastify adapter closes most of the raw throughput gap if it ever matters.
- The streaming SSE improvements planned in Phase 1 address the one area (real-time output) where a lighter framework would have been cleaner.

> **Post-V1 option:** After a stable, tested V1, a module-by-module migration to Hono is feasible and worth revisiting — particularly for the CLI RPC surface where `hono/client` end-to-end type inference would eliminate the OpenAPI codegen step. This is not a current priority.

### Keep
| Technology | Reason |
|---|---|
| NestJS 11 | **Locked decision** — DI, module system, WebSocket gateway, guards; complexity of codebase justifies the framework |
| Drizzle ORM + PostgreSQL | Type-safe, lightweight, performant |
| LangGraph v1.0 | Upgrade from 0.2.x; stable, best-in-class for stateful agent loops |
| React Flow | Good workflow editor foundation; has undo/redo via `useUndoable` |
| Next.js 15 | Keep for frontend; remove the proxy API layer |
| MCP SDK `@modelcontextprotocol/sdk` | Keep and upgrade to v2025-11-25 spec |
| Privy | Keep for web3 auth; extend to use Delegated Actions for wallets |
| Supabase pgvector | Keep for semantic search / memory |
| Pinata/IPFS | Keep for decentralized resource storage |

### Add
| Technology | Purpose |
|---|---|
| LiteLLM (or direct LangChain adapters) | Multi-provider LLM support |
| ZeroDev Kernel SDK | ERC-4337 smart account wallets with session keys |
| Commander.js + tsup | CLI framework and bundler for `agc` CLI |
| `openapi-typescript` | Generate typed API client from OpenAPI spec for CLI |
| `@nestjs/swagger` | Generate OpenAPI spec from controllers |
| `@opentelemetry/sdk-node` | Distributed tracing |
| `@opentelemetry/semantic-conventions` | GenAI span attributes |
| Redis | Fast working memory for agents, session state, cron overlap detection |
| `node-cron` → database polling | Replace in-memory cron with DB-driven scheduler |
| JSONata or JMESPath | Data transformation expressions for workflow `transform` nodes |

### Remove / Replace
| Technology | Replacement | Reason |
|---|---|---|
| Typia LLM application | Explicit JSON Schema definitions | Build-time magic, hard to debug |
| In-memory cron jobs | Database-driven `scheduled_task_run` | Lost on restart |
| Coinbase CDP MPC wallets | ZeroDev ERC-4337 + Privy Delegated Actions | Platform holds key shares |
| Next.js API proxy routes | Direct frontend → NestJS calls | Unnecessary hop, latency |
| `@langchain/langgraph@0.2.x` | LangGraph v1.0 | Pre-stable, breaking changes risk |

### Watch / Evaluate
| Technology | Why |
|---|---|
| Lit Protocol Vincent | Maximum decentralization for agent wallets; evaluate when out of early access |
| A2A SDK (when released) | Cross-framework agent interoperability |
| Cloudflare Agents SDK | Edge deployment for CLI-hosted agents |
| PydanticAI | If Python SDK is needed alongside TypeScript |
| Turnkey | Alternative to ZeroDev if server-wallet (no owner interaction) is preferred |
| Hono (post-V1) | Evaluate after stable V1 for CLI RPC surface (`hono/client` type inference) and potential module-by-module migration; not a current priority |

---

*This document is a living plan. It should be updated as implementation progresses, priorities shift, and new standards emerge.*

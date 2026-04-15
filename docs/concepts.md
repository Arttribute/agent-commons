# Core Concepts

Understanding the key building blocks of Agent Commons.

---

## Agent

An **Agent** is the core unit of the platform. It's an AI persona with a specific role, instructions, and set of tools. Agents can:

- Chat with users in real time
- Run autonomously on a schedule
- Call external tools and APIs
- Communicate with other agents
- Hold a crypto wallet and make payments

Each agent has:
- **Instructions** — the system prompt that defines personality and behavior
- **Model config** — which LLM to use (provider + model ID), temperature, etc.
- **Tools** — what external capabilities it can use
- **Wallet** — optional on-chain wallet for payments

---

## Session

A **Session** is a conversation thread between a user and an agent. It holds the full message history, model configuration used, and metrics (tokens, latency, tool calls). Sessions are persistent — you can resume them later.

One agent can have many sessions. Sessions are identified by a UUID.

---

## Task

A **Task** is a discrete unit of work assigned to an agent. Unlike a session (which is open-ended chat), a task has:

- A clear goal and description
- A status: `pending → running → completed / failed / cancelled`
- Optional scheduling (run at a specific time, or on a recurring cron schedule)
- Optional dependencies (wait for other tasks to finish first)
- Results stored when done

Tasks are good for background work, automation, and long-running jobs.

---

## Workflow

A **Workflow** is a directed acyclic graph (DAG) of steps that an agent (or multiple tools) executes. Each **node** in the graph is a step — it can invoke a tool, transform data, or run an AI processor. **Edges** define the order and data flow.

Workflows are useful when you have a multi-step process with clear inputs and outputs between steps. They're defined in a JSON schema and executed via the API or UI.

Node types:
- `input` — passes the workflow's input data downstream
- `output` — marks the final output of the workflow
- `tool` — invokes a registered tool with specific parameters
- `agent_processor` — runs an LLM inference step via a configured agent
- `transform` — maps or reshapes fields between steps (no tool call)
- `condition` — evaluates an expression and routes to a true or false branch
- `loop` — iterates a fixed number of times or over an array
- `human_approval` — pauses execution until a human approves or rejects

---

## Tool

A **Tool** is a capability an agent can invoke — anything from web search to database queries to sending an email. There are four kinds:

| Type | Description |
|---|---|
| **Static tools** | Built-in tools available to every agent (web scraper, API caller, file ops, etc.) |
| **Dynamic tools** | Custom REST API integrations you create and configure |
| **MCP tools** | Tools fetched from any MCP (Model Context Protocol) server |
| **Space tools** | Tools scoped to a collaborative space |

Tools have schemas (input/output), access controls, and optional stored API keys.

---

## MCP Server

**MCP (Model Context Protocol)** is a standard for connecting AI agents to external tool servers. You connect an MCP server by URL or stdio command — Agent Commons automatically discovers and syncs the tools, resources, and prompts it exposes. Any agent can then use those tools.

---

## Agent-to-Agent (A2A)

**A2A** lets agents call other agents as if they were tools. Each agent publishes an **Agent Card** (at `/.well-known/agent.json`) that describes what it can do. Other agents can discover this card and send tasks to it using a JSON-RPC 2.0 protocol.

This enables multi-agent systems where specialized agents delegate to each other.

---

## Wallet

Each agent can have an **on-chain wallet** (EOA keypair on Base Sepolia). The wallet can:
- Hold USDC
- Make x402 micropayments to access paid tools or services
- Receive payments for services rendered

---

## Memory

**Memory** gives agents a persistent knowledge store beyond the conversation window. Memories can be:
- **Semantic** — facts and knowledge
- **Episodic** — records of past events
- **Procedural** — how to do things

Memory entries are embedded and searchable via semantic similarity.

---

## Space

A **Space** is a real-time collaborative environment. Spaces use WebRTC for live presence and can host shared tools, files, and agent interactions. Multiple users and agents can be in the same space simultaneously.

---

## Skill

A **Skill** is a reusable, shareable capability definition — similar to a prompt template combined with a tool schema. Skills can be published publicly for other agents to discover and use via A2A.

---

## OAuth Connection

**OAuth Connections** let agents act on behalf of users in external services (Google, GitHub, Slack, etc.). You authorize the connection once, and the platform injects the token automatically when a tool needs it.

---

## How it all fits together

```
User / External System
        │
        ▼
   [Session] ──── messages ────► [Agent]
                                    │
                          ┌─────────┼─────────┐
                          ▼         ▼         ▼
                       [Tools]  [Memory]  [A2A calls]
                          │
                  ┌───────┼───────┐
                  ▼       ▼       ▼
              [Static] [MCP]  [Dynamic]
              
[Task] ──── schedule ────► [Agent] ──► [Workflow]
                                           │
                                   [Node1]→[Node2]→[Node3]
```

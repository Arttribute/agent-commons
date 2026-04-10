# Agent Commons Documentation

Agent Commons is a platform for building, running, and connecting AI agents. You can create agents that hold wallets, run on schedules, use external tools, collaborate with each other, and execute complex multi-step workflows — all accessible via a web UI, REST API, TypeScript SDK, or CLI.

---

## Navigation

### Start here
- [Quickstart](./quickstart.md) — Run your first agent in under 5 minutes
- [Core Concepts](./concepts.md) — Understand agents, sessions, tasks, and workflows

### By interface
- [Web UI Guide](./ui.md) — Full walkthrough of every screen
- [REST API Reference](./api.md) — All endpoints with examples
- [TypeScript SDK](./sdk.md) — Programmatic access from Node.js / TypeScript
- [CLI Reference](./cli.md) — Terminal-based `agc` commands

### Deep dives
- [Building Agents](./guides/agents.md) — Full agent configuration guide
- [Tools & MCP](./guides/tools-mcp.md) — Connecting external tools and MCP servers
- [Workflows](./guides/workflows.md) — Building DAG-based multi-step workflows
- [Tasks & Scheduling](./guides/tasks.md) — Discrete tasks, cron jobs, dependencies
- [Agent-to-Agent (A2A)](./guides/a2a.md) — Agents calling other agents
- [Wallets & Payments](./guides/wallets.md) — Agent wallets and USDC payments
- [Memory](./guides/memory.md) — Persistent agent memory

---

## What you can build

| Use case | Key features |
|---|---|
| AI chat assistant | Agents, sessions, streaming |
| Automated research bot | Tasks, scheduling, web tools |
| Multi-step data pipeline | Workflows, tool chaining |
| Agent marketplace | A2A protocol, skills |
| Paid AI service | x402 payments, wallets |
| Autonomous background agent | Heartbeat/cron, autonomy mode |

---

## Architecture overview

```
┌─────────────────────────────────────────────────────┐
│                    Interfaces                        │
│  Web App (Next.js)  │  CLI (agc)  │  SDK / API      │
├─────────────────────────────────────────────────────┤
│                    API (NestJS)                      │
│  Agents  │  Sessions  │  Tasks  │  Workflows         │
│  Tools   │  MCP       │  A2A    │  Memory            │
├─────────────────────────────────────────────────────┤
│               Infrastructure                         │
│  PostgreSQL  │  Supabase (vectors)  │  IPFS          │
│  LangGraph   │  Blockchain (Base)   │  OAuth         │
└─────────────────────────────────────────────────────┘
```

**Core stack:**
- Frontend: Next.js 15, React 19, Privy auth
- Backend: NestJS 11, Drizzle ORM, PostgreSQL
- AI: LangGraph with multi-provider LLM support (OpenAI, Anthropic, Google, Groq, Mistral, Ollama)
- Blockchain: Solidity contracts on Base Sepolia
- SDK: `@agent-commons/sdk` (published npm package)
- CLI: `agc` command

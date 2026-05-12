# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository overview

Agent Commons is a monorepo for an AI agent platform. It contains:

- `apps/commons-api/` — NestJS 11 backend (runs on port 3001)
- `apps/commons-app/` — Next.js 15 frontend (runs on port 3000)
- `packages/agc-cli/` — `agc` CLI tool (published as `@agent-commons/cli`)
- `packages/commons-sdk/` — TypeScript SDK (published as `@agent-commons/sdk`)

Package manager is **pnpm** (v9.15.3). All commands from the repo root use pnpm workspaces.

---

## Common commands

### Root (workspace-wide)
```bash
pnpm build            # Build all packages (commons-sdk, agc-cli)
pnpm test             # Run tests across all packages
```

### API (`apps/commons-api/`)
```bash
pnpm start:dev        # Watch mode — hot reload on file changes
pnpm build            # Compile via NestJS/tsc
pnpm test             # Jest (unit tests match *.spec.ts)
pnpm test:watch       # Jest in watch mode
pnpm test:e2e         # E2E tests (test/jest-e2e.json config)
pnpm lint             # ESLint with --fix
pnpm format           # Prettier
```

Run a single test file:
```bash
cd apps/commons-api && npx jest src/agent/heartbeat.service.spec.ts
```

### Frontend (`apps/commons-app/`)
```bash
pnpm dev              # Next.js dev server
pnpm build            # Production build
pnpm lint             # next lint
```

### CLI (`packages/agc-cli/`)
```bash
pnpm build            # tsup bundle → dist/
pnpm dev              # tsup --watch
pnpm typecheck        # tsc --noEmit
```

### SDK (`packages/commons-sdk/`)
```bash
pnpm build            # tsup → dist/ (CJS + ESM + types)
pnpm test             # Jest
```

### Database migrations (from `apps/commons-api/`)
```bash
npx drizzle-kit generate   # Generate SQL migration from schema changes
npx drizzle-kit migrate    # Apply pending migrations
npx drizzle-kit studio     # Browse DB in browser
```

Manual migration scripts live in `apps/commons-api/migrations/` and are `.sql` or `.mjs` files run directly.

---

## Architecture

### Backend — NestJS + LangGraph

The core of the platform is `AgentService.runAgent()` in `apps/commons-api/src/agent/agent.service.ts`. It builds a **LangGraph `StateGraph`** with a `PostgresSaver` checkpointer, binds all available tools, and returns an RxJS `Observable<StreamEvent>`. The controller exposes this as:

- `POST /v1/agents/run` — non-streaming (waits for final emission)
- `POST /v1/agents/run/stream` (SSE) — streaming; emits `token`, `toolStart`, `toolEnd`, `cli_tool_request`, `keepalive`, `final`, `error`

**CLI local tools** (`cli_tool_request` events): when the agent is called from `agc chat --local`, the backend emits `cli_tool_request` SSE events instead of executing filesystem/shell tools server-side. The CLI executes the tool locally and POSTs the result to `POST /v1/agents/cli-tool-result`, which resolves a pending Promise in `AgentService.pendingCliToolRequests` (an in-memory Map).

**Tool loading** (`ToolLoaderService`): tools come from three sources — static platform tools (Typia-generated from `CommonTool` interface), user-created dynamic tools (stored in the `tool` table, called via their `endpoint`), and MCP server tools (discovered via `McpToolDiscoveryService`). Space-specific tools are added when a run is scoped to a space.

**Heartbeat / autonomous mode** (`HeartbeatService`): when `autonomyEnabled = true` and `autonomousIntervalSec > 0` on an agent, `HeartbeatService` fires a scheduled self-prompt at that interval. This is separate from the SSE `keepalive` events (which are just HTTP keepalives to prevent load-balancer timeouts).

**Model providers** (`ModelProviderFactory`): agents can specify `modelProvider` (`openai`, `anthropic`, `google`, `groq`, `mistral`, `ollama`) and `modelId`. BYOK API keys are stored encrypted in `agent.modelApiKey`. The factory is a global NestJS module.

**Auth**: all API routes are protected by `ApiKeyGuard` (global `APP_GUARD`). Keys come in two forms:
- Management key: matches `API_SECRET_KEY` env var — used by commons-app backend calls
- Per-principal: `sk-ac-<32 hex>` keys stored in the `api_keys` table

**Rate limiting**: `RateLimitGuard` is also a global guard (120 req/min per agent by default).

### Database — Drizzle ORM + PostgreSQL

Schema lives in `apps/commons-api/models/schema.ts` (note: `models/` not `src/`). The `DatabaseService` is a thin provider wrapping `drizzle()` — it extends `PostgresJsDatabase<typeof schema>` so the injected service IS the Drizzle db object.

Path aliases in the API:
- `~/` → `apps/commons-api/src/`
- `#/` → `apps/commons-api/` (used for `#/models/schema`)

Key tables: `agent`, `agent_wallet`, `session`, `goal`, `task`, `tool`, `agent_tool`, `tool_key`, `workflow`, `workflow_execution`, `space`, `space_message`, `agent_memory`, `mcp_server`, `skill`, `api_keys`, `usage_event`.

### Frontend — Next.js 15 App Router

`apps/commons-app/app/` is the App Router. Main routes: `/agents`, `/sessions`, `/tasks`, `/tools`, `/workflows`, `/spaces/[spaceId]`, `/studio`, `/wallets`, `/logs`, `/usage`, `/settings/api-keys`.

Auth uses **Privy** (`@privy-io/react-auth`). State management uses **Zustand**. The frontend calls the backend directly using the `@agent-commons/sdk` (or raw fetch to the API URL).

### CLI — `agc`

The CLI is in `packages/agc-cli/src/`. Main commands: `chat`, `run`, `agents`, `sessions`, `tools`, `task`, `workflow`, `mcp`, `skills`, `wallet`, `memory`, `usage`, `logs`, `models`.

`agc chat` is an interactive readline REPL. It creates/resumes a session, calls `client.agents.stream()` per user message, and handles `cli_tool_request` SSE events via `local-tools.ts` (filesystem + shell tools sandboxed to cwd). Session logs are saved to `~/.agc/sessions/<sessionId>.jsonl`.

Config lives at `~/.agc/config.json`.

### SDK — `@agent-commons/sdk`

`packages/commons-sdk/src/client.ts` — `CommonsClient` class that wraps all API calls. Exported from `packages/commons-sdk/src/index.ts`. Used by both `agc-cli` and `commons-app`.

### Spaces (real-time)

Spaces support live audio (WebRTC via `@koush/wrtc`), screen/web capture, and multi-agent collaboration. Key services: `SpaceRtcGateway` (Socket.io WebSocket), `TranscriptionDeliveryService`, `SpaceToolsService`, `SpaceTtsService`. Agents can speak in spaces via the `speakInSpace` tool.

### A2A (Agent-to-Agent)

The `a2a` module implements the Google A2A protocol. Agents with `a2aEnabled = true` expose a `.well-known/agent.json` card and accept tasks via `A2aController`.

### Payments — USDC on Base Sepolia

Agent wallets use viem EOA keypairs (stored encrypted in `agent_wallet.encryptedPrivateKey`). The platform uses **USDC** (not CommonToken) for all billing flows. USDC contract on Base Sepolia: `0x036CbD53842c5426634e7929541eC2318f3dCF7e`.

---

## CI/CD and versioning

Version bumps are handled automatically by CI via changesets — **never manually edit `package.json` version fields**. Use `pnpm changeset` to create a changeset entry for a PR.

Release scripts: `scripts/release-manual.sh` (patch/minor/major).

---

## Environment setup

Copy `.env.example` files:
```bash
cp apps/commons-api/.env.example apps/commons-api/.env
cp apps/commons-app/.env.example apps/commons-app/.env
```

Key API env vars: `POSTGRES_*`, `OPENAI_API_KEY`, `PINATA_JWT`, `GATEWAY_URL`, `SUPABASE_URL`, `SUPABASE_KEY`, `TOOL_KEY_ENCRYPTION_MASTER`, `API_SECRET_KEY`.

Set `API_AUTH_REQUIRED=false` in `.env` to disable API key enforcement in local dev.

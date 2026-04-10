# Agent Commons

Agent Commons is a platform for building, running, and connecting AI agents. Create agents that hold wallets, run on schedules, use external tools, collaborate with each other, and execute complex multi-step workflows.

**Web app:** [agentcommons.io](https://www.agentcommons.io)

---

## Documentation

- [**Quickstart**](./docs/quickstart.md) — Run your first agent in 5 minutes
- [**Core Concepts**](./docs/concepts.md) — Agents, sessions, tasks, workflows, tools
- [**Web UI Guide**](./docs/ui.md) — Walkthrough of every page
- [**REST API Reference**](./docs/api.md) — All endpoints with examples
- [**TypeScript SDK**](./docs/sdk.md) — Programmatic access
- [**CLI Reference**](./docs/cli.md) — Terminal commands

### Guides
- [Building Agents](./docs/guides/agents.md)
- [Tools & MCP](./docs/guides/tools-mcp.md)
- [Workflows](./docs/guides/workflows.md)
- [Tasks & Scheduling](./docs/guides/tasks.md)
- [Agent-to-Agent (A2A)](./docs/guides/a2a.md)
- [Wallets & Payments](./docs/guides/wallets.md)
- [Memory](./docs/guides/memory.md)

---

## Project structure

```
agent-commons/
├── apps/
│   ├── commons-app/        # Next.js 15 frontend
│   └── commons-api/        # NestJS 11 backend API
├── packages/
│   └── sdk/                # @agent-commons/sdk (TypeScript SDK)
├── cli/                    # agc CLI tool
├── onchain/                # Hardhat smart contracts + subgraph
│   ├── contracts/          # Solidity contracts (Base Sepolia)
│   └── commons-subgraph/   # The Graph Protocol subgraph
├── docs/                   # Documentation
└── pnpm-workspace.yaml
```

---

## Running locally

### Prerequisites

- Node.js 20+
- pnpm: `npm install -g pnpm`
- PostgreSQL

### Install dependencies

```bash
pnpm install
```

### Environment variables

```bash
cp apps/commons-api/.env.example apps/commons-api/.env
cp apps/commons-app/.env.example apps/commons-app/.env
```

Fill in the required variables (see [configuration](#configuration) below).

### Start the API

```bash
cd apps/commons-api
pnpm start:dev
# → http://localhost:3001
```

### Start the frontend

```bash
cd apps/commons-app
pnpm dev
# → http://localhost:3000
```

---

## Configuration

Key environment variables for `apps/commons-api/.env`:

```bash
# Database
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_USER=postgres
POSTGRES_PASSWORD=your_password
POSTGRES_DATABASE=agent_commons

# LLM
OPENAI_API_KEY=sk-...

# Storage
PINATA_JWT=...
GATEWAY_URL=...

# Vector DB
SUPABASE_URL=https://...
SUPABASE_KEY=...

# Security (32-byte hex, for encrypting stored API keys)
TOOL_KEY_ENCRYPTION_MASTER=...

# Optional OAuth
GOOGLE_OAUTH_CLIENT_ID=...
GOOGLE_OAUTH_CLIENT_SECRET=...
GITHUB_OAUTH_CLIENT_ID=...
GITHUB_OAUTH_CLIENT_SECRET=...
```

---

## Smart contracts (Base Sepolia)

| Contract | Address |
|---|---|
| AgentRegistry | `0x86d05BF72913b5f462343a42314FC6c90d501575` |
| CommonToken (COMMON$) | `0x09d3e33fBeB985653bFE868eb5a62435fFA04e4F` |
| CommonResource | `0x16D3581DFec6e75006cBB6b7c6D513CDd2026a27` |
| TaskManager | `0xb12a9f7F5240e5E226445966Cd27C1c4736E095D` |
| Attribution | `0x7F812FD820a18F199B5C66ff05387DBbEB6694FB` |

**Subgraph endpoint:**
```
https://api.studio.thegraph.com/query/102152/agentcommons-testnet/v0.0.6
```

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 15, React 19, TailwindCSS, Privy auth |
| Backend | NestJS 11, TypeScript, Drizzle ORM |
| Database | PostgreSQL, Supabase (vectors) |
| AI | LangGraph, OpenAI / Anthropic / Google / Groq / Mistral |
| Storage | IPFS via Pinata |
| Blockchain | Solidity, Hardhat, Base Sepolia, The Graph |
| Real-time | Socket.io, WebRTC |

---

## Contributing

```bash
git checkout -b feature/your-feature
# make changes
git commit -m "feat: description"
# open a pull request
```

---

## License

[MIT](LICENSE)

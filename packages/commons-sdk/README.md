# `@agent-commons/sdk`

The official TypeScript SDK for Agent Commons. Build and run agents, stream
responses, manage tools and workflows, work with persistent agent computers,
and access the wider Agent Commons platform through one typed client.

- TypeScript-first with bundled declarations
- ESM and CommonJS builds
- Node.js 18+, modern browsers, and edge runtimes
- Streaming agent, task, workflow, and A2A events
- No runtime dependencies

## Install

```bash
npm install @agent-commons/sdk
```

```bash
pnpm add @agent-commons/sdk
```

## Get a developer API key

Create a project-scoped key in **Agent Commons → Settings → Developer API
keys**. Choose the project, scopes, and expiration, then copy the `csk_*` key
when it is shown.

Keep keys on the server. Do not embed them in browser bundles, mobile apps, or
source control.

## Quick start

```ts
import { CommonsClient } from "@agent-commons/sdk";

const commons = new CommonsClient({
  apiKey: process.env.AGENT_COMMONS_API_KEY,
});

const { data: agent } = await commons.agents.create({
  name: "Research assistant",
  instructions: "Research carefully and cite your sources.",
  modelProvider: "openai",
  modelId: "gpt-5.4-mini",
});

const result = await commons.run.once({
  agentId: agent.agentId,
  messages: [{ role: "user", content: "Summarize the latest session." }],
});

console.log(result);
```

`baseUrl` defaults to `https://api.agentcommons.io`.

## Stream a run

```ts
for await (const event of commons.agents.stream({
  agentId: "agt_...",
  messages: [{ role: "user", content: "Draft a launch plan." }],
})) {
  if (event.type === "token") {
    process.stdout.write(event.content ?? "");
  }

  if (event.type === "final") {
    console.log("\nDone");
  }
}
```

Streaming is implemented with async generators and works anywhere the Fetch
API and readable response streams are available.

## Core resources

The client groups methods by platform resource:

| Namespace | Capabilities |
| --- | --- |
| `agents` | Agents, runtimes, autonomy, tools, knowledge, computers |
| `sessions` | Create, list, inspect, rename, and delete sessions |
| `tasks` | Tasks, scheduling, execution, cancellation, streaming |
| `workflows` | Build, fork, run, approve, stream, and expose webhooks |
| `tools`, `toolKeys`, `toolPermissions` | Tools, encrypted credentials, access |
| `mcp`, `skills`, `memory` | MCP servers, reusable skills, agent memory |
| `files`, `library` | Multipart uploads, content, metadata, grants, share links |
| `projects` | Agent-created code projects, previews, computer and GitHub export |
| `spaces` | Collaborative spaces, members, messages, and RTC tickets |
| `oauth` | Connected accounts and provider authorization |
| `wallets`, `credits`, `billing` | Wallets, x402, credits, plans, invoices |
| `activity`, `logs`, `usage` | Activity, observability, tokens, and cost |
| `a2a` | Agent-to-Agent cards, tasks, cancellation, and streaming |
| `developer` | Developer projects and project-scoped API keys |

Every namespace is available from the same client:

```ts
const [{ data: agents }, { data: library }, { data: projects }] =
  await Promise.all([
    commons.agents.list(),
    commons.library.list({ favorite: true, limit: 20 }),
    commons.projects.list("agt_..."),
  ]);
```

## Files and library

```ts
const { data: uploaded } = await commons.files.upload(
  [{ data: new Blob(["hello"]), name: "hello.txt" }],
  { agentId: "agt_...", storageProvider: "s3" },
);

const { data: content } = await commons.files.content(uploaded[0].fileId, {
  maxChars: 20_000,
  includeDownloadUrl: true,
});
```

## Persistent agent computers

```ts
await commons.agents.updateComputerConfig("agt_...", {
  enabled: true,
  resourceProfile: "standard",
});

await commons.agents.wakeComputer("agt_...");

const { data: execution } = await commons.agents.execComputer("agt_...", {
  command: "pnpm test",
  cwd: "/workspace",
});
```

## Connected accounts

```ts
const { providers } = await commons.oauth.listProviders();

const authorization = await commons.oauth.connect({
  providerKey: providers[0].providerKey,
});

console.log(authorization.authorizationUrl);
```

## Manage developer projects and API keys

Interactive users should normally manage keys in Settings or with the Agent
Commons CLI. Authenticated developer tooling can use the same identity API:

```ts
const account = new CommonsClient({
  identityUrl: "https://auth.agentcommons.io",
  identityToken: process.env.COMMONS_ACCOUNT_TOKEN,
});

const { data: projects } = await account.developer.listProjects();

const { data: created } = await account.developer.createApiKey(projects[0].id, {
  name: "CI deployment",
  scopes: ["agents:read", "agents:run"],
});

console.log(created.key); // Shown once
```

The `apiKeys` namespace remains available for legacy per-principal `sk-ac-*`
keys. New integrations should use project-scoped `csk_*` keys.

## Configuration

```ts
const commons = new CommonsClient({
  baseUrl: "https://api.agentcommons.io",
  apiKey: process.env.AGENT_COMMONS_API_KEY,
  initiator: "usr_...", // Optional delegation context
  fetch: customFetch, // Optional Fetch-compatible implementation
});
```

| Option | Description |
| --- | --- |
| `baseUrl` | Agent Commons API origin |
| `apiKey` | Project API key or Commons access token |
| `initiator` | Optional delegated principal ID |
| `identityUrl` | Commons Identity origin for `developer` methods |
| `identityToken` | Account session/OAuth token for `developer` methods |
| `fetch` | Custom Fetch-compatible implementation |

## Errors

Non-successful responses throw `CommonsError`.

```ts
import { CommonsError } from "@agent-commons/sdk";

try {
  await commons.agents.get("missing");
} catch (error) {
  if (error instanceof CommonsError) {
    console.error(error.status, error.message, error.data);
  }
}
```

## Security

- Use a separate developer project for each environment.
- Grant the smallest useful scope set.
- Prefer expiring keys for CI, previews, and temporary integrations.
- Revoke a key immediately if it may have been exposed.
- Use OAuth connections for third-party accounts; do not pass provider tokens
  through your application.

## Links

- [Documentation](https://docs.agentcommons.io)
- [Agent Commons](https://www.agentcommons.io)
- [GitHub](https://github.com/Arttribute/agent-commons)
- [Issues](https://github.com/Arttribute/agent-commons/issues)

## License

MIT

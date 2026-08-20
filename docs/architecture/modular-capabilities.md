# Modular capabilities and UI plugins

This document describes the first stable extension boundary for Agent Commons.
It is intentionally small: providers replace a backend capability, skills teach
agents how to use capabilities, and UI plugins add isolated user interfaces.

## Implemented surfaces

| Surface        | Ownership and selection                                                      | Runtime boundary                                             |
| -------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Web search     | One active account configuration; Commons, Brave, Tavily, SearXNG, or custom | Normalized search result adapter                             |
| Agent computer | CommonOS by default or an account-owned custom adapter                       | CommonOS-compatible HTTPS API                                |
| Wallet         | Commons managed, owner-connected, or custom                                  | HTTPS wallet create/balance/transfer API                     |
| Skills         | User/platform catalog with explicit per-agent assignments                    | Only enabled assignments enter an agent prompt or invocation |
| UI plugins     | Account-owned published code project and reviewable manifest                 | Sandboxed iframe page or floating widget                     |

Credentials are encrypted at rest and are never returned by list APIs. Custom
provider endpoints must be public HTTPS URLs. Secrets belong in `credentials`,
not in the inspectable `settings` object.

## Provider contracts

### Custom web search

The adapter supports GET or POST and maps a JSON response to the Commons result
shape. `settings` can contain `method`, `queryField`, `countField`,
`apiKeyHeader`, `apiKeyPrefix`, `resultsPath`, `titlePath`, `urlPath`,
`descriptionPath`, and `publishedAtPath`.

### Custom computer

The endpoint implements the CommonOS `/computers` contract. Commons forwards
the platform paths, an optional `settings.basePath`, bearer credentials, and
`x-agent-commons-agent-id`. This preserves the durable computer identity while
allowing a provider to replace the runtime.

### Custom wallet

The endpoint accepts:

- `POST /wallets` with `{ agentId, label, chainId }` and returns an address plus
  an optional `walletId`.
- `GET /wallets/:providerWalletId/balance`.
- `POST /wallets/:providerWalletId/transfer` with the Commons transfer body.

## UI plugin manifest v1

UI plugins are generated as ordinary Commons code projects, published and
tested, then registered as a draft. A user must explicitly enable the draft.

```json
{
  "schemaVersion": "1",
  "surfaces": [
    { "type": "page", "title": "Operations" },
    { "type": "widget", "title": "Queue", "width": 380, "height": 480 }
  ],
  "permissions": ["theme.read", "navigation"]
}
```

The iframe has scripts, forms, popups, downloads, and clipboard write, but no
same-origin access to the host. `theme.read` returns only theme and plugin ID.
`navigation` accepts only validated internal paths. There is deliberately no
general host API, token, cookie, filesystem, or DOM permission.

The bundled `build-commons-ui-plugin` skill directs Commons Copilot to create,
publish, browser-test, and register the plugin. Registration always creates a
draft so generated code cannot appear in the host UI without review.

## Design references

- [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) treats the
  harness as a small plugin-oriented core.
- [Agent Plugins specification](https://agent-plugins.org/specification) uses a
  versioned manifest and fixed extension directories.
- [Harness Protocol](https://harnessprotocol.io/docs/getting-started) separates
  agents from the harness they run within.
- [MCP Apps](https://modelcontextprotocol.io/extensions/apps/overview) embeds
  interactive interfaces through a sandbox and explicit host bridge.

The Commons implementation follows those separation principles while keeping
its manifest and provider contracts owned and versioned by this repository.

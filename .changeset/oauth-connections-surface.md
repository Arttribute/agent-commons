---
"@agent-commons/sdk": minor
"@agent-commons/cli": minor
---

Add OAuth connection management: `client.oauth` namespace in the SDK
(listProviders, listConnections, connect, refresh, test, revoke) and a new
`agc connections` command (list, providers, connect, test, revoke) so users
can connect and inspect the accounts (Google Workspace, GitHub, Slack, …)
their agents act with.

---
"@agent-commons/sdk": minor
"@agent-commons/cli": minor
---

Add billing and feature-flag surfaces.

SDK: `client.billing` (subscription, entitlements, subscribe, topup, portal) and
`client.flags` (all, evaluate), plus `SubscriptionInfo`, `PlanEntitlements`,
`PlanKey`, and `FlagEvaluation` types.

CLI: `agc credits` (balance, ledger) and `agc billing` (status, upgrade, topup).

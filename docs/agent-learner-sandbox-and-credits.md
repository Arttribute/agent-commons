# Agent Learner Sandbox and Shared Credits

## Sandbox Model

CommonLab skill challenges can now carry an `agentSandbox`-style configuration on
the skill challenge record. The sandbox is intentionally a controlled projection
of Agent Commons capabilities:

- identity and system prompt editing
- reusable skill selection
- tool and connector selection
- task setup
- simple workflow preview
- run preview and logs
- credit rewards

Educators choose the visible capabilities and the required completion gates per
challenge. This lets a beginner path expose only prompt, skill, tool, and run
controls, while later lessons can expose tasks, workflows, connectors, and logs.

When a learner completes the sandbox, CommonLab attempts to create a real Agent
Commons agent owned by the learner's harmonized `identityUserId`. If the
identity or Agent Commons service credentials are unavailable, the sandbox
returns a simulated completion so learning is not blocked. Real platform agents
should remain the source of truth for agents, tools, tasks, and workflows.

## Cross-Platform Ownership

Use the Commons Identity principal as the join key:

- `identityUserId` owns platform agents in Agent Commons.
- CommonLab enrollment/progress stores the learning context.
- Agent Commons activity events verify practical learning requirements.
- Course-created agents are normal platform agents with metadata indicating
  their CommonLab course/challenge origin.

The preferred direction is one-way creation into Agent Commons, not duplicated
agent storage in CommonLab. CommonLab should store only progress, sandbox
configuration, completion evidence, and display metadata.

## Credit Ledger Direction

The shared credit system is implemented as a ledger, not a mutable balance field.

Recommended entries:

- `course_completed`
- `skill_path_completed`
- `sandbox_agent_created`
- `daily_login_bonus`
- `admin_grant`
- `agent_run_debit`
- `tool_run_debit`
- `workflow_run_debit`
- `refund`
- `expiration`

Each ledger event should include:

- `ledgerEntryId`
- `identityUserId`
- `workspaceId`
- `sourcePlatform`: `commonlab`, `agent_commons`, or `common_os`
- `eventType`
- `amount`
- `currency`: initially `credits`
- `relatedCourseId`, `relatedChallengeId`, `agentId`, `taskId`, or `workflowId`
- `idempotencyKey`
- `metadata`
- `createdAt`

Balances should be derived by summing ledger entries, with a materialized
balance/cache allowed for fast reads. All reward and debit writers need
idempotency keys so retries do not double-award or double-charge.

For Agent Commons billing, usage events should debit credits through this ledger
after token/cost calculation. The existing usage event stream remains the audit
trail for model calls; the credit ledger becomes the commercial balance of
record.

Implemented platform API:

- `GET /v1/credits/balance`
- `GET /v1/credits/ledger`
- `POST /v1/credits/grants`
- `POST /v1/credits/debits`

Writes require a management/service credential or a principal with
`credits:write`. Reads are self-scoped unless the caller is a service or has
`credits:read`.

Important rollout flags:

- `CREDIT_UNITS_PER_USD`: default `1000`
- `CREDIT_DEBITS_ENABLED`: default off; set to `true` to debit usage events
- `CREDIT_ALLOW_NEGATIVE_BALANCE`: default off

## Pricing Model

Use credits as the platform unit and keep local currencies outside the ledger.
Recommended default:

- 1 USD of platform value = 1000 credits.
- Model usage debit = `ceil(costUsd * CREDIT_UNITS_PER_USD)`.
- BYOK usage does not debit platform credits by default.
- Tool, workflow, storage, and compute debits should use idempotent ledger
  entries with source-specific event types.

Paid courses should not automatically accept credits unless the educator has
enabled credit acceptance for that course. That policy should define:

- maximum percent of price payable by credits
- educator settlement behavior
- refund/reversal rules
- whether promotional/system-granted credits are eligible

Credit grants should remain system-controlled. Educators can sponsor credits
through approved campaign or scholarship flows, but direct arbitrary educator
minting should not exist.

## Next Backend Steps

1. Apply `apps/commons-api/migrations/add-credit-ledger.sql` in production.
2. Seed initial learner balances or launch reward campaigns through
   `/v1/credits/grants`.
3. Show one balance in both CommonLab and Agent Commons dashboards.
4. Add course-level credit acceptance settings for paid courses.
5. Add Common OS compute debit event types.
6. Add admin tools for grants, reversals, and audit review.
7. Enable `CREDIT_DEBITS_ENABLED=true` after balances, monitoring, and support
   workflows are ready.

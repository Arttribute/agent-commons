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

The shared credit system should be a ledger, not a mutable balance field.

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

## Next Backend Steps

1. Add a shared credit ledger module to the platform API.
2. Expose service-authenticated credit grant/debit endpoints.
3. Add idempotency keys to CommonLab skill completion rewards.
4. Connect Agent Commons usage recording to credit debits.
5. Show one balance in both CommonLab and Agent Commons dashboards.
6. Add admin tools for grants, reversals, and audit review.

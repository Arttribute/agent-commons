# Agent Commons credit economics

Reviewed: 2026-07-16. All amounts are USD unless stated otherwise.

## Product model

Every plan permits unlimited logical agents. The subscription limits how many
agents may retain a persistent computer and how many runtimes/runs may operate
in parallel. Credits are the shared usage allowance for managed model tokens
and active computer time.

| Public plan | Internal key | Price/mo | Monthly credits | Computer slots | Active computers | Agent runs |
| ----------- | ------------ | -------: | --------------: | -------------: | ---------------: | ---------: |
| Free        | `free`       |       $0 |     Earned only |              0 |                0 |          2 |
| Builder     | `plus`       |      $20 |           5,000 |              1 |                1 |          4 |
| Pro         | `pro`        |      $50 |          15,000 |              3 |                2 |          8 |
| Scale       | `max`        |     $150 |          50,000 |             10 |                5 |         16 |

The internal keys deliberately stay stable so existing subscriptions keep
resolving. Product-facing names and allowances come from the API catalog, not
duplicated UI constants.

Top-ups are deliberately less generous than subscription allowances:

| Price | Credits | Effective sale price/credit |
| ----: | ------: | --------------------------: |
|   $10 |   4,000 |                    $0.00250 |
|   $50 |  22,000 |                    $0.00227 |
|  $100 |  48,000 |                    $0.00208 |

## Credit conversion and guardrails

- Accounting unit: 1,000 credits per internal dollar.
- Managed model debit: `ceil(provider_cost_usd × 1,000 × 2.0)`. The default
  2× model multiplier leaves a 50% contribution margin before fixed platform
  cost and payment fees. Provider price changes must be updated in the model
  registry before the model remains available as a managed model.
- A model call is pre-authorized using estimated input tokens and its configured
  maximum output before the provider request. Actual tokens are then captured;
  unused authorization is released at run completion. Cached input is charged
  at the provider's published cache-read rate rather than omitted or charged as
  full-price input.
- BYOK calls do not debit provider-token cost, but an agent run has a one-credit
  platform minimum.
- Paid tools are authorized before their provider call and captured separately:
  Brave web search uses its $0.005/call list rate; transcription uses the
  configured audio minutes; speech uses provider characters; GPT Image 2 uses
  the requested size/quality output table plus prompt tokens. Every rate is
  passed through the same 2× multiplier. Integer accounting has a one-credit
  minimum per paid provider call.
- Active computer rates are 2/7/14/70 credits per minute for Starter,
  Standard, Performance, and GPU. Metering is wake-to-sleep. With no available
  credits the runtime is stopped; negative credit balances are not permitted.
- Persistent workspace retention is included in the subscription computer slot.
  Storage remains measured internally. A future separately billed storage SKU
  should be added only after retained-GB telemetry is reliable; storage may grow
  but never shrink.
- Credit writes, Stripe events, gifts, and campaign claims are idempotent.
  Principal advisory locks plus the atomic account prevent concurrent overspend.
- Promotional grants use FIFO lots and exact remaining-value expiry. A gift
  preserves the earliest expiry of the source lots, preventing reward laundering.

## Engagement budget

The daily check-in grants 10 credits, expires after 35 days, and is capped at
200 credits per user per month. This is enough to sample small managed-agent
work over repeated visits but intentionally cannot replace a subscription.

The hard-enforcement rollout also exposes a one-time 500-credit Builder launch
bonus. It expires after 45 days and has a 100,000-credit global campaign budget,
giving existing staging users enough room to evaluate metered work without
creating a permanent free allowance.

CommonLab is the first external reward source:

- eligible course completion: 250 credits, maximum 1,000/month/user;
- verified practical skill challenge: 50 credits, maximum 500/month/user.

The programmable campaign table owns reward amount, source, trigger cadence,
per-user limits, global budget, dates, visibility, eligibility metadata, and
expiry metadata. Source platforms submit only verified event evidence; they do
not choose the credit amount. Platform admins can create or change campaigns
through the scoped campaign API.

## Observed infrastructure baseline

AWS Cost Explorer was queried for gross `Usage` cost so promotional AWS credits
do not hide the operating baseline:

- June 2026: approximately $365.21 gross AWS usage.
- July 1–16, 2026: approximately $384.59 gross, implying roughly $700–$750 for
  a full month at the then-current run rate.
- June's largest components were ECS/Fargate ($120.99), EC2 compute ($94.68),
  CodeBuild ($47.23), EKS ($44.25), VPC ($22.82), EFS ($12.33), and load
  balancing ($11.23).
- The current agent-compute EKS fleet had three on-demand `t3.large` nodes,
  three 40-GiB gp3 volumes, an EKS control plane, and an application load
  balancer. ECS also hosts production/staging APIs, identity, gateway, CommonOS,
  and Fargate agent tasks.

This baseline excludes managed-model providers, Stripe fees, MongoDB, Vercel,
support, and payroll. It must therefore not be treated as total cost of revenue.
Review the gross bill and realized credit revenue monthly. Do not price against
temporary cloud promotional credits.

## Market anchors used

- E2B bills CPU and memory by the second and lists a $150/month Pro platform
  plan plus usage: <https://e2b.dev/pricing> and <https://e2b.dev/docs/billing>.
- Daytona publishes separate CPU, RAM, storage, and GPU unit prices:
  <https://www.daytona.io/>.
- Replit bundles a monthly credit allowance and exposes usage budgets/hard caps:
  <https://replit.com/pricing> and <https://docs.replit.com/billing/ai-billing>.
- Manus uses a small daily-refresh allowance to create a return habit without
  replacing paid membership:
  <https://help.manus.im/en/articles/11711111-what-is-the-current-membership-pricing-for-manus>.
- EKS charges for the control plane separately from worker compute and storage:
  <https://aws.amazon.com/eks/pricing/>.
- Current OpenAI model prices and long-context multipliers are sourced from the
  individual model pages, for example
  <https://developers.openai.com/api/docs/models/gpt-5.4> and
  <https://developers.openai.com/api/docs/models/gpt-5.4-mini>.
- Image, transcription, and speech rates are sourced from
  <https://developers.openai.com/api/docs/pricing>,
  <https://developers.openai.com/api/docs/guides/image-generation>, and
  <https://developers.openai.com/api/docs/models/gpt-4o-mini-tts>.
- Brave Search lists web search at $5 per 1,000 calls:
  <https://brave.com/search/api/>. ElevenLabs provider pricing is sourced from
  <https://elevenlabs.io/pricing/api>.
- Current Anthropic prices are sourced from
  <https://platform.claude.com/docs/en/about-claude/pricing>.

## Monthly operating review

1. Export gross cloud and model-provider cost, paid credit grants, consumed
   credits, unused/expired credits, and Stripe net revenue.
2. Calculate contribution margin by plan and by usage SKU.
3. Alert if realized managed-model markup falls below 1.8×, computer gross
   margin falls below 65%, promotional grants exceed 10% of paid grants, or one
   campaign exceeds its approved budget.
4. Change public prices through new Stripe Prices (never mutate historical
   Prices), then update the environment mapping and catalog in one release.

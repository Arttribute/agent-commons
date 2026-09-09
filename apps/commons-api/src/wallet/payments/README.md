# Owner-scoped agent payments

Agents reuse their existing encrypted EOA wallet. The Arcade UI at `/agents` and on a game table lets the owner select a wallet and runtime session, inspect network balances, create a spending grant, inspect attempts, and revoke the grant. No private key is sent to the browser.

Apply `migrations/versioned/033_wallet_payment_sessions.sql` through the existing `pnpm --filter commons-api migrate` runner before enabling these routes. The container deployment already invokes that runner. The migration creates separate grant and attempt tables; it does not replace wallets or move balances.

## Shared API

Routes below are relative to the existing authenticated `/wallets` controller:

- `GET agent/:agentId/runtime-sessions`: owner-visible recent session summaries.
- `GET :walletId/balance?chainId=84532`: canonical USDC and native gas balances on Base Sepolia, Base, Arc testnet or Hedera testnet.
- `POST agent/:agentId/payment-sessions`: the user owner creates a grant with `walletId`, `runtimeSessionId`, `policy`, `budgetUnits`, and `expiresAt` (at most 24 hours).
- `GET agent/:agentId/payment-sessions`: inspect grants, including revocations and expiry.
- `GET agent/:agentId/payment-sessions/:id/attempts`: inspect reserved payments and settlement evidence.
- `DELETE agent/:agentId/payment-sessions/:id`: revoke future authorization.
- Existing x402 fetch accepts `paymentSessionId`, `runtimeSessionId` and a unique `idempotencyKey`; a paid response requires all three.
- `POST agent/:agentId/arcade/deposit`: only the grant's stake, bounty or spectator bet operation for its fixed pool and recipient.
- `POST agent/:agentId/arcade/observation` and `/arcade/action`: fetch the seat's private observation and sign a bounded game command at the grant's exact service origin.

Use the exported `SpendingPolicy` in `policy.ts` and service method parameter types for request fields. Amounts are decimal integer strings in six-decimal USDC atomic units. Policies bind network, canonical asset, exact recipient, exact HTTPS origin, per-payment maximum and optional Arcade pool, seat and permitted operations. A grant cannot authorize arbitrary calldata or unlimited token allowances. Only an authenticated user owner can create one; the named agent, owner, or owner-delegated service with `wallets:execute` can execute it. Broad `agents:write` scope is insufficient. Direct transfers require the user owner.

## Settlement and retry behavior

Reserve the budget under a PostgreSQL row lock before signing. A unique idempotency key prevents duplicate spending attempts. Revocation and expiry prevent new reservations; they cannot retract a signature or transaction already issued. Unknown outcomes retain their budget reservation: an HTTP failure is not evidence that funds did not move. Reconcile the recorded transaction before taking further action; never automatically refund uncertain budget.

x402 v2 quotes must match the grant, asset and supported scheme. Redirects are rejected. EVM uses the official exact scheme with explicit SDK spend controls. Hedera uses the existing ECDSA key through the native Hedera scheme, after verifying the mirror-node account mapping and USDC association. External/custom/4337 wallet providers need a separate signer adapter and cannot use this EOA path.

Arcade deposits check live contract status, token, funding deadline and the wallet assigned to the seat, then use an exact allowance, simulation and confirmed transaction receipt. Game winners and refund beneficiaries are fixed in escrow; permissionless payout triggers do not permit redirecting funds.

USDC payment budgets do not include network gas. Keep a small testnet gas balance. On Arc, native USDC and ERC-20 USDC are two views of the same balance with different decimals, so gas reduces the same underlying balance. Mainnet autonomous payments remain disabled by policy.

## Verification and deployment boundary

Run `PAYMENT_TEST_DATABASE_URL=postgres://... pnpm --filter commons-api exec jest --runInBand 'wallet/payments|modules/x402/x402.guard.spec.ts'` against a disposable PostgreSQL database. Tests cover concurrent reservations, authorization, expiry/revocation, quote restrictions and settlement-before-access. Source typecheck: `pnpm --filter commons-api exec tsc --noEmit -p tsconfig.build.json`.

Companion implementation: Common Arcade `packages/contracts`, `packages/economy`, `services/payment-service`, and `docs/payments/runbook.md`. Public testnets require deployed Safe-governed contracts, configured service origins/recipients, funded wallets and a compatible facilitator. Local fixture tests do not prove a live Blocky402 request, public payout, or bounty eligibility.

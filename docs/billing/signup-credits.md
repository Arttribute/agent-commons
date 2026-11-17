# Signup welcome credits

Commons Identity signups from 17 November 2026 at 00:00 Africa/Nairobi
(`2026-11-16T21:00:00Z`) receive 100,000 welcome credits when their account
is created, including email/password and Google signups. This does not change
their subscription plan or referral rewards.

Automatic welcome funding does not count as earlier product use for referral
eligibility. Other credit activity before the attested first app activation
still prevents retroactive referral attribution.

GPT-5.5 is the default for new agents and all existing personal copilots. Free
users can use this default with credits; other frontier models keep their plan
requirements. Explicit model overrides in other agents and sessions are retained.

Identity commits a pending delivery with the personal workspace, then awaits
the Commons API's authenticated `POST /v1/credits/signup` before completing
signup. A failed or uncertain delivery remains pending; a worker retries every
15 seconds with a 30-second claim lease. Startup also queues qualifying users
who registered before this policy was deployed. Sign-in and account linking do
not create new rewards.

The API serializes each principal's ledger writes and uses a stable signup
idempotency key. The existing welcome grant counts toward the 100,000 total;
unrelated gifts, purchases and spending are preserved. Retrying never refills
spent credits. Users registered before the cutoff keep their current policy.

The Identity runtime needs `SIGNUP_CREDITS_API_URL` and a dedicated OAuth
service's `SIGNUP_CREDITS_CLIENT_ID` and `SIGNUP_CREDITS_CLIENT_SECRET` in its
AWS runtime secret. Register the service for `client_credentials`,
`credits:write`, and workspace `signup:production` (or `signup:staging`).
Keep this scope out of interactive account and application tokens. The endpoint
also accepts an environment-matched operations service for controlled checks.

Deploy the API endpoint before the Identity worker. Update existing personal
copilots through the authenticated agent API after the new model authorization
is live, so old API replicas never reject their new default. Identity has no staging
deployment; its signup journeys run locally and in CI, followed by production
verification of the delivery queue and ledger. Customer records and secrets
stay outside Git and pull requests.

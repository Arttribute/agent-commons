# CommonLab identity reconciliation

Live-room Google signups previously created CommonLab profiles without a canonical Commons Identity account. The ops directory reads Commons Identity, and shared credits use its canonical user ID. When Commons Identity is configured, CommonLab now uses that sign-in flow for live rooms as well as courses.

The operator-only repair script reads projected CommonLab profile fields. It never reads passwords or copies credentials, changes balances, or reassigns existing identities. Only verified Google profiles can create a missing canonical account. Existing links must match their canonical email; conflicting aliases, duplicate canonical emails and unverified canonical matches stop the operation for review. Existing linked profiles retain their identities and verification state.

Supply `COURSES_MONGODB_URI` and the Identity `DATABASE_URL` privately, with `IDENTITY_DB_SSL=true` for the production connection. Dependencies come from `apps/commons-identity`. Run a dry run first:

```sh
node scripts/reconcile-commonlab-identities.mjs
```

After reviewing its counts, apply explicitly:

```sh
IDENTITY_MIGRATION_CONFIRM=APPLY_COMMONS_IDENTITY_MIGRATION \
  node scripts/reconcile-commonlab-identities.mjs --apply
```

The repair creates missing canonical identities, records the CommonLab app membership and source alias, and updates each CommonLab profile's canonical user/workspace link. Canonical writes commit together; source updates can safely be retried after interruption. Each source profile has an idempotent migration audit record. No email is sent. Dry runs and reports must stay outside Git; credentials belong in the secret store.

Existing CommonLab sessions can pick up the verified canonical link for their own local profile without changing their local ID or reassigning course records. No automatic credit gift is issued by reconciliation. Shared welcome credits are still created by the Commons API when its credit account is first used.

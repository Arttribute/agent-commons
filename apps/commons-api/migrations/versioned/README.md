# Versioned migrations

Ordered, tracked migrations applied by `scripts/migrate.mjs`. Each file is
`NNN_name.sql` and runs once, in numeric order, inside its own transaction. The
runner records applied files in the `schema_migrations` table.

This is the migration path for:

- the **fresh production database** (born from `000_baseline.sql` + everything
  after it), and
- keeping **staging** (the former production DB) in sync going forward.

The legacy ad-hoc scripts in `migrations/*.{sql,mjs}` predate this runner and
are **not** re-applied by it. `000_baseline.sql` captures the schema they
collectively produced.

## Generating the baseline (operator, one-time)

Dump the current (staging) database's public schema — structure only, no data
— and save it as `000_baseline.sql`:

```bash
pg_dump "$STAGING_DATABASE_URL" \
  --schema-only --no-owner --no-privileges --schema=public \
  > apps/commons-api/migrations/versioned/000_baseline.sql
```

Then, on a fresh database, `node scripts/migrate.mjs` applies the baseline
followed by 001_rls.sql, 002_billing.sql, etc.

> The baseline is environment-agnostic DDL. Do not hand-edit it; regenerate if
> the source schema changes before launch. It is intentionally not committed
> until generated during provisioning (it is large and derived).

## Adding a migration

Create the next-numbered file, e.g. `005_add_widget.sql`, with plain SQL.
Keep migrations idempotent where practical (`IF NOT EXISTS`) so a partial
failure can be re-run safely.

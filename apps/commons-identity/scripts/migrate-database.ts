import { readFile } from "fs/promises";
import { resolve } from "path";
import { Pool } from "pg";

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");
  const schema = process.env.IDENTITY_DB_SCHEMA ?? "commons_identity";
  if (!/^[a-z_][a-z0-9_]*$/i.test(schema)) {
    throw new Error("IDENTITY_DB_SCHEMA is invalid.");
  }
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl:
      process.env.IDENTITY_DB_SSL === "true"
        ? { rejectUnauthorized: false }
        : undefined,
  });
  const client = await pool.connect();
  try {
    await client.query(`create schema if not exists "${schema}"`);
    await client.query(`set search_path to "${schema}"`);
    for (const file of [
      "migrations/better-auth.sql",
      "migrations/001-commons-identity-domain.sql",
      "migrations/002-api-platform.sql",
    ]) {
      const sql = await readFile(resolve(file), "utf8");
      await client.query(sql);
      console.log(`Applied ${file}`);
    }
    await client.query(`
      insert into commons_project
        (id, workspace_id, created_by_user_id, name, slug, environment)
      select
        'prj_' || substr(md5(w.id), 1, 24),
        w.id,
        m.user_id,
        'Default project',
        'default-' || substr(md5(w.id), 1, 8),
        'production'
      from commons_workspace w
      join commons_workspace_membership m
        on m.workspace_id = w.id and m.role = 'owner' and m.status = 'active'
      where not exists (
        select 1 from commons_project p where p.workspace_id = w.id
      )
      on conflict do nothing
    `);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

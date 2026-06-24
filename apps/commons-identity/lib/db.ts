import { Pool } from "pg";

declare global {
  var commonsIdentityPool: Pool | undefined;
}

export const pool =
  global.commonsIdentityPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    options: `-c search_path=${process.env.IDENTITY_DB_SCHEMA ?? "commons_identity"}`,
    max: Number(process.env.IDENTITY_DB_POOL_SIZE ?? 10),
    ssl:
      process.env.IDENTITY_DB_SSL === "true"
        ? { rejectUnauthorized: false }
        : undefined,
  });

if (process.env.NODE_ENV !== "production") {
  global.commonsIdentityPool = pool;
}

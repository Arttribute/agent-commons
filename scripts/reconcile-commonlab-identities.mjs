#!/usr/bin/env node
// Operator-only repair. Credentials and account output must stay outside Git.
import { createRequire } from "node:module";
import { inspectCommonlabIdentity, reconcileCommonlabIdentity } from "./lib/commonlab-identity.mjs";
const requireIdentity = createRequire(new URL("../apps/commons-identity/package.json", import.meta.url));
const { MongoClient, ObjectId } = requireIdentity("mongodb");
const { Pool } = requireIdentity("pg");
const apply = process.argv.includes("--apply");
if (process.argv.slice(2).some((arg) => arg !== "--apply")) throw Error("Use --apply or no arguments for a dry run");
if (apply && process.env.IDENTITY_MIGRATION_CONFIRM !== "APPLY_COMMONS_IDENTITY_MIGRATION") throw Error("Explicit Identity migration confirmation is required");
if (!process.env.DATABASE_URL || !process.env.COURSES_MONGODB_URI) throw Error("Identity and CommonLab database settings are required");
const mongo = new MongoClient(process.env.COURSES_MONGODB_URI, { serverSelectionTimeoutMS: 15000 });
const pool = new Pool({ connectionString: process.env.DATABASE_URL, options: `-c search_path=${process.env.IDENTITY_DB_SCHEMA ?? 'commons_identity'}`, ssl: process.env.IDENTITY_DB_SSL === "true" ? { rejectUnauthorized: false } : undefined, connectionTimeoutMillis: 10000 });
let db;
try {
  await mongo.connect();
  const users = mongo.db().collection("users");
  const records = await users.find({}, { projection: { _id: 1, name: 1, email: 1, emailVerifiedAt: 1, authProvider: 1, identityUserId: 1, identityWorkspaceId: 1, createdAt: 1, updatedAt: 1 } }).toArray();
  db = await pool.connect();
  await db.query("BEGIN READ ONLY");
  const counts = { existing: 0, link: 0, create: 0, skip: 0 };
  for (const record of records) counts[(await inspectCommonlabIdentity(db, record)).action]++;
  await db.query("ROLLBACK");
  console.log({ mode: "dry-run", users: records.length, ...counts });
  if (apply) {
    const results = [];
    await db.query("BEGIN");
    try {
      for (const record of records) results.push(await reconcileCommonlabIdentity(db, record));
      await db.query("COMMIT");
    } catch (error) {
      await db.query("ROLLBACK");
      throw error;
    }
    for (let i = 0; i < records.length; i++) {
      const result = results[i], record = records[i];
      if (result.action === "skip" || (record.identityUserId === result.userId && record.identityWorkspaceId === result.workspaceId)) continue;
      const updated = await users.updateOne({ _id: new ObjectId(result.subject), email: record.email, $or: [{ identityUserId: { $exists: false } }, { identityUserId: null }, { identityUserId: "" }, { identityUserId: result.userId }] }, { $set: { identityUserId: result.userId, identityWorkspaceId: result.workspaceId } });
      if (updated.matchedCount !== 1) throw Error("A CommonLab profile changed concurrently. Re-run the dry run; existing canonical links remain intact.");
    }
    console.log({ mode: "applied", linked: results.filter((row) => row.action !== "skip").length, ...counts });
  }
} finally {
  db?.release();
  await pool.end();
  await mongo.close();
}

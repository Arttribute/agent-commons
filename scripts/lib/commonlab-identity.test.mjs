import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { createRequire } from "node:module";
import { commonlabProfile, inspectCommonlabIdentity, reconcileCommonlabIdentity } from "./commonlab-identity.mjs";
const profile = { _id: "a".repeat(24), name: "Workshop Learner", email: "LEARNER@example.com", authProvider: "google", emailVerifiedAt: new Date("2026-10-22"), createdAt: new Date("2026-10-22") };

test("CommonLab imports require a verified Google profile or an existing canonical link", async () => {
  assert.equal(commonlabProfile(profile).verifiedGoogle, true);
  assert.equal(commonlabProfile(profile).email, "learner@example.com");
  assert.throws(() => commonlabProfile({ ...profile, identityUserId: "untrusted" }));
  const neverRead = { query: () => { throw Error("Unverified profiles must not resolve canonical accounts by email"); } };
  for (const change of [{ emailVerifiedAt: null }, { authProvider: "credentials" }])
    assert.equal((await inspectCommonlabIdentity(neverRead, { ...profile, ...change })).action, "skip");
});

const url = process.env.COMMONLAB_RECONCILIATION_TEST_DB;
test("CommonLab identity reconciliation against PostgreSQL", { skip: !url }, async (t) => {
  const requireIdentity = createRequire(new URL("../../apps/commons-identity/package.json", import.meta.url));
  const { Pool } = requireIdentity("pg");
  const namespace = `commonlab_reconcile_${randomBytes(8).toString("hex")}`;
  const pool = new Pool({ connectionString: url });
  const db = await pool.connect();
  try {
    await db.query(`create schema ${namespace}; set search_path=${namespace}`);
    await db.query(`create table "user" (id text primary key,name text not null,email text unique not null,"emailVerified" boolean not null,"createdAt" timestamptz not null,"updatedAt" timestamptz not null,"defaultWorkspaceId" text);
      create table commons_workspace(id text primary key,name text,slug text unique,kind text);
      create table commons_workspace_membership(id text primary key,workspace_id text,user_id text,role text,status text,created_at timestamptz default now());
      create table commons_project(id text primary key,workspace_id text,created_by_user_id text,name text,slug text,environment text);
      create table commons_identity_alias(id text primary key,user_id text,source text,source_subject text,email text,email_verified boolean,metadata jsonb,unique(source,source_subject));
      create table commons_app_membership(id text primary key,user_id text,app_id text,first_seen_at timestamptz,last_seen_at timestamptz,unique(user_id,app_id));
      create table commons_migration_audit(migration_key text primary key,source text,source_subject text,target_user_id text,action text,details jsonb);`);

    await t.test("creates a canonical user once and repairs a retry after a source update interruption", async () => {
      const plan = await inspectCommonlabIdentity(db, profile);
      assert.equal(plan.action, "create");
      await db.query("BEGIN");
      const first = await reconcileCommonlabIdentity(db, profile);
      await db.query("COMMIT");
      await db.query("BEGIN");
      const replay = await reconcileCommonlabIdentity(db, profile);
      await db.query("COMMIT");
      assert.equal(first.userId, replay.userId);
      assert.equal(first.workspaceId, replay.workspaceId);
      const rows = (await db.query('select * from "user"')).rows;
      assert.equal(rows.length, 1);
      assert.equal(rows[0].emailVerified, true);
      assert.equal(rows[0].createdAt.toISOString(), profile.createdAt.toISOString());
      assert.equal((await db.query("select * from commons_identity_alias")).rowCount, 1);
      assert.equal((await db.query("select * from commons_workspace")).rowCount, 1);
      assert.equal((await db.query("select * from commons_app_membership")).rowCount, 1);
      assert.equal((await db.query("select * from commons_migration_audit")).rowCount, 1);
    });

    await t.test("preserves existing canonical identities and rejects conflicting aliases or emails", async () => {
      const user = (await db.query('select * from "user"')).rows[0];
      const alreadyLinked = { ...profile, identityUserId: user.id };
      assert.equal((await inspectCommonlabIdentity(db, alreadyLinked)).action, "existing");
      await assert.rejects(inspectCommonlabIdentity(db, { ...alreadyLinked, email: "other@example.com" }), /conflicts/);
      await db.query("insert into commons_identity_alias values ('conflict','usr_other','courses',$1,'other@example.com',true,'{}')", ["b".repeat(24)]);
      await assert.rejects(inspectCommonlabIdentity(db, { ...profile, _id: "b".repeat(24) }), /alias conflicts/);
      assert.equal((await db.query('select id from "user"')).rows[0].id, user.id);
    });

    await t.test("does not upgrade an existing unverified canonical account", async () => {
      await db.query('insert into "user" (id,name,email,"emailVerified","createdAt","updatedAt") values (\'usr_unverified\',\'Pending\',\'pending@example.com\',false,now(),now())');
      await assert.rejects(inspectCommonlabIdentity(db, { ...profile, _id: "c".repeat(24), email: "pending@example.com" }), /needs review/);
      assert.equal((await db.query('select "emailVerified" from "user" where id=\'usr_unverified\'')).rows[0].emailVerified, false);
    });
  } finally {
    await db.query(`drop schema ${namespace} cascade`);
    db.release();
    await pool.end();
  }
});

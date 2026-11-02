import { randomBytes } from "node:crypto";

const id = (prefix) => `${prefix}_${randomBytes(16).toString("base64url")}`;
const validDate = (value) => value && Number.isFinite(new Date(value).getTime()) ? new Date(value) : null;

export function commonlabProfile(record) {
  const subject = String(record._id ?? "");
  const email = typeof record.email === "string" ? record.email.trim().toLowerCase() : "";
  if (!/^[a-f\d]{24}$/i.test(subject) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw Error("Invalid CommonLab profile");
  const linkedId = typeof record.identityUserId === "string" ? record.identityUserId.trim() : "";
  if (linkedId && !/^usr_[a-zA-Z0-9_-]+$/.test(linkedId)) throw Error("Invalid existing canonical link");
  const createdAt = validDate(record.createdAt) ?? new Date();
  const lastSeenAt = validDate(record.updatedAt) ?? createdAt;
  return {
    subject, email, linkedId,
    name: typeof record.name === "string" && record.name.trim() ? record.name.trim().slice(0, 200) : email.split("@")[0],
    verifiedGoogle: record.authProvider === "google" && Boolean(validDate(record.emailVerifiedAt)),
    provider: record.authProvider ?? null,
    createdAt, lastSeenAt: lastSeenAt > createdAt ? lastSeenAt : createdAt,
  };
}

/** No unverified email matching, credential import, identity reassignment or balance writes. */
export async function inspectCommonlabIdentity(db, record) {
  const profile = commonlabProfile(record);
  if (!profile.linkedId && !profile.verifiedGoogle) return { action: "skip", profile };
  const users = await db.query('select id,email,"emailVerified","defaultWorkspaceId" from "user" where lower(email)=$1 or id=$2', [profile.email, profile.linkedId]);
  const matches = users.rows.filter((row) => row.email.toLowerCase() === profile.email);
  if (matches.length > 1) throw Error("Ambiguous canonical email");
  const canonical = profile.linkedId ? users.rows.find((row) => row.id === profile.linkedId) : matches[0];
  if (profile.linkedId && (!canonical || canonical.email.toLowerCase() !== profile.email)) throw Error("Existing canonical link conflicts with the CommonLab profile");
  if (!profile.linkedId && canonical && !canonical.emailVerified) throw Error("An unverified canonical account needs review before linking");
  const aliases = await db.query("select user_id from commons_identity_alias where source='courses' and source_subject=$1", [profile.subject]);
  if (aliases.rows[0] && aliases.rows[0].user_id !== canonical?.id) throw Error("Existing alias conflicts with the canonical account");
  return { action: profile.linkedId ? "existing" : canonical ? "link" : "create", profile, canonical };
}

/** Caller owns a transaction. Re-inspect after locking to make retries and concurrent signups safe. */
export async function reconcileCommonlabIdentity(db, record) {
  const profile = commonlabProfile(record);
  await db.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [`commonlab:${profile.email}`]);
  const plan = await inspectCommonlabIdentity(db, record);
  if (plan.action === "skip") return plan;
  let canonical = plan.canonical;
  if (!canonical) {
    const userId = id("usr");
    await db.query(`insert into "user" (id,name,email,"emailVerified","createdAt","updatedAt")
      values ($1,$2,$3,true,$4,now()) on conflict(email) do nothing`, [userId, profile.name, profile.email, profile.createdAt]);
    const matches = (await db.query('select id,email,"emailVerified","defaultWorkspaceId" from "user" where lower(email)=$1', [profile.email])).rows;
    if (matches.length !== 1) throw Error("Ambiguous concurrent canonical signup");
    canonical = matches[0];
    if (!canonical?.emailVerified) throw Error("A concurrent canonical signup needs verification before linking");
  }
  let workspaceId = canonical.defaultWorkspaceId;
  if (workspaceId && !(await db.query("select 1 from commons_workspace_membership where workspace_id=$1 and user_id=$2 and status='active'", [workspaceId, canonical.id])).rowCount)
    throw Error("Existing default workspace membership needs review");
  if (!workspaceId) workspaceId = (await db.query("select workspace_id from commons_workspace_membership where user_id=$1 and role='owner' and status='active' order by created_at limit 1", [canonical.id])).rows[0]?.workspace_id;
  if (!workspaceId) {
    workspaceId = id("wsp");
    await db.query("insert into commons_workspace (id,name,slug,kind) values ($1,$2,$3,'personal')", [workspaceId, `${profile.name}'s workspace`, `commonlab-${randomBytes(8).toString('hex')}`]);
    await db.query("insert into commons_workspace_membership (id,workspace_id,user_id,role,status) values ($1,$2,$3,'owner','active')", [id("mem"), workspaceId, canonical.id]);
    await db.query('update "user" set "defaultWorkspaceId"=$2 where id=$1 and "defaultWorkspaceId" is null', [canonical.id, workspaceId]);
  }
  await db.query(`insert into commons_project (id,workspace_id,created_by_user_id,name,slug,environment)
    select $1,$2,$3,'Default project',$4,'production' where not exists(select 1 from commons_project where workspace_id=$2)`, [id("prj"), workspaceId, canonical.id, `default-${randomBytes(8).toString('hex')}`]);
  await db.query(`insert into commons_identity_alias (id,user_id,source,source_subject,email,email_verified,metadata)
    values ($1,$2,'courses',$3,$4,$5,$6::jsonb) on conflict(source,source_subject) do nothing`, [id("idn"), canonical.id, profile.subject, profile.email, profile.verifiedGoogle || Boolean(record.emailVerifiedAt), JSON.stringify({ authProvider: profile.provider, reconciledBy: "commonlab-directory", sourceCreatedAt: profile.createdAt.toISOString() })]);
  const alias = (await db.query("select user_id from commons_identity_alias where source='courses' and source_subject=$1", [profile.subject])).rows[0];
  if (alias?.user_id !== canonical.id) throw Error("Concurrent alias conflict; no identities were reassigned");
  await db.query(`insert into commons_app_membership (id,user_id,app_id,first_seen_at,last_seen_at)
    values ($1,$2,'commonlabs',$3,$4) on conflict(user_id,app_id) do update
    set first_seen_at=least(commons_app_membership.first_seen_at,excluded.first_seen_at),last_seen_at=greatest(commons_app_membership.last_seen_at,excluded.last_seen_at)`, [id("app"), canonical.id, profile.createdAt, profile.lastSeenAt]);
  await db.query(`insert into commons_migration_audit (migration_key,source,source_subject,target_user_id,action,details)
    values ($1,'courses',$2,$3,$4,$5::jsonb) on conflict(migration_key) do nothing`, [`commonlab-directory:${profile.subject}`, profile.subject, canonical.id, plan.action, JSON.stringify({ verifiedGoogle: profile.verifiedGoogle })]);
  return { action: plan.action, subject: profile.subject, userId: canonical.id, workspaceId };
}

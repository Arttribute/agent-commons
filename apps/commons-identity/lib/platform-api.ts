import { createHash, randomBytes } from "node:crypto";
import { createCommonsId } from "./ids.js";

type Database = {
  query: (
    text: string,
    values?: unknown[],
  ) => Promise<{ rows: Array<Record<string, any>> }>;
};

export const PLATFORM_SCOPES = [
  "agents:read",
  "agents:write",
  "agents:run",
  "compute:read",
  "compute:write",
  "activity:read",
  "usage:read",
] as const;

const hashKey = (value: string) =>
  createHash("sha256").update(value).digest("hex");

function slugify(value: string) {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 48) || "project"
  );
}

export function listProjects(database: Database, userId: string) {
  return database.query(
    `select p.id, p.workspace_id as "workspaceId", p.name, p.slug,
            p.environment, p.status, p.created_at as "createdAt"
       from commons_project p
       join commons_workspace_membership m on m.workspace_id = p.workspace_id
      where m.user_id = $1 and m.status = 'active'
      order by p.created_at desc`,
    [userId],
  );
}

export async function createProject(
  database: Database,
  input: {
    userId: string;
    workspaceId: string;
    name: string;
    environment?: string;
  },
) {
  const membership = await database.query(
    `select role from commons_workspace_membership
      where workspace_id = $1 and user_id = $2 and status = 'active'`,
    [input.workspaceId, input.userId],
  );
  if (!membership.rows[0]) throw new Error("workspace_forbidden");

  const result = await database.query(
    `insert into commons_project
       (id, workspace_id, created_by_user_id, name, slug, environment)
     values ($1, $2, $3, $4, $5, $6)
     returning id, workspace_id as "workspaceId", name, slug, environment,
               status, created_at as "createdAt"`,
    [
      createCommonsId("project"),
      input.workspaceId,
      input.userId,
      input.name,
      `${slugify(input.name)}-${randomBytes(3).toString("hex")}`,
      input.environment ?? "production",
    ],
  );
  return result.rows[0]!;
}

async function assertProjectAccess(
  database: Database,
  projectId: string,
  userId: string,
) {
  const result = await database.query(
    `select p.id
       from commons_project p
       join commons_workspace_membership m on m.workspace_id = p.workspace_id
      where p.id = $1 and m.user_id = $2 and m.status = 'active'`,
    [projectId, userId],
  );
  if (!result.rows[0]) throw new Error("project_forbidden");
}

export async function createProjectApiKey(
  database: Database,
  input: {
    projectId: string;
    userId: string;
    name: string;
    scopes?: string[];
    expiresAt?: string | null;
  },
) {
  await assertProjectAccess(database, input.projectId, input.userId);
  const scopes = (input.scopes?.length
    ? input.scopes
    : [...PLATFORM_SCOPES]
  ).filter((scope) => PLATFORM_SCOPES.includes(scope as any));
  const project = await database.query(
    `select environment from commons_project where id = $1`,
    [input.projectId],
  );
  const mode =
    project.rows[0]?.environment === "production" ? "live" : "test";
  const raw = `csk_${mode}_${randomBytes(32).toString("base64url")}`;
  const result = await database.query(
    `insert into commons_project_api_key
       (id, project_id, key_prefix, key_hash, name, scopes, expires_at,
        created_by_user_id)
     values ($1, $2, $3, $4, $5, $6, $7, $8)
     returning id, project_id as "projectId", key_prefix as "keyPrefix", name,
               scopes, expires_at as "expiresAt", created_at as "createdAt"`,
    [
      createCommonsId("apiKey"),
      input.projectId,
      raw.slice(0, 16),
      hashKey(raw),
      input.name,
      scopes,
      input.expiresAt ?? null,
      input.userId,
    ],
  );
  return { ...result.rows[0]!, key: raw };
}

export async function listProjectApiKeys(
  database: Database,
  projectId: string,
  userId: string,
) {
  await assertProjectAccess(database, projectId, userId);
  return database.query(
    `select id, project_id as "projectId", key_prefix as "keyPrefix", name,
            scopes, status, expires_at as "expiresAt",
            last_used_at as "lastUsedAt", created_at as "createdAt"
       from commons_project_api_key
      where project_id = $1 order by created_at desc`,
    [projectId],
  );
}

export async function revokeProjectApiKey(
  database: Database,
  keyId: string,
  userId: string,
) {
  const access = await database.query(
    `select k.id
       from commons_project_api_key k
       join commons_project p on p.id = k.project_id
       join commons_workspace_membership m on m.workspace_id = p.workspace_id
      where k.id = $1 and m.user_id = $2 and m.status = 'active'`,
    [keyId, userId],
  );
  if (!access.rows[0]) throw new Error("key_forbidden");
  await database.query(
    `update commons_project_api_key
        set status = 'revoked', revoked_at = now()
      where id = $1`,
    [keyId],
  );
}

export async function introspectProjectApiKey(
  database: Database,
  rawKey: string,
) {
  const result = await database.query(
    `select k.id as "keyId", k.project_id as "projectId", k.scopes,
            p.workspace_id as "workspaceId",
            p.created_by_user_id as "userId", p.status as "projectStatus"
       from commons_project_api_key k
       join commons_project p on p.id = k.project_id
      where k.key_hash = $1 and k.status = 'active'
        and (k.expires_at is null or k.expires_at > now())`,
    [hashKey(rawKey)],
  );
  const record = result.rows[0];
  if (!record || record.projectStatus !== "active") return null;
  void database
    .query(
      `update commons_project_api_key set last_used_at = now() where id = $1`,
      [record.keyId],
    )
    .catch(() => {});
  return {
    active: true,
    actorId: record.userId,
    actorType: "user",
    workspaceId: record.workspaceId,
    projectId: record.projectId,
    scopes: record.scopes ?? [],
    credentialType: "project_api_key",
  };
}

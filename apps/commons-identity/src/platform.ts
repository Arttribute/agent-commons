import { timingSafeEqual } from "node:crypto";
import { Hono } from "hono";
import { createHash } from "node:crypto";
import type { auth } from "../lib/auth.js";
import type { pool } from "../lib/db.js";
import {
  createProject,
  createProjectApiKey,
  introspectProjectApiKey,
  listProjectApiKeys,
  listProjects,
  PLATFORM_SCOPES,
  revokeProjectApiKey,
} from "../lib/platform-api.js";

function secureEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function createPlatformRouter(
  authService: typeof auth,
  database: typeof pool,
) {
  const router = new Hono();

  async function sessionUser(request: Request) {
    const session = await authService.api.getSession({
      headers: request.headers,
    });
    if (session?.user) return session.user;

    // Product apps keep the Commons OAuth access token in their server-side
    // session. Accept that token here so they can proxy developer-project
    // management without forwarding cross-domain browser cookies.
    const bearer = (request.headers.get("authorization") ?? "").replace(
      /^Bearer\s+/i,
      "",
    );
    if (!bearer) return null;
    const result = await database.query(
      `select u.id, u.name, u.email, u."emailVerified",
              u.image, u."defaultWorkspaceId"
         from "oauthAccessToken" t
         join "user" u on u.id = t."userId"
        where t.token = $1 and t."expiresAt" > now()
        limit 1`,
      [createHash("sha256").update(bearer).digest("base64url")],
    );
    return result.rows[0] ?? null;
  }

  router.get("/scopes", (c) => c.json({ data: PLATFORM_SCOPES }));

  router.get("/projects", async (c) => {
    const user = await sessionUser(c.req.raw);
    if (!user) return c.json({ error: "unauthorized" }, 401);
    const result = await listProjects(database, user.id);
    return c.json({ data: result.rows });
  });

  router.post("/projects", async (c) => {
    const user = await sessionUser(c.req.raw);
    if (!user) return c.json({ error: "unauthorized" }, 401);
    const body = await c.req.json<{
      workspaceId?: string;
      name?: string;
      environment?: string;
    }>();
    if (!body.workspaceId || !body.name?.trim()) {
      return c.json({ error: "workspaceId and name are required" }, 400);
    }
    if (
      body.environment &&
      !["production", "development", "staging"].includes(body.environment)
    ) {
      return c.json(
        { error: "environment must be production, development, or staging" },
        400,
      );
    }
    try {
      const project = await createProject(database, {
        userId: user.id,
        workspaceId: body.workspaceId,
        name: body.name.trim(),
        environment: body.environment,
      });
      return c.json({ data: project }, 201);
    } catch (error) {
      if ((error as Error).message === "workspace_forbidden") {
        return c.json({ error: "forbidden" }, 403);
      }
      throw error;
    }
  });

  router.get("/projects/:projectId/api-keys", async (c) => {
    const user = await sessionUser(c.req.raw);
    if (!user) return c.json({ error: "unauthorized" }, 401);
    try {
      const result = await listProjectApiKeys(
        database,
        c.req.param("projectId"),
        user.id,
      );
      return c.json({ data: result.rows });
    } catch {
      return c.json({ error: "forbidden" }, 403);
    }
  });

  router.post("/projects/:projectId/api-keys", async (c) => {
    const user = await sessionUser(c.req.raw);
    if (!user) return c.json({ error: "unauthorized" }, 401);
    const body = await c.req.json<{
      name?: string;
      scopes?: string[];
      expiresAt?: string | null;
    }>();
    if (!body.name?.trim()) return c.json({ error: "name is required" }, 400);
    const invalidScope = body.scopes?.find(
      (scope) => !PLATFORM_SCOPES.includes(scope as any),
    );
    if (invalidScope) {
      return c.json({ error: `unsupported scope: ${invalidScope}` }, 400);
    }
    if (body.expiresAt) {
      const expiresAt = new Date(body.expiresAt);
      if (
        Number.isNaN(expiresAt.getTime()) ||
        expiresAt.getTime() <= Date.now()
      ) {
        return c.json(
          { error: "expiresAt must be a future ISO 8601 timestamp" },
          400,
        );
      }
    }
    try {
      const key = await createProjectApiKey(database, {
        projectId: c.req.param("projectId"),
        userId: user.id,
        name: body.name.trim(),
        scopes: body.scopes,
        expiresAt: body.expiresAt,
      });
      return c.json({ data: key }, 201);
    } catch {
      return c.json({ error: "forbidden" }, 403);
    }
  });

  router.delete("/api-keys/:keyId", async (c) => {
    const user = await sessionUser(c.req.raw);
    if (!user) return c.json({ error: "unauthorized" }, 401);
    try {
      await revokeProjectApiKey(database, c.req.param("keyId"), user.id);
      return c.body(null, 204);
    } catch {
      return c.json({ error: "forbidden" }, 403);
    }
  });

  router.post("/internal/api-keys/introspect", async (c) => {
    const expected = process.env.COMMONS_GATEWAY_INTERNAL_SECRET ?? "";
    const provided = c.req.header("x-commons-internal-secret") ?? "";
    if (!expected || !secureEqual(expected, provided)) {
      return c.json({ error: "unauthorized" }, 401);
    }
    const body = await c.req.json<{ key?: string }>();
    if (!body.key?.startsWith("csk_")) {
      return c.json({ active: false });
    }
    const principal = await introspectProjectApiKey(database, body.key);
    return c.json(principal ?? { active: false });
  });

  router.post("/internal/oauth-tokens/introspect", async (c) => {
    const expected = process.env.COMMONS_GATEWAY_INTERNAL_SECRET ?? "";
    const provided = c.req.header("x-commons-internal-secret") ?? "";
    if (!expected || !secureEqual(expected, provided)) {
      return c.json({ error: "unauthorized" }, 401);
    }
    const body = await c.req.json<{ token?: string }>();
    if (!body.token) return c.json({ active: false });
    const result = await database.query(
      `select
         t."userId" as "actorId",
         u."defaultWorkspaceId" as "workspaceId",
         t.scopes,
         t."clientId",
         t."expiresAt"
       from "oauthAccessToken" t
       join "user" u on u.id = t."userId"
       where t.token = $1
         and t."expiresAt" > now()
       limit 1`,
      [createHash("sha256").update(body.token).digest("base64url")],
    );
    const token = result.rows[0];
    if (!token) return c.json({ active: false });
    return c.json({
      active: true,
      actorId: token.actorId,
      actorType: "user",
      workspaceId: token.workspaceId,
      projectId: null,
      scopes: Array.isArray(token.scopes) ? token.scopes : [],
      credentialType: "oauth",
      clientId: token.clientId,
      expiresAt: token.expiresAt,
    });
  });

  router.post("/internal/usage", async (c) => {
    const expected = process.env.COMMONS_GATEWAY_INTERNAL_SECRET ?? "";
    const provided = c.req.header("x-commons-internal-secret") ?? "";
    if (!expected || !secureEqual(expected, provided)) {
      return c.json({ error: "unauthorized" }, 401);
    }
    const body = await c.req.json<Record<string, unknown>>();
    await database.query(
      `insert into commons_api_usage_event
        (request_id, project_id, workspace_id, actor_id, actor_type, service,
         method, path, status_code, duration_ms, response_bytes)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       on conflict (request_id) do nothing`,
      [
        body.requestId,
        body.projectId ?? null,
        body.workspaceId ?? null,
        body.actorId ?? null,
        body.actorType ?? null,
        body.service,
        body.method,
        body.path,
        body.statusCode,
        body.durationMs,
        body.responseBytes ?? null,
      ],
    );
    return c.body(null, 202);
  });

  return router;
}

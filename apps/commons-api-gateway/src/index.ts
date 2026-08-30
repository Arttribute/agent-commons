import { randomUUID } from "node:crypto";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import { authenticate, signedPrincipalHeaders } from "./auth.js";

type Variables = {
  principal: Awaited<ReturnType<typeof authenticate>>;
  requestId: string;
};

export function createGatewayApp() {
  const app = new Hono<{ Variables: Variables }>();
  const counters = new Map<string, { minute: number; count: number }>();

  const securityHeaders = secureHeaders();
  app.use("*", (c, next) => {
    // Published code-project previews provide their own deliberately strict
    // sandbox policy. The gateway default includes X-Frame-Options:
    // SAMEORIGIN, which prevents these cross-origin previews from loading in
    // the Commons plugin iframe.
    if (isPluginFramePath(c.req.path)) return next();
    return securityHeaders(c, next);
  });
  const crossOriginHeaders = cors({
    origin: (origin) => {
      const allowed = (process.env.CORS_ORIGINS ?? "")
        .split(",")
        .map((value) => value.trim());
      return allowed.includes(origin) ? origin : (allowed[0] ?? "");
    },
    allowHeaders: [
      "authorization",
      "content-type",
      "idempotency-key",
      "x-request-id",
    ],
    exposeHeaders: ["x-request-id", "x-commons-service"],
  });
  app.use("*", (c, next) => {
    // A sandboxed plugin frame intentionally has an opaque `null` origin.
    // Public preview modules therefore need wildcard CORS and no credentials;
    // the preview proxy below applies that narrower policy.
    if (isPluginFramePath(c.req.path)) return next();
    return crossOriginHeaders(c, next);
  });
  app.use("*", async (c, next) => {
    const requestId = c.req.header("x-request-id") ?? `req_${randomUUID()}`;
    c.set("requestId", requestId);
    c.header("x-request-id", requestId);
    await next();
  });

  app.get("/", (c) =>
    c.json({
      name: "Commons API",
      version: "v1",
      documentation: "https://docs.agentcommons.io/api",
    }),
  );
  app.get("/health", (c) =>
    c.json({ status: "ok", service: "commons-api-gateway" }),
  );

  async function publicProxy(
    c: any,
    service: "agent-commons",
    baseUrl: string | undefined,
    targetPath: string,
  ) {
    const isPluginFrame = isPluginFramePath(targetPath);
    if (isPluginFrame) {
      c.header("access-control-allow-origin", "*");
      c.header("cross-origin-resource-policy", "cross-origin");
    }
    if (!baseUrl) {
      return c.json(
        {
          error: {
            type: "service_unavailable",
            message: `${service} is not configured`,
            requestId: c.get("requestId"),
          },
        },
        503,
      );
    }
    const url = new URL(targetPath, `${baseUrl.replace(/\/$/, "")}/`);
    const incoming = new URL(c.req.url);
    url.search = incoming.search;
    const headers = isPluginFrame
      ? publicAssetRequestHeaders(c.req.raw.headers)
      : new Headers(c.req.raw.headers);
    headers.delete("host");
    headers.delete("content-length");
    headers.delete("authorization");

    const response = await fetch(url, {
      method: c.req.method,
      headers,
      body:
        c.req.method === "GET" || c.req.method === "HEAD"
          ? undefined
          : c.req.raw.body,
      redirect: "manual",
      duplex: "half",
    } as RequestInit);
    const outputHeaders = new Headers(response.headers);
    if (isPluginFrame) {
      outputHeaders.set("access-control-allow-origin", "*");
      outputHeaders.delete("access-control-allow-credentials");
      outputHeaders.set("cross-origin-resource-policy", "cross-origin");
    }
    outputHeaders.set("x-request-id", c.get("requestId"));
    outputHeaders.set("x-commons-service", service);
    return new Response(response.body, {
      status: response.status,
      headers: outputHeaders,
    });
  }

  app.get("/v1/oauth/providers", (c) =>
    publicProxy(
      c,
      "agent-commons",
      process.env.AGENT_COMMONS_INTERNAL_URL,
      c.req.path,
    ),
  );
  app.get("/v1/oauth/providers/:providerKey", (c) =>
    publicProxy(
      c,
      "agent-commons",
      process.env.AGENT_COMMONS_INTERNAL_URL,
      c.req.path,
    ),
  );
  app.get("/v1/oauth/callback/:providerKey", (c) =>
    publicProxy(
      c,
      "agent-commons",
      process.env.AGENT_COMMONS_INTERNAL_URL,
      c.req.path,
    ),
  );
  // Plan and top-up pricing is public marketing data with no user context. The
  // /plans page renders it for signed-out visitors, so it must not sit behind
  // the credential check below.
  app.get("/v1/billing/catalog", (c) =>
    publicProxy(
      c,
      "agent-commons",
      process.env.AGENT_COMMONS_INTERNAL_URL,
      c.req.path,
    ),
  );
  // Stripe posts webhooks with no Commons credential (it authenticates via the
  // stripe-signature header, verified downstream). Pass it through publicly,
  // preserving the raw body for signature verification.
  app.post("/v1/billing/webhook", (c) =>
    publicProxy(
      c,
      "agent-commons",
      process.env.AGENT_COMMONS_INTERNAL_URL,
      c.req.path,
    ),
  );
  // Published code projects are intentionally public, unguessable preview
  // assets. The upstream only serves projects whose visibility is public and
  // whose latest deployment is ready. They must bypass credential auth so an
  // isolated iframe can load HTML and relative assets without receiving a
  // Commons bearer token.
  app.get("/v1/previews/*", (c) =>
    publicProxy(
      c,
      "agent-commons",
      process.env.AGENT_COMMONS_INTERNAL_URL,
      c.req.path,
    ),
  );
  // A revocable, expiring artifact capability is authenticated by its opaque
  // token downstream. It must remain reachable to signed-out recipients; the
  // Nest service applies token hashing, expiry, revocation, and rate limits.
  app.get("/v1/shared/artifacts/:token", (c) =>
    publicProxy(
      c,
      "agent-commons",
      process.env.AGENT_COMMONS_INTERNAL_URL,
      c.req.path,
    ),
  );
  // Trusted relay around an opaque generated-app iframe. It carries no user
  // data or credential and must be frameable from the configured Commons app
  // origin, just like the immutable preview it contains.
  app.get("/v1/ui-plugin-host", (c) =>
    publicProxy(
      c,
      "agent-commons",
      process.env.AGENT_COMMONS_INTERNAL_URL,
      c.req.path,
    ),
  );

  app.use("/v1/*", async (c, next) => {
    const principal = await authenticate(c.req.header("authorization"));
    if (!principal) {
      return c.json(
        {
          error: {
            type: "authentication_error",
            message: "Missing or invalid Commons credential",
            requestId: c.get("requestId"),
          },
        },
        401,
      );
    }
    const minute = Math.floor(Date.now() / 60_000);
    const bucket = counters.get(principal.projectId ?? principal.actorId);
    const count = bucket?.minute === minute ? bucket.count + 1 : 1;
    counters.set(principal.projectId ?? principal.actorId, { minute, count });
    if (count > Number(process.env.RATE_LIMIT_PER_MINUTE ?? 600)) {
      return c.json(
        {
          error: {
            type: "rate_limit_error",
            message: "Rate limit exceeded",
            requestId: c.get("requestId"),
          },
        },
        429,
      );
    }
    c.set("principal", principal);
    const required = requiredScope(c.req.method, c.req.path);
    const granted = new Set(principal.scopes);
    if (required && !granted.has(required)) {
      return c.json(
        {
          error: {
            type: "permission_error",
            message: `Credential requires scope: ${required}`,
            requestId: c.get("requestId"),
          },
        },
        403,
      );
    }
    await next();
  });

  async function proxy(
    c: any,
    service: "agent-commons" | "common-os",
    baseUrl: string | undefined,
    targetPath: string,
  ) {
    if (!baseUrl) {
      return c.json(
        {
          error: {
            type: "service_unavailable",
            message: `${service} is not configured`,
            requestId: c.get("requestId"),
          },
        },
        503,
      );
    }
    const start = Date.now();
    const url = new URL(targetPath, `${baseUrl.replace(/\/$/, "")}/`);
    const incoming = new URL(c.req.url);
    url.search = incoming.search;
    const headers = new Headers(c.req.raw.headers);
    headers.delete("host");
    headers.delete("content-length");
    headers.delete("authorization");
    if (
      c.get("principal").credentialType === "legacy" ||
      (service === "common-os" && targetPath === "/auth/tenant")
    ) {
      headers.set(
        "authorization",
        c.get("principal").credentialType === "legacy"
          ? `Bearer ${c.get("principal").legacyToken}`
          : c.req.header("authorization")!,
      );
    }
    if (c.get("principal").credentialType !== "legacy") {
      const signed = signedPrincipalHeaders(
        c.get("principal"),
        c.req.method,
        targetPath,
        c.get("requestId"),
      );
      Object.entries(signed).forEach(([key, value]) => headers.set(key, value));
    }
    const response = await fetch(url, {
      method: c.req.method,
      headers,
      body:
        c.req.method === "GET" || c.req.method === "HEAD"
          ? undefined
          : c.req.raw.body,
      redirect: "manual",
      duplex: "half",
    } as RequestInit);
    const outputHeaders = new Headers(response.headers);
    outputHeaders.set("x-request-id", c.get("requestId"));
    outputHeaders.set("x-commons-service", service);
    void recordUsage({
      requestId: c.get("requestId"),
      principal: c.get("principal"),
      service,
      method: c.req.method,
      path: incoming.pathname,
      statusCode: response.status,
      durationMs: Date.now() - start,
      responseBytes: Number(response.headers.get("content-length")) || null,
    });
    return new Response(response.body, {
      status: response.status,
      headers: outputHeaders,
    });
  }

  app.all("/v1/compute/*", (c) => {
    const path = c.req.path.replace(/^\/v1\/compute/, "") || "/";
    return proxy(c, "common-os", process.env.COMMON_OS_INTERNAL_URL, path);
  });
  app.all("/v1/*", (c) =>
    proxy(
      c,
      "agent-commons",
      process.env.AGENT_COMMONS_INTERNAL_URL,
      c.req.path,
    ),
  );

  app.notFound((c) =>
    c.json(
      {
        error: {
          type: "not_found",
          message: "API route not found",
          requestId: c.get("requestId"),
        },
      },
      404,
    ),
  );
  app.onError((error, c) => {
    console.error(error);
    return c.json(
      {
        error: {
          type: "internal_error",
          message: "An internal error occurred",
          requestId: c.get("requestId"),
        },
      },
      500,
    );
  });
  return app;
}

async function recordUsage(event: {
  requestId: string;
  principal: NonNullable<Variables["principal"]>;
  service: string;
  method: string;
  path: string;
  statusCode: number;
  durationMs: number;
  responseBytes: number | null;
}) {
  const url = process.env.COMMONS_IDENTITY_PLATFORM_URL;
  const secret = process.env.COMMONS_GATEWAY_INTERNAL_SECRET;
  if (!url || !secret) return;
  try {
    await fetch(`${url.replace(/\/$/, "")}/internal/usage`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-commons-internal-secret": secret,
      },
      body: JSON.stringify({
        requestId: event.requestId,
        projectId: event.principal.projectId,
        workspaceId: event.principal.workspaceId,
        actorId: event.principal.actorId,
        actorType: event.principal.actorType,
        service: event.service,
        method: event.method,
        path: event.path,
        statusCode: event.statusCode,
        durationMs: event.durationMs,
        responseBytes: event.responseBytes,
      }),
    });
  } catch {
    // Usage telemetry must never break an API request.
  }
}

const app = createGatewayApp();
if (process.env.COMMONS_GATEWAY_NO_LISTEN !== "true") {
  serve(
    { fetch: app.fetch, port: Number(process.env.PORT ?? 8080) },
    ({ port }) => console.log(`Commons API gateway listening on ${port}`),
  );
}

export default app;

function isPluginFramePath(path: string) {
  return (
    path === "/v1/ui-plugin-host" ||
    path === "/v1/previews" ||
    path.startsWith("/v1/previews/")
  );
}

/**
 * Public preview and relay responses never need a Commons identity. Strip all
 * ambient browser credentials and gateway delegation headers before the
 * request reaches the API service. This keeps the public content origin
 * cookieless even when it currently shares the public API hostname.
 */
export function publicAssetRequestHeaders(input: HeadersInit) {
  const headers = new Headers(input);
  for (const name of [
    "host",
    "content-length",
    "authorization",
    "proxy-authorization",
    "cookie",
    "x-owner-id",
    "x-initiator",
    "x-user-id",
    "x-user-email",
    "x-commons-actor-id",
    "x-commons-actor-type",
    "x-commons-workspace-id",
    "x-commons-project-id",
    "x-commons-scopes",
    "x-commons-request-id",
    "x-commons-timestamp",
    "x-commons-signature",
    "x-commons-internal-secret",
  ]) {
    headers.delete(name);
  }
  return headers;
}

function requiredScope(method: string, path: string) {
  if (path.includes("/activity")) return "activity:read";
  if (path.startsWith("/v1/compute")) {
    return method === "GET" || method === "HEAD"
      ? "compute:read"
      : "compute:write";
  }
  if (/\/agents\/(?:run|[^/]+\/trigger)/.test(path)) return "agents:run";
  if (path.startsWith("/v1/agents")) {
    if (method === "POST" && /^\/v1\/agents\/?$/.test(path)) {
      return "agents:create";
    }
    return method === "GET" || method === "HEAD"
      ? "agents:read"
      : "agents:write";
  }
  if (path.startsWith("/v1/usage")) return "usage:read";
  return undefined;
}

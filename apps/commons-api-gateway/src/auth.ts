import { createHmac, timingSafeEqual } from "node:crypto";
import { createRemoteJWKSet, jwtVerify } from "jose";

export interface GatewayPrincipal {
  actorId: string;
  actorType: "user" | "agent" | "service";
  workspaceId?: string | null;
  projectId?: string | null;
  scopes: string[];
  credentialType: "oauth" | "project_api_key" | "legacy";
  legacyToken?: string;
}

let jwks: ReturnType<typeof createRemoteJWKSet> | undefined;

function identityJwks() {
  if (!jwks) {
    const url = process.env.COMMONS_IDENTITY_JWKS_URL;
    if (!url) throw new Error("COMMONS_IDENTITY_JWKS_URL is required");
    jwks = createRemoteJWKSet(new URL(url));
  }
  return jwks;
}

export async function authenticate(
  authorization: string | undefined,
): Promise<GatewayPrincipal | null> {
  const token = authorization?.replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;

  if (
    token.startsWith("sk-ac-") ||
    token.startsWith("cos_live_") ||
    token.startsWith("cos_agent_")
  ) {
    return {
      actorId: "legacy",
      actorType: token.startsWith("cos_agent_") ? "agent" : "user",
      scopes: [
        "agents:read",
        "agents:write",
        "agents:run",
        "compute:read",
        "compute:write",
        "activity:read",
      ],
      credentialType: "legacy",
      legacyToken: token,
    };
  }

  if (token.startsWith("csk_")) {
    const platformUrl = process.env.COMMONS_IDENTITY_PLATFORM_URL;
    const secret = process.env.COMMONS_GATEWAY_INTERNAL_SECRET;
    if (!platformUrl || !secret) throw new Error("Gateway identity configuration missing");
    const response = await fetch(
      `${platformUrl.replace(/\/$/, "")}/internal/api-keys/introspect`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-commons-internal-secret": secret,
        },
        body: JSON.stringify({ key: token }),
      },
    );
    if (!response.ok) return null;
    const result = (await response.json()) as GatewayPrincipal & {
      active?: boolean;
    };
    return result.active ? result : null;
  }

  try {
    const { payload } = await jwtVerify(token, identityJwks(), {
      issuer: process.env.COMMONS_IDENTITY_ISSUER,
      audience: process.env.COMMONS_IDENTITY_AUDIENCE ?? "commons-platform",
      algorithms: ["ES256"],
    });
    const actorId =
      typeof payload.sub === "string"
        ? payload.sub
        : typeof payload.azp === "string"
          ? payload.azp
          : null;
    if (!actorId) return null;
    const rawScope = payload.scope ?? payload.scopes;
    const scopes = Array.isArray(rawScope)
      ? rawScope.map(String)
      : typeof rawScope === "string"
        ? rawScope.split(" ").filter(Boolean)
        : [];
    return {
      actorId,
      actorType:
        payload.actor_type === "agent" || payload.actor_type === "service"
          ? payload.actor_type
          : "user",
      workspaceId:
        typeof payload.workspace_id === "string"
          ? payload.workspace_id
          : null,
      projectId:
        typeof payload.project_id === "string" ? payload.project_id : null,
      scopes,
      credentialType: "oauth",
    };
  } catch {
    return null;
  }
}

export function signedPrincipalHeaders(
  principal: GatewayPrincipal,
  method: string,
  path: string,
  requestId: string,
) {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const values = [
    timestamp,
    method.toUpperCase(),
    path,
    requestId,
    principal.actorId,
    principal.actorType,
    principal.workspaceId ?? "",
    principal.projectId ?? "",
    principal.scopes.join(" "),
  ];
  const secret = process.env.COMMONS_GATEWAY_INTERNAL_SECRET;
  if (!secret) throw new Error("COMMONS_GATEWAY_INTERNAL_SECRET is required");
  const signature = createHmac("sha256", secret)
    .update(values.join("\n"))
    .digest("base64url");
  return {
    "x-commons-actor-id": principal.actorId,
    "x-commons-actor-type": principal.actorType,
    "x-commons-workspace-id": principal.workspaceId ?? "",
    "x-commons-project-id": principal.projectId ?? "",
    "x-commons-scopes": principal.scopes.join(" "),
    "x-commons-request-id": requestId,
    "x-commons-timestamp": timestamp,
    "x-commons-signature": signature,
  };
}

export function verifyInternalSignature(
  headers: Headers,
  method: string,
  path: string,
) {
  const secret = process.env.COMMONS_GATEWAY_INTERNAL_SECRET;
  if (!secret) return false;
  const timestamp = headers.get("x-commons-timestamp") ?? "";
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 60) return false;
  const values = [
    timestamp,
    method.toUpperCase(),
    path,
    headers.get("x-commons-request-id") ?? "",
    headers.get("x-commons-actor-id") ?? "",
    headers.get("x-commons-actor-type") ?? "",
    headers.get("x-commons-workspace-id") ?? "",
    headers.get("x-commons-project-id") ?? "",
    headers.get("x-commons-scopes") ?? "",
  ];
  const expected = createHmac("sha256", secret)
    .update(values.join("\n"))
    .digest("base64url");
  const supplied = headers.get("x-commons-signature") ?? "";
  const a = Buffer.from(expected);
  const b = Buffer.from(supplied);
  return a.length === b.length && timingSafeEqual(a, b);
}

import { NextRequest, NextResponse } from "next/server";
import { backendAuthHeaders } from "@/lib/api-headers";
import { getAppBaseUrl } from "@/lib/app-url";
import { requireCurrentCommonsUser } from "@/lib/current-user";
import {
  configuredTrustedAppOrigins,
  normalizedHttpOrigin,
} from "@/lib/trusted-app-origins";
import {
  dispatchPluginRpc,
  isHostPluginRpcMethod,
  parsePluginRpcRequest,
  type PluginRpcResponse,
} from "@/components/plugins/plugin-rpc";
import { isUiPlugin } from "@/components/plugins/types";

const baseUrl = process.env.NEXT_PUBLIC_NEST_API_BASE_URL;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ pluginId: string }> },
) {
  const { user, response } = await requireCurrentCommonsUser();
  if (!user) return response;
  if (!baseUrl) {
    return NextResponse.json(
      rpcError(null, -32050, "Commons is temporarily unavailable."),
      { status: 503 },
    );
  }
  const trustedOrigin = trustedRequestOrigin(request);
  if (!trustedOrigin) {
    return NextResponse.json(
      rpcError(null, -32001, "Untrusted plugin requests are not allowed."),
      { status: 403 },
    );
  }

  const body = await request.json().catch(() => null);
  const candidate =
    body && typeof body === "object" && "request" in body
      ? (body as { request?: unknown }).request
      : undefined;
  const parsed = parsePluginRpcRequest(candidate);
  if (!parsed.ok) {
    return NextResponse.json(
      rpcError(parsed.id ?? null, parsed.code, parsed.message),
    );
  }
  if (isHostPluginRpcMethod(parsed.request.method)) {
    return NextResponse.json(
      rpcError(
        parsed.request.id,
        -32601,
        "This method must be handled by the Commons host.",
      ),
    );
  }

  const { pluginId } = await params;
  const pluginResponse = await fetch(
    `${baseUrl}/v1/ui-plugins/${encodeURIComponent(pluginId)}?active=true`,
    { cache: "no-store", headers: await backendAuthHeaders() },
  );
  const pluginPayload = await pluginResponse.json().catch(() => null);
  const plugin = pluginPayload?.data;
  if (!pluginResponse.ok || !isUiPlugin(plugin) || plugin.status !== "active") {
    return NextResponse.json(
      rpcError(
        parsed.request.id,
        -32001,
        "This custom app is no longer enabled.",
      ),
      { status: pluginResponse.status === 404 ? 404 : 403 },
    );
  }

  const confirmed =
    body !== null &&
    typeof body === "object" &&
    (body as { confirmed?: unknown }).confirmed === true;
  const cookie = request.headers.get("cookie");
  const fetcher: typeof fetch = async (input, init) => {
    if (typeof input !== "string" || !input.startsWith("/api/")) {
      throw new Error("Plugin RPC attempted an invalid internal route");
    }
    const target = new URL(input, trustedOrigin);
    if (
      target.origin !== trustedOrigin ||
      !target.pathname.startsWith("/api/")
    ) {
      throw new Error("Plugin RPC attempted a cross-origin route");
    }
    const headers = new Headers(init?.headers);
    if (cookie) headers.set("cookie", cookie);
    return fetch(target, {
      ...init,
      headers,
      cache: "no-store",
      redirect: "error",
    });
  };

  const result = await dispatchPluginRpc(parsed.request, {
    plugin,
    surface: "page",
    fetcher,
    confirmAction: () => confirmed,
    navigate: () => undefined,
    openCopilot: () => undefined,
  });
  return NextResponse.json(result);
}

function trustedRequestOrigin(request: NextRequest) {
  const requestOrigin = normalizedHttpOrigin(request.nextUrl.origin);
  const browserOrigin = normalizedHttpOrigin(request.headers.get("origin"));
  if (!requestOrigin || browserOrigin !== requestOrigin) return null;

  const trusted = configuredTrustedAppOrigins(
    {
      NEXT_PUBLIC_BASE_URL: process.env.NEXT_PUBLIC_BASE_URL,
      AUTH_URL: process.env.AUTH_URL,
      NEXTAUTH_URL: process.env.NEXTAUTH_URL,
      VERCEL_PROJECT_PRODUCTION_URL: process.env.VERCEL_PROJECT_PRODUCTION_URL,
      VERCEL_BRANCH_URL: process.env.VERCEL_BRANCH_URL,
      VERCEL_URL: process.env.VERCEL_URL,
      UI_PLUGIN_TRUSTED_APP_ORIGINS: process.env.UI_PLUGIN_TRUSTED_APP_ORIGINS,
    },
    getAppBaseUrl(),
  );

  if (
    process.env.NODE_ENV !== "production" &&
    ["localhost", "127.0.0.1", "[::1]"].includes(request.nextUrl.hostname)
  ) {
    trusted.add(requestOrigin);
  }
  return trusted.has(requestOrigin) ? requestOrigin : null;
}

function rpcError(
  id: string | number | null,
  code: number,
  message: string,
): PluginRpcResponse {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

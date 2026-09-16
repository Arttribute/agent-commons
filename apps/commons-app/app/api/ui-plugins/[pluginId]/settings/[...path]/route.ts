import { NextRequest, NextResponse } from "next/server";
import { backendAuthHeaders } from "@/lib/api-headers";

const baseUrl = process.env.NEXT_PUBLIC_NEST_API_BASE_URL;

type Params = { params: Promise<{ pluginId: string; path: string[] }> };

/**
 * Owner settings for one app: grants, appearance, connections and storage.
 * Only these paths are forwarded; everything else is rejected here.
 */
const ALLOWED = [
  { pattern: /^grants$/, methods: ["PUT"] },
  { pattern: /^appearance$/, methods: ["PUT"] },
  { pattern: /^connections$/, methods: ["GET"] },
  { pattern: /^connections\/[a-z][a-z0-9_-]{0,39}$/, methods: ["PUT"] },
  { pattern: /^storage$/, methods: ["GET", "PUT"] },
];

async function proxy(request: NextRequest, { params }: Params) {
  if (!baseUrl) {
    return NextResponse.json(
      { error: "Server base URL not configured" },
      { status: 500 },
    );
  }
  const { pluginId, path } = await params;
  const subpath = path.join("/");
  const allowed = ALLOWED.some(
    (entry) =>
      entry.pattern.test(subpath) && entry.methods.includes(request.method),
  );
  if (!allowed) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const body =
    request.method === "GET" ? undefined : JSON.stringify(await request.json());
  const response = await fetch(
    `${baseUrl}/v1/ui-plugins/${encodeURIComponent(pluginId)}/${subpath}`,
    {
      method: request.method,
      cache: "no-store",
      headers: {
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...(await backendAuthHeaders()),
      },
      body,
    },
  );
  const payload = await response.json().catch(() => ({}));
  return NextResponse.json(payload, { status: response.status });
}

export const GET = proxy;
export const PUT = proxy;

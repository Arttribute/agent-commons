import { NextResponse } from "next/server";
import { backendAuthHeaders } from "@/lib/api-headers";

const baseUrl = process.env.NEXT_PUBLIC_NEST_API_BASE_URL;

export async function proxyBackend(
  path: string,
  options: {
    method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
    body?: unknown;
    cache?: RequestCache;
  } = {},
) {
  if (!baseUrl) {
    return NextResponse.json(
      { error: "Server base URL not configured" },
      { status: 500 },
    );
  }

  try {
    const hasBody = options.body !== undefined;
    const res = await fetch(`${baseUrl}${path}`, {
      method: options.method ?? "GET",
      cache: options.cache ?? "no-store",
      headers: {
        ...(hasBody ? { "Content-Type": "application/json" } : {}),
        ...await backendAuthHeaders(),
      },
      body: hasBody ? JSON.stringify(options.body) : undefined,
    });
    const data = await res.json().catch(() => ({ error: "Bad JSON" }));
    return NextResponse.json(data, { status: res.status });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

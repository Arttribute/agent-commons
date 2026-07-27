import { NextRequest, NextResponse } from "next/server";
import { identityPlatformFetch } from "@/lib/identity-platform";

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as {
    workspaceId?: string;
    name?: string;
    environment?: "production" | "development" | "staging";
  };
  if (!body.workspaceId || !body.name?.trim()) {
    return NextResponse.json(
      { error: "workspaceId and name are required" },
      { status: 400 },
    );
  }
  const response = await identityPlatformFetch("/projects", {
    method: "POST",
    body: JSON.stringify(body),
  });
  const payload = await response
    .json()
    .catch(() => ({ error: "Invalid identity response" }));
  return NextResponse.json(payload, { status: response.status });
}

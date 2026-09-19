import { NextRequest, NextResponse } from "next/server";
import { identityPlatformFetch } from "@/lib/identity-platform";

export async function GET(request: NextRequest) {
  const projectId = new URL(request.url).searchParams.get("projectId");
  if (!projectId) {
    return NextResponse.json({ error: "projectId is required" }, { status: 400 });
  }
  const response = await identityPlatformFetch(
    `/projects/${encodeURIComponent(projectId)}/usage`,
  );
  const body = await response.json().catch(() => ({ error: "Invalid identity response" }));
  return NextResponse.json(body, { status: response.status });
}

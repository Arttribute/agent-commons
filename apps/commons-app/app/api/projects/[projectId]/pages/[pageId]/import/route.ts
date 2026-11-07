import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { backendAuthHeaders } from "@/lib/api-headers";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; pageId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin)
    return NextResponse.json(
      { error: "Invalid request origin" },
      { status: 403 },
    );
  const base = process.env.NEXT_PUBLIC_NEST_API_BASE_URL;
  if (!base)
    return NextResponse.json(
      { error: "Server base URL not configured" },
      { status: 503 },
    );
  const data = await request.formData();
  const file = data.get("file");
  if (!(file instanceof File) || file.size > 3_000_000)
    return NextResponse.json(
      { error: "Choose a ZIP of at most 3 MB for browser upload." },
      { status: 400 },
    );
  const { projectId, pageId } = await params;
  const headers = await backendAuthHeaders({ session });
  if (!headers.Authorization)
    return NextResponse.json(
      { error: "Could not authorise this request" },
      { status: 503 },
    );
  const body = new FormData();
  body.append("file", file);
  const response = await fetch(
    `${base}/v1/projects/${encodeURIComponent(projectId)}/pages/${encodeURIComponent(pageId)}/import`,
    { method: "POST", headers, body },
  );
  return NextResponse.json(
    await response.json().catch(() => ({ error: "The import failed" })),
    { status: response.status, headers: { "Cache-Control": "no-store" } },
  );
}

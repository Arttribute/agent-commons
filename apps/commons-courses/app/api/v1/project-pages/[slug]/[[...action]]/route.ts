import { NextRequest, NextResponse } from "next/server";
import { commonsApiUrl } from "@/lib/project-pages";
type Context = { params: Promise<{ slug: string; action?: string[] }> };
export const maxDuration = 40;
async function handle(req: NextRequest, { params }: Context) {
  const { slug, action = [] } = await params;
  if (
    !/^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/.test(slug) ||
    !(
      (req.method === "GET" && !action.length) ||
      (req.method === "POST" && action.join("/") === "chat")
    )
  )
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  const body = req.method === "POST" ? await req.text() : undefined;
  if (body && body.length > 16000)
    return NextResponse.json({ error: "Question too long" }, { status: 400 });
  const headers = new Headers({ "Content-Type": "application/json" });
  const ip = req.headers.get("x-forwarded-for");
  if (ip) headers.set("x-forwarded-for", ip);
  const response = await fetch(
    `${commonsApiUrl()}/v1/project-pages/${slug}${action.length ? "/chat" : ""}`,
    {
      method: req.method,
      headers,
      body,
      cache: "no-store",
      signal: AbortSignal.timeout(30000),
    },
  );
  return new Response(await response.text(), {
    status: response.status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}
export const GET = handle;
export const POST = handle;

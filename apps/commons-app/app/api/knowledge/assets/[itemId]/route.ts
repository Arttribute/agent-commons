import { NextRequest, NextResponse } from "next/server";
import { requireCurrentCommonsUser } from "@/lib/current-user";
import { proxyBackend } from "@/lib/backend-proxy";

type Context = { params: Promise<{ itemId: string }> };

/**
 * Stable, authenticated asset URL for Markdown notes. The Library owns the
 * bytes and permissions; this route resolves a fresh short-lived URL whenever
 * an editor, preview, or signed-in reader opens the note.
 */
export async function GET(_request: NextRequest, context: Context) {
  const { user, response } = await requireCurrentCommonsUser();
  if (!user) return response;
  const { itemId } = await context.params;
  const upstream = await proxyBackend(
    `/v1/library/${encodeURIComponent(itemId)}/download`,
  );
  if (!upstream.ok) return upstream;
  const payload = await upstream.json().catch(() => null);
  if (!payload?.url) {
    return NextResponse.json(
      { error: "Library asset is unavailable" },
      { status: 404 },
    );
  }
  return NextResponse.redirect(payload.url);
}

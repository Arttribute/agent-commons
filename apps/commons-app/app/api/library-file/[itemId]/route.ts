import { NextRequest } from "next/server";
import { proxyBackend } from "@/lib/backend-proxy";
import { requireCurrentCommonsUser } from "@/lib/current-user";

type Context = { params: Promise<{ itemId: string }> };

/**
 * Streams a Library file's bytes from the same origin. Viewers that read file
 * contents in the browser (the PDF text layer) need this because signed
 * storage URLs are cross-origin. Access is checked by the API's download
 * endpoint, which issues the signed URL.
 */
export async function GET(_request: NextRequest, context: Context) {
  const { user, response } = await requireCurrentCommonsUser();
  if (!user) return response;
  const { itemId } = await context.params;
  const signed = await proxyBackend(
    `/v1/library/${encodeURIComponent(itemId)}/download`,
  );
  const payload = await signed.json().catch(() => null);
  const url = typeof payload?.url === "string" ? payload.url : payload?.data?.url;
  if (!signed.ok || typeof url !== "string" || !/^https:\/\//i.test(url)) {
    return Response.json(
      { message: payload?.message ?? "This file is not available" },
      { status: signed.ok ? 404 : signed.status },
    );
  }
  const upstream = await fetch(url, { cache: "no-store" });
  if (!upstream.ok || !upstream.body) {
    return Response.json(
      { message: "The file could not be read from storage" },
      { status: 502 },
    );
  }
  const headers = new Headers({
    "Content-Type": upstream.headers.get("content-type") ?? "application/octet-stream",
    "Cache-Control": "private, max-age=300",
    "X-Content-Type-Options": "nosniff",
  });
  const length = upstream.headers.get("content-length");
  if (length) headers.set("Content-Length", length);
  return new Response(upstream.body, { status: 200, headers });
}

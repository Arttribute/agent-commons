/** Public, credential-free metadata needed by an arbitrary page frame. */
export type ProjectPageFrameData = {
  slug: string;
  title: string;
  entryUrl: string;
  chatEnabled: boolean;
};
/**
 * Per-request frame values a server host renders into the iframe address, so
 * the page starts loading with the host HTML instead of after hydration. The
 * nonce must be fresh for every response; never render it into a cached page.
 */
export type ProjectPageFrameSession = { nonce: string; hostOrigin: string };
/**
 * The visitor-facing origin of a server request, from the proxy headers.
 * A wrong value only stops this response's own chat bridge (the browser
 * enforces the postMessage target), and the frame corrects it after hydration.
 */
export function projectPageRequestOrigin(headers: {
  get(name: string): string | null;
}) {
  const first = (name: string) =>
    (headers.get(name) ?? "").split(",")[0]!.trim().toLowerCase();
  const host = first("x-forwarded-host") || first("host");
  const protocol = first("x-forwarded-proto") || "https";
  if (
    !/^[a-z0-9.-]+(?::\d{1,5})?$/.test(host) ||
    !["http", "https"].includes(protocol)
  )
    return "";
  try {
    return new URL(`${protocol}://${host}`).origin;
  } catch {
    return "";
  }
}
export function isProjectPageChatRequest(
  event: { source: unknown; origin: string; data: any },
  frame: unknown,
  nonce: string,
  assetOrigin: string,
) {
  return Boolean(
    frame &&
      event.source === frame &&
      (event.origin === "null" || event.origin === assetOrigin) &&
      event.data?.type === "commons-page:chat" &&
      event.data?.nonce === nonce &&
      typeof event.data?.id === "string" &&
      event.data.id.length <= 100,
  );
}
export function projectPageFrameUrl(
  entryUrl: string,
  slug: string,
  hostOrigin: string,
  nonce: string,
  chatEnabled: boolean,
) {
  const url = new URL(entryUrl);
  if (
    !["https:", "http:"].includes(url.protocol) ||
    url.username ||
    url.password
  )
    throw new Error("Invalid page address");
  if (
    url.protocol === "http:" &&
    !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
  )
    throw new Error("Page assets require HTTPS");
  url.hash = new URLSearchParams({
    commonsPage: slug,
    commonsHost: hostOrigin,
    commonsNonce: nonce,
    commonsChat: chatEnabled ? "1" : "0",
  }).toString();
  return url.toString();
}

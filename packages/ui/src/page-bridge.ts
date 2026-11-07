/** Public, credential-free metadata needed by an arbitrary page frame. */
export type ProjectPageFrameData = {
  slug: string;
  title: string;
  entryUrl: string;
  chatEnabled: boolean;
};
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

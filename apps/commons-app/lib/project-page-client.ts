/** The optional browser SDK: it can ask the host for a chat draft, never run an agent. */
export function pageContext() {
  if (typeof window === "undefined")
    return { slug: null, hostOrigin: null, nonce: null, chatEnabled: false };
  const hash = new URLSearchParams(window.location.hash.slice(1));
  return {
    slug: hash.get("commonsPage"),
    hostOrigin: hash.get("commonsHost"),
    nonce: hash.get("commonsNonce"),
    chatEnabled: hash.get("commonsChat") === "1",
  };
}
export function openChat(): Promise<{ opened: true }> {
  const context = pageContext();
  if (window.parent === window || !context.hostOrigin || !context.nonce)
    return Promise.reject(
      new Error("Open this page through its Commons project link to use chat."),
    );
  return new Promise((resolve, reject) => {
    const id = crypto.randomUUID();
    const cleanup = () => {
      clearTimeout(timer);
      window.removeEventListener("message", receive);
    };
    const receive = (event: MessageEvent) => {
      if (
        event.source !== window.parent ||
        event.origin !== context.hostOrigin ||
        event.data?.type !== "commons-page:reply" ||
        event.data?.id !== id ||
        event.data?.nonce !== context.nonce
      )
        return;
      cleanup();
      event.data.ok
        ? resolve({ opened: true })
        : reject(new Error(event.data.error || "Chat is unavailable."));
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("The Commons page host did not respond."));
    }, 8000);
    window.addEventListener("message", receive);
    window.parent.postMessage(
      { type: "commons-page:chat", id, nonce: context.nonce },
      context.hostOrigin!,
    );
  });
}

type RegistrationBootstrap = {
  nonce: string;
  assetOrigin: string;
  path: string;
};

// This function is also emitted as a small, dependency-free server script.
// It uses the same source/origin/nonce checks as the hydrated frame bridge.
function installRegistrationBootstrap(config: RegistrationBootstrap) {
  function receive(event: MessageEvent) {
    var frame = document.querySelector(
      "[data-commons-page-host] iframe",
    ) as HTMLIFrameElement | null;
    var data = event.data;
    if (
      !frame ||
      event.source !== frame.contentWindow ||
      (event.origin !== "null" && event.origin !== config.assetOrigin) ||
      !data ||
      data.type !== "commons-page:register" ||
      data.nonce !== config.nonce ||
      typeof data.id !== "string" ||
      data.id.length > 100
    )
      return;
    (event.source as Window).postMessage(
      {
        type: "commons-page:reply",
        nonce: config.nonce,
        id: data.id,
        ok: true,
      },
      "*",
    );
    window.location.assign(config.path);
  }
  function hydrated(event: Event) {
    var detail = (event as CustomEvent).detail;
    if (!detail || detail.nonce !== config.nonce) return;
    window.removeEventListener("message", receive);
    window.removeEventListener("commons-page:hydrated", hydrated);
  }
  window.addEventListener("message", receive);
  window.addEventListener("commons-page:hydrated", hydrated);
}

export function projectRegistrationBootstrap(
  page: { entryUrl: string; registrationUrl?: string },
  session: { nonce: string },
) {
  if (
    !/^\/register\/[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/.test(
      page.registrationUrl || "",
    )
  )
    return null;
  if (!/^[a-zA-Z0-9_-]{16,128}$/.test(session.nonce)) return null;
  let url: URL;
  try {
    url = new URL(page.entryUrl);
  } catch {
    return null;
  }
  if (
    url.protocol !== "https:" &&
    !(
      url.protocol === "http:" &&
      ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
    )
  )
    return null;
  const config: RegistrationBootstrap = {
    nonce: session.nonce,
    assetOrigin: url.origin,
    path: page.registrationUrl!,
  };
  return `(${installRegistrationBootstrap.toString()})(${JSON.stringify(config).replace(/</g, "\\u003c")});`;
}

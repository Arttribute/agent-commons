const styles = `
  :root { color-scheme: light; font-family: "Space Grotesk", ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    --page: #fcfcfb; --ink: #1c1917; --muted: #78716c; --line: #e7e5e4; --field: #d6d3d1; --mint: #bff3e2; }
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center;
    padding: 32px 16px; background: var(--page); color: var(--ink); -webkit-font-smoothing: antialiased; }
  .brand { display: flex; align-items: center; gap: 9px; margin: 0 0 22px; color: var(--ink); font-size: 14px; font-weight: 600;
    letter-spacing: -.01em; text-decoration: none; }
  .brand img { width: 26px; height: 26px; border-radius: 7px; }
  main { width: min(100%, 400px); padding: 28px; border: 1px solid var(--line); border-radius: 16px; background: #fff;
    box-shadow: 0 1px 2px rgba(28,25,23,.04), 0 8px 24px rgba(28,25,23,.05); }
  h1 { margin: 0 0 6px; font-size: 21px; font-weight: 600; line-height: 1.25; letter-spacing: -.025em; }
  h2 { margin: 24px 0 8px; font-size: 15px; font-weight: 600; }
  .hl { border-radius: .35em; padding: .04em .3em; background: var(--mint); }
  p { margin: 0 0 14px; color: var(--muted); font-size: 14px; line-height: 1.55; }
  a { color: var(--ink); text-underline-offset: 3px; }
  form { margin-top: 18px; }
  label { display: grid; gap: 6px; margin: 0 0 12px; font-size: 13px; font-weight: 500; color: #44403c; }
  input, select { width: 100%; padding: 10px 12px; border: 1px solid var(--field); border-radius: 10px;
    background: #fff; color: var(--ink); font: inherit; font-size: 14px; outline: none; transition: border-color .15s, box-shadow .15s; }
  input:focus, select:focus { border-color: #a8a29e; box-shadow: 0 0 0 3px rgba(168,162,158,.18); }
  button, .button { width: 100%; display: flex; align-items: center; justify-content: center; gap: 8px; margin-top: 8px;
    padding: 10px 14px; border: 1px solid var(--ink); border-radius: 10px; background: var(--ink); color: #fff;
    font: inherit; font-size: 14px; font-weight: 500; cursor: pointer; text-align: center; text-decoration: none;
    transition: background .15s, opacity .15s; }
  button:hover, .button:hover { background: #44403c; }
  button:disabled { opacity: .55; cursor: default; }
  button.secondary, .button.secondary { border-color: var(--field); background: #fff; color: var(--ink); }
  button.secondary:hover, .button.secondary:hover { background: #f5f5f4; }
  button.danger { border-color: var(--field); background: #fff; color: #b91c1c; }
  button.danger:hover { background: #fef2f2; }
  .google-logo { width: 17px; height: 17px; flex: none; }
  .row { display: flex; gap: 8px; margin-top: 18px; }
  .row > * { flex: 1; margin-top: 0; }
  .muted { font-size: 13px; color: var(--muted); }
  .footnote { margin: 16px 0 0; font-size: 13px; color: var(--muted); text-align: center; }
  .error { color: #b91c1c; font-size: 13px; }
  .success { color: #15803d; font-size: 13px; }
  .divider { display: flex; align-items: center; gap: 12px; color: #a8a29e; margin: 18px 0 10px; font-size: 12px; }
  .divider::before, .divider::after { content: ""; height: 1px; background: var(--line); flex: 1; }
  .code { display: inline-block; margin: 2px 0 6px; padding: 8px 14px; border-radius: 10px; background: #f5f5f4;
    font-family: ui-monospace, "SF Mono", Menlo, monospace; font-size: 22px; letter-spacing: .18em; color: var(--ink); }
  input.code-input { font-family: ui-monospace, "SF Mono", Menlo, monospace; font-size: 20px; letter-spacing: .2em; text-align: center; text-transform: uppercase; }
  .account { display: flex; align-items: center; gap: 10px; margin: 16px 0 4px; padding: 10px 12px; border: 1px solid var(--line);
    border-radius: 12px; font-size: 13px; color: #44403c; }
  .avatar { width: 26px; height: 26px; border-radius: 999px; background: #f5f5f4; display: grid; place-items: center; font-size: 12px; font-weight: 600; color: var(--muted); }
  ul.scopes { list-style: none; margin: 14px 0 0; padding: 0; border: 1px solid var(--line); border-radius: 12px; }
  ul.scopes li { display: flex; gap: 10px; align-items: flex-start; padding: 10px 12px; font-size: 13px; color: #44403c; }
  ul.scopes li + li { border-top: 1px solid var(--line); }
  ul.scopes li::before { content: ""; width: 6px; height: 6px; margin-top: 7px; border-radius: 999px; background: #a8a29e; flex: none; }
  .done { display: grid; place-items: center; width: 40px; height: 40px; margin: 0 0 14px; border-radius: 999px; background: #dcfce7; color: #15803d; font-size: 20px; }
  .card { margin-top: 12px; padding: 14px; border: 1px solid var(--line); border-radius: 12px; }
  .card h3 { margin: 0 0 4px; font-size: 14px; }
  #message:empty { display: none; }
  footer { margin-top: 18px; font-size: 12px; color: #a8a29e; text-align: center; }
  footer a { color: inherit; }
  @media (max-width: 520px) { body { justify-content: flex-start; padding: 28px 16px; } main { padding: 22px; } }
`;

const LOGO_URL = process.env.COMMONS_IDENTITY_LOGO_URL ?? "https://www.agentcommons.io/ac-icon.svg";

export function page(title: string, body: string, script = "") {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="light"><meta name="theme-color" content="#fcfcfb">
  <link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600&display=swap" rel="stylesheet">
  <link rel="icon" href="${escapeHtml(LOGO_URL)}">
  <title>${escapeHtml(title)} · Agent Commons</title><style>${styles}</style></head>
  <body><a class="brand" href="/"><img src="${escapeHtml(LOGO_URL)}" alt=""><span>Agent Commons</span></a>
  <main>${body}</main>
  <footer><a href="https://www.agentcommons.io/privacy">Privacy</a> · <a href="https://www.agentcommons.io/terms">Terms</a></footer>
  ${script ? `<script>${script}</script>` : ""}</body></html>`;
}

export function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function safeReturnPath(value: string | null, fallback = "/") {
  if (!value?.startsWith("/") || value.startsWith("//")) return fallback;
  return value;
}

const CLIENT_NAMES: Record<string, string> = {
  "commons-desktop": "Agent Commons for desktop",
  "commons-app": "Agent Commons",
  "agent-commons": "Agent Commons",
  "agc-cli": "Commons CLI",
  "commons-cli": "Commons CLI",
  "commons-vscode": "Agent Commons for VS Code",
  "commons-courses": "CommonLab",
  commonlabs: "CommonLab",
  "common-os": "Common OS",
  "commons-arcade": "Common Arcade",
};

/** A readable name for an OAuth client, falling back to its id. */
export function clientName(clientId: string | null | undefined) {
  if (!clientId) return "This application";
  return CLIENT_NAMES[clientId] ?? clientId.replace(/[-_]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

const SCOPE_TEXT: Record<string, string> = {
  openid: "Confirm who you are",
  profile: "See your name and profile picture",
  email: "See your email address",
  offline_access: "Stay signed in until you sign out",
  "activity:read": "See your agent activity",
  "agents:create": "Create agents",
  "agents:read": "See your agents",
  "agents:write": "Change your agents",
  "agents:run": "Run your agents",
  "compute:read": "See your agent computers",
  "compute:write": "Start and manage agent computers",
  "usage:read": "See your usage and credits",
};

/** Plain-language permissions for the scopes an application requests. */
export function scopeList(scope: string | null | undefined) {
  const scopes = [...new Set((scope ?? "").split(/\s+/).filter(Boolean))];
  const items = scopes
    .filter((entry) => entry !== "openid")
    .map((entry) => SCOPE_TEXT[entry] ?? entry.replace(/[:_]/g, " "));
  return items.length
    ? `<ul class="scopes">${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`
    : "";
}

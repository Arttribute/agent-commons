const styles = `
  :root { color-scheme: light; font-family: "Space Grotesk", ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 32px 16px;
    background: #fff; color: #1c1917; }
  main { width: min(100%, 440px); padding: 36px; border: 1px solid #e7e5e4;
    border-radius: 16px; background: rgba(255,255,255,.96); box-shadow: 0 20px 55px rgba(28,25,23,.08); }
  .brand { display: flex; align-items: center; gap: 10px; margin-bottom: 34px; color: #1c1917; font-size: 15px; font-weight: 700; letter-spacing: -.01em; }
  h1 { margin: 0 0 8px; font-size: 28px; line-height: 1.18; letter-spacing: -.035em; }
  p { color: #78716c; line-height: 1.55; }
  a { color: #292524; text-underline-offset: 3px; }
  label { display: grid; gap: 7px; margin: 16px 0; font-size: 13px; font-weight: 700; }
  input { width: 100%; padding: 12px 13px; border: 1px solid #d6d3d1; border-radius: 9px;
    background: #fff; color: #1c1917; font: inherit; outline: none; transition: border-color .15s, box-shadow .15s; }
  input:focus { border-color: #78716c; box-shadow: 0 0 0 3px rgba(120,113,108,.12); }
  button, .button { width: 100%; display: block; margin-top: 12px; padding: 12px 15px;
    border: 1px solid #1c1917; border-radius: 9px; background: #1c1917; color: #fff;
    font: inherit; font-weight: 700; cursor: pointer; text-align: center; text-decoration: none; transition: background .15s, transform .15s; }
  button:hover, .button:hover { background: #44403c; }
  button:active, .button:active { transform: translateY(1px); }
  button.secondary { border-color: #d6d3d1; background: #fff; color: #1c1917; }
  button.secondary:hover { background: #f5f5f4; }
  .google-button { display: flex; align-items: center; justify-content: center; gap: 10px; }
  .google-logo { width: 18px; height: 18px; flex: none; }
  button.danger { border-color: #dc2626; background: #fff; color: #b91c1c; }
  button.danger:hover { background: #fef2f2; }
  .row { display: flex; gap: 10px; }
  .row > * { flex: 1; }
  .muted { font-size: 13px; color: #78716c; }
  .error { color: #b91c1c; }
  .success { color: #15803d; }
  .divider { display: flex; align-items: center; gap: 12px; color: #a8a29e; margin: 20px 0; font-size: 12px; }
  .divider::before, .divider::after { content: ""; height: 1px; background: #e7e5e4; flex: 1; }
  code { font-size: 24px; letter-spacing: .12em; color: #a16207; }
  #message:empty { display: none; }
  @media (max-width: 520px) { body { padding: 0; background: #fff; } main { min-height: 100vh; border: 0; border-radius: 0; padding: 28px 24px; box-shadow: none; } }
`;

export function page(title: string, body: string, script = "") {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="light"><meta name="theme-color" content="#ffffff">
  <title>${escapeHtml(title)} · Commons</title><style>${styles}</style></head>
  <body><main><div class="brand"><span>Agent Commons</span></div>${body}</main>${script ? `<script>${script}</script>` : ""}</body></html>`;
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

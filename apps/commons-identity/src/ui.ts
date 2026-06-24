const styles = `
  :root { color-scheme: dark; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100vh; display: grid; place-items: center;
    background: radial-gradient(circle at top, #182238, #090d15 55%); color: #f8fafc; }
  main { width: min(92vw, 430px); padding: 34px; border: 1px solid #263247;
    border-radius: 18px; background: rgba(11,16,27,.92); box-shadow: 0 30px 80px #0008; }
  h1 { margin: 0 0 8px; font-size: 28px; }
  p { color: #aab6ca; line-height: 1.55; }
  label { display: grid; gap: 7px; margin: 16px 0; font-size: 13px; font-weight: 700; }
  input { width: 100%; padding: 12px 13px; border: 1px solid #33425d; border-radius: 9px;
    background: #0a101c; color: white; font: inherit; }
  button, .button { width: 100%; display: block; margin-top: 12px; padding: 12px 15px;
    border: 0; border-radius: 9px; background: #f8fafc; color: #09101c;
    font-weight: 800; cursor: pointer; text-align: center; text-decoration: none; }
  button.secondary { background: #202b3f; color: #f8fafc; }
  button.danger { background: #7f1d1d; color: white; }
  .row { display: flex; gap: 10px; }
  .row > * { flex: 1; }
  .muted { font-size: 13px; color: #8290a8; }
  .error { color: #fca5a5; }
  .success { color: #86efac; }
  .divider { display: flex; align-items: center; gap: 12px; color: #64748b; margin: 20px 0; font-size: 12px; }
  .divider::before, .divider::after { content: ""; height: 1px; background: #29354a; flex: 1; }
  code { font-size: 24px; letter-spacing: .12em; color: #fbbf24; }
`;

export function page(title: string, body: string, script = "") {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escapeHtml(title)} · Commons</title><style>${styles}</style></head>
  <body><main>${body}</main>${script ? `<script>${script}</script>` : ""}</body></html>`;
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

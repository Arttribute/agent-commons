export const COMMONS_UI_MODULE = '@agent-commons/ui';

/**
 * Bundled into lightweight projects when they import `@agent-commons/ui`.
 * The host remains the security boundary: this client only speaks correlated
 * JSON-RPC to the parent frame and never receives Commons credentials.
 */
export const COMMONS_UI_RUNTIME_SOURCE = String.raw`
import React, { useEffect, useState } from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import '@fontsource-variable/space-grotesk/wght.css';

const listeners = new Set();
const pending = new Map();
let sequence = 0;
const hostOrigin = (() => {
  const configured = new URLSearchParams(window.location.search).get('commonsHostOrigin');
  if (configured) {
    try { return new URL(configured).origin; } catch {}
  }
  if (document.referrer) {
    try { return new URL(document.referrer).origin; } catch {}
  }
  return null;
})();
let context = {
  theme: new URLSearchParams(window.location.search).get('commonsTheme') === 'dark' ? 'dark' : 'light',
  surface: new URLSearchParams(window.location.search).get('commonsSurface') === 'widget' ? 'widget' : 'page',
  viewport: { width: window.innerWidth, height: window.innerHeight },
  capabilities: [],
};

function applyContext(next) {
  context = { ...context, ...next };
  document.documentElement.dataset.theme = context.theme;
  document.documentElement.dataset.commonsSurface = context.surface;
  document.documentElement.style.colorScheme = context.theme;
  listeners.forEach((listener) => listener(context));
}

function ready() {
  if (!hostOrigin || window.parent === window) return;
  window.parent.postMessage({ type: 'commons:ready' }, hostOrigin);
}

window.addEventListener('message', (event) => {
  if (
    !hostOrigin ||
    event.source !== window.parent ||
    event.origin !== hostOrigin ||
    !event.data ||
    typeof event.data !== 'object'
  ) return;
  const message = event.data;
  if (message.type === 'commons:context') {
    applyContext(message);
    return;
  }
  if (message.jsonrpc === '2.0' && (typeof message.id === 'string' || typeof message.id === 'number')) {
    const request = pending.get(String(message.id));
    if (!request) return;
    pending.delete(String(message.id));
    window.clearTimeout(request.timeout);
    if (message.error) request.reject(new Error(message.error.message || 'Commons request failed'));
    else request.resolve(message.result);
  }
});

window.addEventListener('resize', () => {
  applyContext({ viewport: { width: window.innerWidth, height: window.innerHeight } });
});

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready, { once: true });
else queueMicrotask(ready);
applyContext(context);

function request(method, params = {}) {
  if (!hostOrigin || window.parent === window) {
    return Promise.reject(new Error('Open this app inside Agent Commons to use live data and actions'));
  }
  const id = 'commons-' + Date.now().toString(36) + '-' + (++sequence).toString(36);
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      pending.delete(id);
      reject(new Error('Commons request timed out'));
    }, 300000);
    pending.set(id, { resolve, reject, timeout });
    window.parent.postMessage({ jsonrpc: '2.0', id, method, params }, hostOrigin);
  });
}

export const commons = {
  ready,
  request,
  getContext: () => context,
  onContext(listener) {
    listeners.add(listener);
    listener(context);
    return () => listeners.delete(listener);
  },
  agents: { list: (params) => request('agents.list', params) },
  tasks: {
    list: (params) => request('tasks.list', params),
    create: (params) => request('tasks.create', params),
    update: (params) => request('tasks.update', params),
  },
  workflows: {
    list: (params) => request('workflows.list', params),
    execute: (params) => request('workflows.execute', params),
  },
  library: { list: (params) => request('library.list', params) },
  tools: { list: (params) => request('tools.list', params) },
  copilot: { open: (params) => request('copilot.open', params) },
  navigation: { open: (params) => request('navigation.open', params) },
  storage: {
    get: (params) => request('storage.get', params),
    set: (params) => request('storage.set', params),
    remove: (params) => request('storage.remove', params),
  },
  ui: { resize: (params) => request('ui.resize', params) },
};

export function useCommonsContext() {
  const [value, setValue] = useState(context);
  useEffect(() => commons.onContext(setValue), []);
  return value;
}

export function CommonsProvider({ children }) {
  useCommonsContext();
  return <>{children}</>;
}

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

export function AppShell({ className, children, ...props }) {
  return <main className={cn('ac-app-shell', className)} {...props}>{children}</main>;
}

export function PageHeader({ eyebrow, title, description, actions, className }) {
  return (
    <header className={cn('ac-page-header', className)}>
      <div className="min-w-0">
        {eyebrow ? <p className="ac-eyebrow">{eyebrow}</p> : null}
        <h1 className="ac-page-title">{title}</h1>
        {description ? <p className="ac-page-description">{description}</p> : null}
      </div>
      {actions ? <div className="ac-page-actions">{actions}</div> : null}
    </header>
  );
}

export function Card({ className, children, ...props }) {
  return <section className={cn('ac-card', className)} {...props}>{children}</section>;
}

export function Button({ className, variant = 'primary', size = 'default', type = 'button', ...props }) {
  return <button type={type} className={cn('ac-button', 'ac-button-' + variant, 'ac-button-' + size, className)} {...props} />;
}

export function Badge({ className, tone = 'neutral', ...props }) {
  return <span className={cn('ac-badge', 'ac-badge-' + tone, className)} {...props} />;
}

export function MetricCard({ label, value, detail, icon, className }) {
  return (
    <Card className={cn('ac-metric-card', className)}>
      <div className="ac-metric-heading"><span>{label}</span>{icon}</div>
      <strong className="ac-metric-value">{value}</strong>
      {detail ? <p className="ac-metric-detail">{detail}</p> : null}
    </Card>
  );
}

export function EmptyState({ icon, title, description, action, className }) {
  return (
    <div className={cn('ac-empty-state', className)}>
      {icon ? <div className="ac-empty-icon">{icon}</div> : null}
      <h2>{title}</h2>
      {description ? <p>{description}</p> : null}
      {action}
    </div>
  );
}

export function Skeleton({ className, ...props }) {
  return <div aria-hidden="true" className={cn('ac-skeleton', className)} {...props} />;
}

export function ScrollArea({ className, children, ...props }) {
  return <div className={cn('ac-scroll-area', className)} {...props}>{children}</div>;
}
`;

/** Tailwind layers plus Commons tokens and source-registry primitives. */
export const COMMONS_UI_STYLES = String.raw`
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    color-scheme: light;
    --brand-yellow: #fde68a;
    --brand-pink: #f9a8d4;
    --brand-mint: #86efac;
    --brand-cyan: #67e8f9;
    --brand-blue: #93c5fd;
    --brand-lilac: #c4b5fd;
    --background: 0 0% 100%;
    --foreground: 20 14.3% 4.1%;
    --card: 0 0% 100%;
    --card-foreground: 20 14.3% 4.1%;
    --popover: 0 0% 100%;
    --popover-foreground: 20 14.3% 4.1%;
    --secondary: 60 4.8% 95.9%;
    --secondary-foreground: 24 9.8% 10%;
    --muted: 60 4.8% 95.9%;
    --muted-foreground: 25 5.3% 39.5%;
    --border: 20 5.9% 90%;
    --input: 20 5.9% 90%;
    --primary: 24 9.8% 10%;
    --primary-foreground: 60 9.1% 97.8%;
    --accent: 60 4.8% 95.9%;
    --accent-foreground: 24 9.8% 10%;
    --destructive: 0 84.2% 60.2%;
    --destructive-foreground: 60 9.1% 97.8%;
    --ring: 20 14.3% 4.1%;
    --chart-1: 12 76% 61%;
    --chart-2: 173 58% 39%;
    --chart-3: 197 37% 24%;
    --chart-4: 43 74% 66%;
    --chart-5: 27 87% 67%;
    --radius: 0.625rem;
  }

  :root[data-theme='dark'], .dark {
    color-scheme: dark;
    --background: 20 14.3% 4.1%;
    --foreground: 60 9.1% 97.8%;
    --card: 20 14.3% 4.1%;
    --card-foreground: 60 9.1% 97.8%;
    --popover: 20 14.3% 4.1%;
    --popover-foreground: 60 9.1% 97.8%;
    --secondary: 12 6.5% 15.1%;
    --secondary-foreground: 60 9.1% 97.8%;
    --muted: 12 6.5% 15.1%;
    --muted-foreground: 24 5.4% 63.9%;
    --border: 12 6.5% 15.1%;
    --input: 12 6.5% 15.1%;
    --primary: 60 9.1% 97.8%;
    --primary-foreground: 24 9.8% 10%;
    --accent: 12 6.5% 15.1%;
    --accent-foreground: 60 9.1% 97.8%;
    --destructive: 0 62.8% 30.6%;
    --destructive-foreground: 60 9.1% 97.8%;
    --ring: 24 5.7% 82.9%;
    --chart-1: 220 70% 50%;
    --chart-2: 160 60% 45%;
    --chart-3: 30 80% 55%;
    --chart-4: 280 65% 60%;
    --chart-5: 340 75% 55%;
  }

  *, *::before, *::after { box-sizing: border-box; border-color: hsl(var(--border)); }
  html, body, #root { width: 100%; min-width: 0; min-height: 100%; margin: 0; }
  html { background: hsl(var(--background)); }
  body {
    background: hsl(var(--background));
    color: hsl(var(--foreground));
    font-family: "Space Grotesk Variable", "Space Grotesk", Helvetica, Arial, sans-serif;
    font-synthesis: none;
    text-rendering: optimizeLegibility;
    -webkit-font-smoothing: antialiased;
  }
  button, input, textarea, select { font: inherit; }
  button, [role='button'], a { -webkit-tap-highlight-color: transparent; }
  :focus-visible { outline: 2px solid hsl(var(--ring)); outline-offset: 2px; }
  ::selection { background: hsl(var(--accent) / .22); }
  html[data-commons-surface='widget'],
  html[data-commons-surface='widget'] body,
  html[data-commons-surface='widget'] #root { height: 100%; overflow: hidden; }
}

@layer components {
  .ac-app-shell { container-type: inline-size; min-height: 100%; padding: clamp(1rem, 2.4vw, 2rem); background: #fcfcfb; color: hsl(var(--foreground)); }
  [data-theme='dark'] .ac-app-shell { background: hsl(var(--background)); }
  [data-commons-surface='widget'] .ac-app-shell { height: 100%; min-height: 0; overflow: hidden; padding: .875rem; }
  .ac-page-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; margin-bottom: 1.5rem; }
  .ac-eyebrow { margin: 0 0 .35rem; color: hsl(var(--muted-foreground)); font-size: .72rem; font-weight: 700; letter-spacing: .09em; text-transform: uppercase; }
  .ac-page-title { margin: 0; font-size: clamp(1.45rem, 3.2cqi, 2.35rem); font-weight: 700; letter-spacing: -.035em; line-height: 1.08; }
  .ac-page-description { max-width: 44rem; margin: .55rem 0 0; color: hsl(var(--muted-foreground)); font-size: .94rem; line-height: 1.55; }
  .ac-page-actions { display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: .5rem; }
  .ac-card { border: 1px solid hsl(var(--border)); border-radius: var(--radius); background: hsl(var(--card)); color: hsl(var(--card-foreground)); box-shadow: 0 2px 8px -2px rgba(28, 25, 23, .06), 0 1px 2px rgba(28, 25, 23, .04); }
  .ac-button { display: inline-flex; min-height: 2.5rem; align-items: center; justify-content: center; gap: .5rem; border: 1px solid transparent; border-radius: calc(var(--radius) - .2rem); padding: .6rem .9rem; font-size: .875rem; font-weight: 600; line-height: 1; cursor: pointer; transition: background-color .16s ease, color .16s ease, border-color .16s ease, transform .16s ease; }
  .ac-button:hover { transform: translateY(-1px); }
  .ac-button:active { transform: translateY(0); }
  .ac-button:disabled { opacity: .5; pointer-events: none; }
  .ac-button-primary { background: hsl(var(--primary)); color: hsl(var(--primary-foreground)); }
  .ac-button-secondary { border-color: hsl(var(--border)); background: hsl(var(--card)); color: hsl(var(--card-foreground)); }
  .ac-button-ghost { background: transparent; color: hsl(var(--foreground)); }
  .ac-button-ghost:hover, .ac-button-secondary:hover { background: hsl(var(--muted)); }
  .ac-button-destructive { background: hsl(var(--destructive)); color: hsl(var(--destructive-foreground)); }
  .ac-button-sm { min-height: 2rem; padding: .42rem .68rem; font-size: .78rem; }
  .ac-button-lg { min-height: 2.8rem; padding: .72rem 1.1rem; }
  .ac-badge { display: inline-flex; align-items: center; width: fit-content; border-radius: 999px; padding: .24rem .52rem; background: hsl(var(--muted)); color: hsl(var(--muted-foreground)); font-size: .7rem; font-weight: 650; line-height: 1; }
  .ac-badge-success { background: hsl(151 60% 92%); color: hsl(151 60% 26%); }
  [data-theme='dark'] .ac-badge-success { background: hsl(151 50% 17%); color: hsl(151 55% 72%); }
  .ac-badge-warning { background: hsl(43 90% 91%); color: hsl(33 80% 27%); }
  [data-theme='dark'] .ac-badge-warning { background: hsl(36 55% 17%); color: hsl(43 82% 70%); }
  .ac-badge-danger { background: hsl(0 80% 94%); color: hsl(0 62% 38%); }
  [data-theme='dark'] .ac-badge-danger { background: hsl(0 50% 18%); color: hsl(0 72% 74%); }
  .ac-metric-card { display: grid; gap: .5rem; min-width: 0; padding: 1rem; }
  .ac-metric-heading { display: flex; align-items: center; justify-content: space-between; gap: .75rem; color: hsl(var(--muted-foreground)); font-size: .78rem; font-weight: 600; }
  .ac-metric-value { overflow: hidden; font-size: clamp(1.45rem, 5cqi, 2rem); letter-spacing: -.035em; line-height: 1.05; text-overflow: ellipsis; }
  .ac-metric-detail { margin: 0; color: hsl(var(--muted-foreground)); font-size: .75rem; line-height: 1.45; }
  .ac-empty-state { display: grid; place-items: center; min-height: 12rem; padding: 2rem; text-align: center; }
  .ac-empty-state h2 { margin: .8rem 0 .3rem; font-size: 1rem; }
  .ac-empty-state p { max-width: 26rem; margin: 0 0 1rem; color: hsl(var(--muted-foreground)); font-size: .875rem; line-height: 1.5; }
  .ac-empty-icon { display: grid; width: 2.5rem; height: 2.5rem; place-items: center; border-radius: .75rem; background: hsl(var(--muted)); color: hsl(var(--muted-foreground)); }
  .ac-skeleton { min-height: 1rem; border-radius: .5rem; background: hsl(var(--muted)); animation: ac-pulse 1.8s ease-in-out infinite; }
  .ac-scroll-area { min-width: 0; min-height: 0; overflow: auto; overscroll-behavior: contain; scrollbar-gutter: stable; }
  @keyframes ac-pulse { 0%, 100% { opacity: .55; } 50% { opacity: 1; } }
  @media (prefers-reduced-motion: reduce) { .ac-button, .ac-skeleton { transition: none; animation: none; } }
  @container (max-width: 32rem) {
    .ac-page-header { align-items: stretch; flex-direction: column; margin-bottom: 1rem; }
    .ac-page-actions { justify-content: flex-start; }
  }
}
`;

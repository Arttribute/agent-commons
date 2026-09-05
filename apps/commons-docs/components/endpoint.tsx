import type { ReactNode } from 'react';

const METHOD_STYLES: Record<string, string> = {
  GET: 'bg-brand-blue',
  POST: 'bg-brand-mint',
  PUT: 'bg-brand-yellow',
  PATCH: 'bg-brand-lilac',
  DELETE: 'bg-brand-pink',
  SSE: 'bg-brand-cyan',
};

/**
 * A single HTTP route, rendered the way it reads in a request line: coloured
 * verb, then the path in mono. Method colours come from the shared brand
 * pastels and always carry dark text, so they hold in both themes.
 */
export function Endpoint({
  method,
  path,
  children,
}: {
  method: keyof typeof METHOD_STYLES | string;
  path: string;
  children?: ReactNode;
}) {
  const verb = method.toUpperCase();

  return (
    <div className="not-prose my-4 rounded-lg border border-fd-border bg-fd-card">
      <div className="flex flex-wrap items-center gap-2.5 px-3 py-2.5">
        <span
          className={`rounded px-1.5 py-0.5 font-space text-[11px] font-bold tracking-wide text-stone-900 ${
            METHOD_STYLES[verb] ?? 'bg-fd-muted'
          }`}
        >
          {verb}
        </span>
        <code className="font-mono text-[13px] text-fd-foreground">{path}</code>
      </div>
      {children ? (
        <p className="border-t border-fd-border px-3 py-2 text-[13px] text-fd-muted-foreground">
          {children}
        </p>
      ) : null}
    </div>
  );
}

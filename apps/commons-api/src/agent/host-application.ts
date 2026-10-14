export type HostApplication = { name: string; url: string };

/** A display/navigation hint, never an authorization grant. */
export function hostApplicationFromContext(context?: string): HostApplication | undefined {
  if (!context) return undefined;
  try {
    const host = JSON.parse(context)?.hostApplication;
    if (!host || typeof host.name !== 'string' || typeof host.url !== 'string') return undefined;
    const url = new URL(host.url);
    if (url.protocol !== 'https:' || url.username || url.password) return undefined;
    return { name: host.name.slice(0, 80), url: url.toString() };
  } catch { return undefined; }
}

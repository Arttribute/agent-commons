"use client";
import { useCallback, useEffect, useState } from 'react';
import type { LocalConnectedApp } from '@agent-commons/desktop-contract';

export function LocalConnectedApps() {
  const [apps, setApps] = useState<LocalConnectedApp[]>([]);
  const [error, setError] = useState('');
  const [pending, setPending] = useState<string>();
  const refresh = useCallback(async () => {
    try { const result = await window.agentCommonsLocal?.getConnectedApps(); if (result) setApps(result.apps); setError(''); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not load connected apps.'); }
  }, []);
  useEffect(() => { void refresh(); const focus = () => { void refresh(); }; window.addEventListener('focus', focus); return () => window.removeEventListener('focus', focus); }, [refresh]);
  useEffect(() => {
    if (!pending) return;
    const started = Date.now();
    const timer = window.setInterval(() => { if (Date.now() - started > 120_000) setPending(undefined); else void refresh(); }, 5000);
    return () => window.clearInterval(timer);
  }, [pending, refresh]);
  useEffect(() => { if (apps.some((app) => app.providerKey === pending && app.connected)) setPending(undefined); }, [apps, pending]);
  return <div className="max-w-xl space-y-3 border-t border-border pt-4">
    <h3 className="font-semibold">Connected apps</h3>
    <p className="text-xs text-muted-foreground">Connect by approving access in your browser, then select the app for a chat in the + menu. Your model runs locally. Approved app requests go through Agent Commons to your connected account.</p>
    {apps.map((app) => <div key={app.id} className="flex items-center justify-between gap-3 rounded-md border border-border p-3">
      <div><p className="text-sm font-medium">{app.name}</p><p className="text-xs text-muted-foreground">{app.connected ? `Connected${app.accountName ? ` · ${app.accountName}` : ''}` : 'Not connected'}</p></div>
      <button type="button" className="rounded-md border border-border px-3 py-1.5 text-xs" disabled={pending === app.providerKey} onClick={() => {
        setError('');
        if (app.connected && app.connectionId) void window.agentCommonsLocal?.disconnectApp(app.connectionId).then(refresh).catch((cause) => setError(cause.message));
        else { setPending(app.providerKey); void window.agentCommonsLocal?.connectApp(app.providerKey).catch((cause) => { setPending(undefined); setError(cause.message); }); }
      }}>{pending === app.providerKey ? 'Waiting for approval…' : app.connected ? 'Disconnect' : 'Connect'}</button>
    </div>)}
    {!error && !apps.some((app) => app.providerKey.startsWith('hubspot')) && <p className="text-xs text-muted-foreground">HubSpot and HubSpot MCP will appear here once the platform connection is configured.</p>}
    {error && <p role="alert" className="text-xs text-muted-foreground">{error}</p>}
  </div>;
}

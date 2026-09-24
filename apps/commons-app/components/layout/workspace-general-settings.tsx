"use client";

import { useEffect, useState } from "react";
import type { LocalState } from "@agent-commons/desktop-contract";
import { useWorkspacePreferences } from "../../hooks/use-workspace-preferences";

export function WorkspaceGeneralSettings({ mode }: { mode: "cloud" | "private-local" }) {
  const { agentsPerPage, setAgentsPerPage } = useWorkspacePreferences();
  const local = mode === "private-local";
  const [localState, setLocalState] = useState<LocalState | null>(null);
  const [storageRoot, setStorageRoot] = useState("");
  const [models, setModels] = useState<string[]>([]);
  const [modelServerUnavailable, setModelServerUnavailable] = useState(false);
  const [ollamaUrl, setOllamaUrl] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!local || !window.agentCommonsLocal) return;
    const bridge = window.agentCommonsLocal;
    const availableModels = bridge.listModels().then((items) => ({ items, unavailable: false }))
      .catch(() => ({ items: [] as string[], unavailable: true }));
    void Promise.all([bridge.getState(), bridge.getStorageRoot(), availableModels]).then(([state, root, available]) => {
      setLocalState(state);
      setStorageRoot(root);
      setModels(available.items);
      setModelServerUnavailable(available.unavailable);
      setOllamaUrl(state.settings.ollamaUrl);
    }).catch((cause) => setError(cause instanceof Error ? cause.message : "Could not load Local settings"));
    return bridge.onEvent((event) => { if (event.type === "state") setLocalState(event.state); });
  }, [local]);

  const saveLocalSettings = async (patch: Partial<LocalState["settings"]>) => {
    try {
      setError("");
      const state = await window.agentCommonsLocal?.updateSettings(patch);
      if (state) setLocalState(state);
      if (patch.ollamaUrl !== undefined) {
        try {
          setModels(await window.agentCommonsLocal?.listModels(patch.ollamaUrl) ?? []);
          setModelServerUnavailable(false);
        } catch {
          setModels([]);
          setModelServerUnavailable(true);
        }
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save Local settings");
    }
  };
  return <section className="space-y-5 rounded-xl border border-border bg-white p-5" aria-label="General workspace settings">
    <div>
      <h2 className="text-base font-semibold">General</h2>
      <p className="mt-1 text-sm text-muted-foreground">Your display preferences follow you between Cloud and Local.</p>
    </div>
    <label className="flex max-w-md items-center justify-between gap-4 text-sm">
      <span>Agents shown per page</span>
      <select className="rounded-md border border-border bg-background px-3 py-2" value={agentsPerPage} onChange={(event) => setAgentsPerPage(Number(event.target.value))}>
        {[5, 10, 20, 50].map((size) => <option key={size} value={size}>{size}</option>)}
      </select>
    </label>
    <div className="border-t border-border pt-4 text-sm">
      <strong>{local ? "Local workspace" : "Cloud workspace"}</strong>
      <p className="mt-1 text-muted-foreground">{local
        ? "Agents, chats, files, Knowledge Spaces, artifacts, and pinned local apps stay on this computer. Local models use a loopback server. Agent commands still require your selected permission level."
        : "Chats and resources in this mode use Commons Cloud. Desktop file and command results can enter the cloud conversation. Approved commands run with your computer account's access and can read outside the selected folder, including Private Local files."}</p>
    </div>
    {local && <div className="space-y-4 border-t border-border pt-4 text-sm">
      <div>
        <h3 className="font-semibold">Local storage</h3>
        <p className="mt-1 text-muted-foreground">Knowledge notes, artifact copies, apps, skills, and readable records are organized in this folder. Local files are restricted to your computer account. The state index also uses system storage encryption on Windows and Linux when available.</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <code className="max-w-full overflow-auto rounded-md bg-muted px-2 py-1 text-xs">{storageRoot || "Loading…"}</code>
          <button type="button" className="rounded-md border px-2 py-1 hover:bg-muted" onClick={() => void window.agentCommonsLocal?.openStorageRoot()}>Open folder</button>
        </div>
      </div>
      <label className="flex max-w-xl items-center justify-between gap-4">
        <span>Local model</span>
        <select className="min-w-48 rounded-md border border-border bg-background px-3 py-2" value={localState?.settings.defaultModel ?? ""} onChange={(event) => void saveLocalSettings({ defaultModel: event.target.value })}>
          {models.length ? models.map((model) => <option key={model} value={model}>{model}</option>) : <option value={localState?.settings.defaultModel ?? ""}>{localState?.settings.defaultModel || "No model installed"}</option>}
        </select>
      </label>
      {modelServerUnavailable && <p className="text-xs text-muted-foreground">The Local model server is unavailable. Check its address below or start Ollama.</p>}
      <label className="flex max-w-xl items-center justify-between gap-4">
        <span>Agent command permission</span>
        <select className="rounded-md border border-border bg-background px-3 py-2" value={localState?.settings.permissionMode ?? "ask"} onChange={(event) => void saveLocalSettings({ permissionMode: event.target.value as "ask" | "read-only" })}>
          <option value="ask">Ask before changes</option>
          <option value="read-only">Read only</option>
        </select>
      </label>
      <label className="block max-w-xl space-y-1">
        <span>Local model server</span>
        <input className="w-full rounded-md border border-border bg-background px-3 py-2" value={ollamaUrl} onChange={(event) => setOllamaUrl(event.target.value)} onBlur={() => { if (ollamaUrl !== localState?.settings.ollamaUrl) void saveLocalSettings({ ollamaUrl }); }} />
      </label>
      {error && <p role="alert" className="text-destructive">{error}</p>}
    </div>}
  </section>;
}

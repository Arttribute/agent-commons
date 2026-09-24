"use client";

import { useEffect, useState } from "react";
import type { CloudAccess, LocalState } from "@agent-commons/desktop-contract";
import { useWorkspacePreferences } from "../../hooks/use-workspace-preferences";
import { desktopApiFetch } from "@/lib/desktop-api-fetch";

export function WorkspaceGeneralSettings({ mode }: { mode: "cloud" | "private-local" }) {
  const { agentsPerPage, setAgentsPerPage } = useWorkspacePreferences();
  const local = mode === "private-local";
  const [localState, setLocalState] = useState<LocalState | null>(null);
  const [storageRoot, setStorageRoot] = useState("");
  const [models, setModels] = useState<string[]>([]);
  const [modelServerUnavailable, setModelServerUnavailable] = useState(false);
  const [ollamaUrl, setOllamaUrl] = useState("");
  const [error, setError] = useState("");
  const [desktop, setDesktop] = useState(false);
  const [cloudAccess, setCloudAccess] = useState<CloudAccess | null>(null);
  const [cloudWorkspace, setCloudWorkspace] = useState<string | null>(null);
  const [transferItems, setTransferItems] = useState<Array<{ id: string; name: string; mimeType: string }>>([]);
  const [transferId, setTransferId] = useState("");
  const [transferBusy, setTransferBusy] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => { setDesktop(Boolean(window.agentCommonsDesktop)); }, []);

  useEffect(() => {
    if (local || !window.agentCommonsDesktop) return;
    let active = true;
    void Promise.all([window.agentCommonsDesktop.getAccess(), window.agentCommonsDesktop.getWorkspace()])
      .then(([access, workspace]) => { if (active) { setCloudAccess(access); setCloudWorkspace(workspace); } })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "Could not load Cloud desktop access"); });
    return () => { active = false; };
  }, [local]);

  const saveCloudAccess = async (patch: Partial<CloudAccess>) => {
    if (!cloudAccess) return;
    try {
      setError("");
      setCloudAccess(await window.agentCommonsDesktop!.updateAccess({ ...cloudAccess, ...patch }));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save Cloud desktop access"); }
  };

  const showLocalFiles = async () => {
    try {
      setError("");
      const items = await window.agentCommonsDesktop!.listLocalTransferItems();
      setTransferItems(items);
      setTransferId(items[0]?.id ?? "");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not list Local files"); }
  };

  const sendLocalFileToCloud = async () => {
    if (!transferId) return;
    setTransferBusy(true);
    setError("");
    setNotice("");
    try {
      const file = await window.agentCommonsDesktop!.readLocalTransferItem(transferId);
      const body = new FormData();
      body.append("files", new File([new Uint8Array(file.bytes)], file.name, { type: file.mimeType }));
      const response = await desktopApiFetch("/api/files/upload", { method: "POST", body });
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw new Error(result.message || result.error || "Cloud upload failed");
      }
      setNotice(`${file.name} was copied to your Cloud Library.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not copy the file to Cloud"); }
    finally { setTransferBusy(false); }
  };

  useEffect(() => {
    if (!local || !window.agentCommonsLocal) return;
    const bridge = window.agentCommonsLocal;
    let active = true;
    void Promise.all([bridge.getState(), bridge.getStorageRoot()]).then(([state, root]) => {
      if (!active) return;
      setLocalState(state);
      setStorageRoot(root);
      setOllamaUrl(state.settings.ollamaUrl);
    }).catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "Could not load Local settings"); });
    void bridge.listModels().then((items) => {
      if (!active) return;
      setModels(items);
      setModelServerUnavailable(false);
    }).catch(() => { if (active) setModelServerUnavailable(true); });
    const off = bridge.onEvent((event) => { if (active && event.type === "state") setLocalState(event.state); });
    return () => { active = false; off(); };
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
        ? "Agents, chats, files, Knowledge Spaces, artifacts, and pinned local apps stay on this computer. Local models use a loopback server. Approved Local commands run with your computer account's permissions and may themselves use the network; choose Read only below to block agent commands."
        : "Chats and resources in this mode use Commons Cloud. File and command results you permit can enter the cloud conversation. Choose the computer access below."}</p>
    </div>
    {!local && desktop && <div className="space-y-4 border-t border-border pt-4 text-sm">
      <div>
        <h3 className="font-semibold">Cloud access to this computer</h3>
        <p className="mt-1 text-muted-foreground">File tools are limited to the selected folder. The Private Local data folder cannot be selected.</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <code className="max-w-full overflow-auto rounded-md bg-muted px-2 py-1 text-xs">{cloudWorkspace || "No folder selected"}</code>
          <button type="button" className="rounded-md border px-2 py-1 hover:bg-muted" onClick={() => void window.agentCommonsDesktop?.chooseWorkspace().then(setCloudWorkspace).catch((cause) => setError(cause instanceof Error ? cause.message : "Could not choose folder"))}>Choose folder</button>
        </div>
      </div>
      {([["readFiles", "Allow reading files"], ["writeFiles", "Allow editing files"], ["runCommands", "Allow full computer commands"]] as const).map(([key, label]) => <label key={key} className="flex max-w-xl items-center justify-between gap-4">
        <span>{label}</span>
        <input type="checkbox" checked={cloudAccess?.[key] ?? false} disabled={!cloudAccess} onChange={(event) => void saveCloudAccess({ [key]: event.target.checked })} />
      </label>)}
      <p className="text-xs text-muted-foreground">Commands are off by default. When enabled, each command asks you first and runs with your computer account’s access, including files outside this folder and Private Local data. Disable commands to keep Cloud agents inside the selected folder.</p>
      <div className="space-y-2 border-t border-border pt-4">
        <h3 className="font-semibold">Copy a Local Library file to Cloud</h3>
        <p className="text-xs text-muted-foreground">Choose a file and confirm its transfer. Local mode never uploads files automatically.</p>
        <button type="button" className="rounded-md border px-2 py-1 hover:bg-muted" onClick={() => void showLocalFiles()}>Show Local Library files</button>
        {transferItems.length > 0 && <div className="flex flex-wrap gap-2">
          <select aria-label="Local Library file" className="max-w-full rounded-md border border-border bg-background px-3 py-2" value={transferId} onChange={(event) => setTransferId(event.target.value)}>
            {transferItems.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
          <button type="button" disabled={transferBusy} className="rounded-md border px-2 py-1 hover:bg-muted disabled:opacity-50" onClick={() => void sendLocalFileToCloud()}>{transferBusy ? "Copying…" : "Copy to Cloud Library"}</button>
        </div>}
        {notice && <p role="status">{notice}</p>}
      </div>
      {error && <p role="alert" className="text-destructive">{error}</p>}
    </div>}
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

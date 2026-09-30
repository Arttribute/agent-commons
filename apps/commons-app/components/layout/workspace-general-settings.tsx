"use client";

import { useEffect, useState } from "react";
import type { CloudAccess, ImageModelStatus, LocalModelDownload, LocalModelStatus, LocalState, VoiceModelStatus } from "@agent-commons/desktop-contract";
import { useWorkspacePreferences } from "../../hooks/use-workspace-preferences";
import { desktopApiFetch } from "@/lib/desktop-api-fetch";

const LOCAL_CHAT_MODELS = [
  { id: "qwen3:0.6b", name: "Qwen 3 Light", size: "523 MB", ram: 3, use: "Simple chat on limited hardware", abilities: "Tools · Reasoning" },
  { id: "qwen3:1.7b", name: "Qwen 3 Small", size: "1.4 GB", ram: 4, use: "Everyday chat on smaller computers", abilities: "Tools · Reasoning" },
  { id: "qwen3:4b", name: "Qwen 3 Balanced", size: "2.5 GB", ram: 8, use: "Research, writing, and tool work", abilities: "Tools · Reasoning" },
  { id: "qwen3:8b", name: "Qwen 3 Strong", size: "5.2 GB", ram: 12, use: "More demanding knowledge and coding work", abilities: "Tools · Reasoning" },
  { id: "qwen2.5-coder:3b", name: "Qwen Coder", size: "1.9 GB", ram: 6, use: "Coding on modest hardware", abilities: "Tools · Code" },
  { id: "deepseek-r1:1.5b", name: "DeepSeek R1 Small", size: "1.1 GB", ram: 4, use: "Lightweight reasoning", abilities: "Reasoning" },
  { id: "deepseek-r1:8b", name: "DeepSeek R1", size: "5.2 GB", ram: 12, use: "Deeper reasoning and analysis", abilities: "Tools · Reasoning" },
] as const;

export function WorkspaceGeneralSettings({ mode }: { mode: "cloud" | "private-local" }) {
  const { agentsPerPage, setAgentsPerPage } = useWorkspacePreferences();
  const local = mode === "private-local";
  const [localState, setLocalState] = useState<LocalState | null>(null);
  const [storageRoot, setStorageRoot] = useState("");
  const [models, setModels] = useState<string[]>([]);
  const [hardware, setHardware] = useState<{ ramGiB: number; freeDiskGiB: number; platform: string; arch: string } | null>(null);
  const [modelDownload, setModelDownload] = useState<LocalModelDownload | null>(null);
  const [customModelName, setCustomModelName] = useState("");
  const [speechBusy, setSpeechBusy] = useState(false);
  const [speechReady, setSpeechReady] = useState(false);
  const [imageStatus, setImageStatus] = useState<ImageModelStatus | null>(null);
  const [imageModels, setImageModels] = useState<Array<{ id: string; name: string; bytes: number }>>([]);
  const [voiceStatus, setVoiceStatus] = useState<VoiceModelStatus | null>(null);
  const [modelServerUnavailable, setModelServerUnavailable] = useState(false);
  const [modelStatus, setModelStatus] = useState<LocalModelStatus | null>(null);
  const [ollamaUrl, setOllamaUrl] = useState("");
  const [webSearchUrl, setWebSearchUrl] = useState("");
  const [webSearchApiKey, setWebSearchApiKey] = useState("");
  const [mcpName, setMcpName] = useState("");
  const [mcpUrl, setMcpUrl] = useState("");
  const [mcpApiKey, setMcpApiKey] = useState("");
  const [mcpMode, setMcpMode] = useState<"read" | "write">("read");
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
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.message || result.error || "Cloud upload failed");
      const cloudItemId = result?.data?.[0]?.fileId ?? result?.data?.[0]?.itemId;
      // Remember the Cloud copy so the Local Library shows the file is in both places.
      if (typeof cloudItemId === "string") await window.agentCommonsDesktop!.markLocalTransferred(transferId, cloudItemId).catch(() => undefined);
      setNotice(`${file.name} was copied to your Cloud Library.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not copy the file to Cloud"); }
    finally { setTransferBusy(false); }
  };

  useEffect(() => {
    if (!local || !window.agentCommonsLocal) return;
    const bridge = window.agentCommonsLocal;
    let active = true;
    void Promise.all([bridge.getState(), bridge.getStorageRoot(), bridge.getModelStatus(), bridge.getHardwareInfo(), bridge.getImageModelStatus(), bridge.listImageModels(), bridge.getVoiceModelStatus()]).then(([state, root, status, hardwareInfo, imageModelStatus, installedImages, speechStatus]) => {
      if (!active) return;
      setLocalState(state);
      setStorageRoot(root);
      setModelStatus(status);
      setHardware(hardwareInfo);
      setImageStatus(imageModelStatus);
      setImageModels(installedImages);
      setVoiceStatus(speechStatus);
      setOllamaUrl(state.settings.ollamaUrl);
      setWebSearchUrl(state.settings.webSearchUrl ?? "");
      setWebSearchApiKey(state.settings.webSearchApiKey ?? "");
    }).catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "Could not load Local settings"); });
    void bridge.listModels().then((items) => {
      if (!active) return;
      setModels(items);
      setModelServerUnavailable(false);
    }).catch(() => { if (active) setModelServerUnavailable(true); });
    const off = bridge.onEvent((event) => {
      if (!active) return;
      if (event.type === "state") setLocalState(event.state);
      if (event.type === "model") {
        setModelStatus(event.model);
        if (event.model.state === "ready") {
          setModelServerUnavailable(false);
          void bridge.listModels().then(setModels).catch(() => undefined);
        }
      }
      if (event.type === "model-download") setModelDownload(event.download);
      if (event.type === "image-model") {
        setImageStatus(event.status);
        if (event.status.state === "ready") void bridge.listImageModels().then(setImageModels).catch(() => undefined);
      }
      if (event.type === "voice-model") setVoiceStatus(event.status);
    });
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
  const addMcpServer = async () => {
    if (!mcpName.trim() || !mcpUrl.trim()) { setError("Enter a server name and endpoint."); return; }
    const current = localState?.settings.mcpServers ?? [];
    const id = crypto.randomUUID().replace(/-/g, "").slice(0, 24);
    await saveLocalSettings({ mcpServers: [...current, { id, name: mcpName.trim(), url: mcpUrl.trim(), apiKey: mcpApiKey.trim() || undefined, mode: mcpMode, enabled: true }] });
    setMcpName(""); setMcpUrl(""); setMcpApiKey(""); setMcpMode("read");
  };
  const downloadAndUseModel = async (name: string) => {
    try {
      setError("");
      await window.agentCommonsLocal!.downloadModel(name);
      const available = await window.agentCommonsLocal!.listModels();
      setModels(available);
      if (!available.includes(name) && !available.includes(`${name}:latest`)) throw new Error("The download finished, but the model is not available locally yet.");
      setLocalState(await window.agentCommonsLocal!.updateSettings({ defaultModel: available.includes(name) ? name : `${name}:latest` }));
      setCustomModelName("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not download this model"); }
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
      <div className="max-w-xl space-y-3 border-t border-border pt-4">
        <h3 className="font-semibold">Local chat models</h3>
        <p className="text-xs text-muted-foreground">Download once from Ollama, then use the model for new chats and agents that follow the default. Installed models appear above. The memory guide includes room for the model and a modest chat context; longer sessions need more.</p>
        {hardware && <p className="text-xs text-muted-foreground">This computer: {hardware.ramGiB} GB RAM · {hardware.freeDiskGiB} GB free · {hardware.platform === "darwin" ? "macOS" : hardware.platform === "win32" ? "Windows" : "Linux"} · {hardware.arch}</p>}
        <div className="grid gap-2 sm:grid-cols-2">
          {LOCAL_CHAT_MODELS.map((model) => {
            const installed = models.includes(model.id) || models.includes(`${model.id}:latest`);
            const busy = Boolean(modelDownload && !modelDownload.done);
            return <div key={model.id} className="rounded-lg border border-border p-3">
              <div className="flex items-start justify-between gap-2"><strong className="text-sm">{model.name}</strong><span className="text-xs text-muted-foreground">{model.size}</span></div>
              <p className="mt-1 text-xs text-muted-foreground">{model.use}</p>
              <p className="mt-1 text-[11px] text-muted-foreground">{model.abilities} · Suggested {model.ram} GB RAM{hardware && hardware.ramGiB < model.ram ? " · May be slow here" : ""}{hardware && hardware.freeDiskGiB < Number.parseFloat(model.size.replace(" MB", "")) * (model.size.endsWith("MB") ? 1 / 1024 : 1) + 1 ? " · Low disk space" : ""}</p>
              <button type="button" disabled={busy || (installed && localState?.settings.defaultModel === model.id)} className="mt-2 rounded-md border px-2 py-1 text-xs hover:bg-muted disabled:opacity-50" onClick={() => void (installed ? saveLocalSettings({ defaultModel: models.includes(model.id) ? model.id : `${model.id}:latest` }) : downloadAndUseModel(model.id))}>{installed ? localState?.settings.defaultModel === model.id ? "In use" : "Use as default" : "Download and use"}</button>
            </div>;
          })}
        </div>
        <div className="flex gap-2"><input aria-label="Other Ollama model name" className="min-w-0 flex-1 rounded-md border border-border bg-background px-3 py-2" placeholder="Other model, for example qwen3:14b" value={customModelName} onChange={(event) => setCustomModelName(event.target.value)} /><button type="button" disabled={!customModelName.trim() || Boolean(modelDownload && !modelDownload.done)} className="rounded-md border px-3 py-2 hover:bg-muted disabled:opacity-50" onClick={() => void downloadAndUseModel(customModelName)}>Download</button></div>
        {modelDownload && <p role="status" className="text-xs">{modelDownload.name}: {modelDownload.error || modelDownload.status}{modelDownload.progress !== undefined ? ` · ${Math.round(modelDownload.progress * 100)}%` : ""}</p>}
      </div>
      <div className="max-w-xl space-y-2 border-t border-border pt-4">
        <h3 className="font-semibold">Speech to text</h3>
        <p className="text-xs text-muted-foreground">Voice prompts use Whisper on this computer. Base is selected by default; model weights download once, and your recording stays local.</p>
        <select className="w-full rounded-md border border-border bg-background px-3 py-2" value={localState?.settings.transcriptionModel ?? "Xenova/whisper-base"} onChange={(event) => { setSpeechReady(false); void saveLocalSettings({ transcriptionModel: event.target.value as NonNullable<LocalState["settings"]["transcriptionModel"]> }); }}>
          <option value="Xenova/whisper-tiny">Whisper Tiny · fastest, lower accuracy</option>
          <option value="Xenova/whisper-base">Whisper Base · balanced default</option>
          <option value="Xenova/whisper-small">Whisper Small · higher accuracy, more memory</option>
        </select>
        <button type="button" disabled={speechBusy} className="rounded-md border px-3 py-2 hover:bg-muted disabled:opacity-50" onClick={() => { setSpeechBusy(true); setError(""); void window.agentCommonsLocal!.prepareTranscriptionModel().then(() => setSpeechReady(true)).catch((cause) => setError(cause instanceof Error ? cause.message : "Could not prepare speech model")).finally(() => setSpeechBusy(false)); }}>{speechBusy ? "Downloading speech model…" : speechReady ? "Speech model ready" : "Download speech model"}</button>
      </div>
      <div className="max-w-xl space-y-2 border-t border-border pt-4">
        <h3 className="font-semibold">Image generation</h3>
        <p className="text-xs text-muted-foreground">Agents generate images on this computer with a small default model. Its verified 1 GB weights and runtime download automatically the first time you generate an image. Generated images stay in the Local Library. Add compatible single-file Stable Diffusion checkpoints to the model folder to use another model.</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={imageStatus?.state === "downloading"} className="rounded-md border px-3 py-2 hover:bg-muted disabled:opacity-50" onClick={() => { setError(""); void window.agentCommonsLocal!.prepareImageModel().catch((cause) => setError(cause instanceof Error ? cause.message : "Could not download image model")); }}>{imageStatus?.state === "downloading" ? "Downloading…" : imageStatus?.state === "ready" ? "Image model ready" : "Download image model"}</button>
          <button type="button" className="rounded-md border px-3 py-2 hover:bg-muted" onClick={() => void window.agentCommonsLocal?.openImageModelFolder().catch((cause) => setError(cause instanceof Error ? cause.message : "Could not open model folder"))}>Open model folder</button>
          <button type="button" className="rounded-md border px-3 py-2 hover:bg-muted" onClick={() => void window.agentCommonsLocal?.listImageModels().then(setImageModels).catch((cause) => setError(cause instanceof Error ? cause.message : "Could not list image models"))}>Refresh models</button>
        </div>
        {imageStatus && <p role="status" className="text-xs text-muted-foreground">{imageStatus.error || imageStatus.label}{imageStatus.progress !== undefined ? ` · ${Math.round(imageStatus.progress * 100)}%` : ""}</p>}
        {imageStatus?.state === "downloading" && <progress className="w-full" value={imageStatus.progress ?? 0} max={1} />}
      {imageModels.length > 0 && <label className="block space-y-1 text-xs"><span>Default image model</span><select className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" value={localState?.settings.imageModel || "tiny-sd.safetensors"} onChange={(event) => void saveLocalSettings({ imageModel: event.target.value })}>{imageModels.map((model) => <option key={model.id} value={model.id}>{model.name} · {(model.bytes / 1024 ** 3).toFixed(1)} GB</option>)}</select></label>}
      </div>
      <div className="max-w-xl space-y-2 border-t border-border pt-4">
        <h3 className="font-semibold">Voice generation</h3>
        <p className="text-xs text-muted-foreground">Choose a local voice. SpeechT5 is ready by default; Kokoro is an optional 92 MB voice model with more natural voices. The selected model downloads once, and speech stays on this computer.</p>
        <select className="w-full rounded-md border border-border bg-background px-3 py-2" value={localState?.settings.voiceModel || "female"} onChange={(event) => void saveLocalSettings({ voiceModel: event.target.value as NonNullable<LocalState["settings"]["voiceModel"]> })}>
          <option value="female">SpeechT5 · English female</option>
          <option value="male">SpeechT5 · English male</option>
          <option value="kokoro-heart">Kokoro · Heart (US female)</option>
          <option value="kokoro-bella">Kokoro · Bella (US female)</option>
          <option value="kokoro-michael">Kokoro · Michael (US male)</option>
          <option value="kokoro-george">Kokoro · George (UK male)</option>
        </select>
        <button type="button" disabled={voiceStatus?.state === "downloading"} className="rounded-md border px-3 py-2 hover:bg-muted disabled:opacity-50" onClick={() => { setError(""); void window.agentCommonsLocal?.prepareVoiceModel().catch((cause) => setError(cause instanceof Error ? cause.message : "Could not prepare voice model")); }}>{voiceStatus?.state === "downloading" ? "Downloading voice…" : voiceStatus?.state === "ready" && voiceStatus.model === (localState?.settings.voiceModel || "female") ? "Voice ready" : "Download selected voice"}</button>
        {voiceStatus?.error && <p role="alert" className="text-xs text-destructive">{voiceStatus.error}</p>}
      </div>
      {modelStatus && <div role="status" className="max-w-xl space-y-2 text-xs text-muted-foreground">
        <p>{modelStatus.label}</p>
        {modelStatus.progress !== undefined && modelStatus.state !== "ready" && <progress className="w-full" value={modelStatus.progress} max={1} />}
        {modelStatus.state === "error" && <button type="button" className="rounded-md border px-2 py-1 hover:bg-muted" onClick={() => void window.agentCommonsLocal?.prepareModel().catch((cause) => setError(cause instanceof Error ? cause.message : "Local AI setup failed"))}>Retry local AI setup</button>}
      </div>}
      {modelServerUnavailable && modelStatus?.state !== "downloading-runtime" && modelStatus?.state !== "downloading-model" && modelStatus?.state !== "starting" && <p className="text-xs text-muted-foreground">The Local model server is unavailable. Check its address below.</p>}
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
      <div className="max-w-xl space-y-2 border-t border-border pt-4">
        <h3 className="font-semibold">Web search</h3>
        <p className="text-xs text-muted-foreground">Off by default. Add a SearXNG endpoint, then enable search for a chat in the + menu. Each query and destination require approval before anything leaves this computer. Search can only read results.</p>
        <label className="block space-y-1"><span>Search endpoint</span><input type="url" placeholder="https://search.example.com" className="w-full rounded-md border border-border bg-background px-3 py-2" value={webSearchUrl} onChange={(event) => setWebSearchUrl(event.target.value)} onBlur={() => { if (webSearchUrl !== (localState?.settings.webSearchUrl ?? "")) void saveLocalSettings({ webSearchUrl }); }} /></label>
        <label className="block space-y-1"><span>API key, if required</span><input type="password" autoComplete="off" className="w-full rounded-md border border-border bg-background px-3 py-2" value={webSearchApiKey} onChange={(event) => setWebSearchApiKey(event.target.value)} onBlur={() => { if (webSearchApiKey !== (localState?.settings.webSearchApiKey ?? "")) void saveLocalSettings({ webSearchApiKey }); }} /></label>
      </div>
      <div className="max-w-xl space-y-3 border-t border-border pt-4">
        <h3 className="font-semibold">MCP connectors</h3>
        <p className="text-xs text-muted-foreground">Connectors are off for each chat until selected in the + menu. Read mode only exposes tools marked read only by the server. Every connection and tool request asks before data leaves this computer.</p>
        {(localState?.settings.mcpServers ?? []).map((server) => <div key={server.id} className="rounded-md border border-border p-3">
          <div className="flex items-center justify-between gap-2">
            <label className="flex items-center gap-2 font-medium"><input type="checkbox" checked={server.enabled} onChange={(event) => void saveLocalSettings({ mcpServers: (localState?.settings.mcpServers ?? []).map((item) => item.id === server.id ? { ...item, enabled: event.target.checked } : item) })} />{server.name}</label>
            <button type="button" className="text-xs text-muted-foreground hover:text-destructive" onClick={() => void saveLocalSettings({ mcpServers: (localState?.settings.mcpServers ?? []).filter((item) => item.id !== server.id) })}>Remove</button>
          </div>
          <p className="mt-1 break-all text-xs text-muted-foreground">{server.url} · {server.mode === "read" ? "Read only" : "Read and write"}</p>
        </div>)}
        <label className="block space-y-1"><span>Server name</span><input className="w-full rounded-md border border-border bg-background px-3 py-2" value={mcpName} onChange={(event) => setMcpName(event.target.value)} placeholder="My connector" /></label>
        <label className="block space-y-1"><span>Streamable HTTP endpoint</span><input type="url" className="w-full rounded-md border border-border bg-background px-3 py-2" value={mcpUrl} onChange={(event) => setMcpUrl(event.target.value)} placeholder="https://example.com/mcp" /></label>
        <label className="block space-y-1"><span>Bearer API key, if required</span><input type="password" autoComplete="off" className="w-full rounded-md border border-border bg-background px-3 py-2" value={mcpApiKey} onChange={(event) => setMcpApiKey(event.target.value)} /></label>
        <label className="flex items-center justify-between gap-4"><span>Access</span><select className="rounded-md border border-border bg-background px-3 py-2" value={mcpMode} onChange={(event) => setMcpMode(event.target.value as "read" | "write")}><option value="read">Read only</option><option value="write">Read and write</option></select></label>
        <button type="button" className="rounded-md border px-3 py-2 hover:bg-muted" onClick={() => void addMcpServer()}>Add connector</button>
      </div>
      {error && <p role="alert" className="text-destructive">{error}</p>}
    </div>}
  </section>;
}

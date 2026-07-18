"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DashboardSideBar } from "@/components/layout/dashboard-side-bar";
import { PageTitle } from "@/components/layout/page-header";
import { CreditsMenu } from "@/components/billing/credits-menu";
import { useAuth } from "@/context/AuthContext";
import { normalizePrincipalId } from "@/lib/principal-id";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import {
  AppWindow, Download, File, FileArchive, FileCode2, FileImage, FileText,
  Filter, Grid2X2, Heart, Image as ImageIcon, LayoutList, LibraryBig, Link2,
  Loader2, MoreHorizontal, Search, Share2, ShieldCheck, Trash2, Upload,
} from "lucide-react";

type LibraryItem = {
  itemId: string; name: string; description?: string | null; kind: string;
  mimeType: string; sizeBytes: number; source: string; status: string;
  visibility: string; sourceAgentId?: string | null; sourceSessionId?: string | null;
  sessionTitle?: string | null; textPreview?: string | null; previewUrl?: string | null;
  metadata?: Record<string, unknown>; isFavorite: boolean; createdAt: string; updatedAt: string;
};

type Grant = { grantId: string; subjectType: string; subjectId: string; permission: string };
type ItemDetail = LibraryItem & { grants: Grant[]; blobs: Array<{ storageProvider: string }> };

const tabs = [
  ["all", "All", LibraryBig], ["images", "Images", ImageIcon],
  ["files", "Files", FileText], ["apps", "Apps", AppWindow],
] as const;

export default function LibraryPage() {
  const { authState } = useAuth();
  const userAddress = normalizePrincipalId(authState.walletAddress);
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [view, setView] = useState("all");
  const [source, setSource] = useState("all");
  const [favorites, setFavorites] = useState(false);
  const [layout, setLayout] = useState<"grid" | "list">("grid");
  const [groupByChat, setGroupByChat] = useState(false);
  const [selected, setSelected] = useState<ItemDetail | null>(null);
  const [grantType, setGrantType] = useState<"agent" | "user" | "workspace">("agent");
  const [grantId, setGrantId] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    const params = new URLSearchParams();
    if (query.trim()) params.set("query", query.trim());
    if (view !== "all") params.set("view", view);
    if (source !== "all") params.set("source", source);
    if (favorites) params.set("favorite", "true");
    try {
      const response = await fetch(`/api/library?${params}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.message || data?.error || "Could not load library");
      setItems(Array.isArray(data) ? data : data?.data || []);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not load library"); }
    finally { setLoading(false); }
  }, [query, view, source, favorites]);

  useEffect(() => { const timer = setTimeout(load, 180); return () => clearTimeout(timer); }, [load]);

  const groups = useMemo<Array<[string, LibraryItem[]]>>(() => {
    if (!groupByChat) return [["All artifacts", items]];
    const grouped = new Map<string, LibraryItem[]>();
    for (const item of items) {
      const label = item.sessionTitle || (item.source === "upload" ? "Uploaded directly" : "Created outside a chat");
      grouped.set(label, [...(grouped.get(label) || []), item]);
    }
    return [...grouped.entries()];
  }, [groupByChat, items]);

  async function upload(files: FileList | null, provider?: "s3" | "ipfs") {
    if (!files?.length) return;
    if (provider === "ipfs" && !window.confirm("IPFS files are publicly addressable and may remain available after deletion. Publish these files to IPFS?")) return;
    setUploading(true); setError("");
    try {
      const body = new FormData();
      [...files].forEach((file) => body.append("files", file));
      if (provider) body.set("storageProvider", provider);
      const response = await fetch("/api/files/upload", { method: "POST", body });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.message || data?.error || "Upload failed");
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Upload failed"); }
    finally { setUploading(false); if (inputRef.current) inputRef.current.value = ""; }
  }

  async function mutate(itemId: string, method: "PATCH" | "DELETE", body?: unknown) {
    const response = await fetch(`/api/library/${itemId}`, {
      method, headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!response.ok) throw new Error("Library update failed");
    await load();
  }

  async function download(item: LibraryItem) {
    const response = await fetch(`/api/library/${item.itemId}/download`);
    const data = await response.json();
    if (data?.url) window.open(data.url, "_blank", "noopener,noreferrer");
  }

  async function shareLink(item: LibraryItem) {
    const response = await fetch(`/api/library/${item.itemId}/share-links`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ expiresAt: new Date(Date.now() + 7 * 86400000).toISOString() }),
    });
    const data = await response.json();
    if (!response.ok || !data?.url) throw new Error(data?.message || "Could not create share link");
    await navigator.clipboard.writeText(data.url);
  }

  async function openAccess(item: LibraryItem) {
    const response = await fetch(`/api/library/${item.itemId}`);
    const data = await response.json();
    if (response.ok) setSelected(data);
  }

  async function addGrant() {
    if (!selected || !grantId.trim()) return;
    const response = await fetch(`/api/library/${selected.itemId}/grants`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subjectType: grantType, subjectId: grantId.trim(), permission: "read" }),
    });
    if (!response.ok) return;
    setGrantId(""); await openAccess(selected);
  }

  return (
    <div className="h-screen overflow-hidden bg-page text-stone-950">
      <div className="flex h-screen"><DashboardSideBar username={userAddress} />
        <main className="min-w-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-[1500px] px-5 py-6 sm:px-8 lg:px-12">
            <header className="flex flex-col gap-4 pb-3 lg:flex-row lg:items-end lg:justify-between">
              <div><PageTitle title="Library" />
                <p className="mt-1.5 text-sm text-muted-foreground">Private files, images, documents, and apps created with your agents.</p></div>
              <div className="flex flex-wrap items-center gap-3">
                <div className="relative min-w-[240px] flex-1 lg:w-80"><Search className="absolute left-3 top-2.5 h-4 w-4 text-stone-400" />
                  <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search names and contents" className="h-9 bg-white pl-9" /></div>
                <input ref={inputRef} type="file" multiple className="hidden" onChange={(e) => {
                  const provider = e.currentTarget.dataset.provider as "s3" | "ipfs" | undefined;
                  delete e.currentTarget.dataset.provider;
                  upload(e.target.files, provider);
                }} />
                <CreditsMenu />
                <DropdownMenu><DropdownMenuTrigger asChild>
                  <button type="button" aria-label="Add to library" title="Add to library" disabled={uploading} className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border border-border bg-background text-foreground shadow-card transition-colors hover:bg-muted disabled:opacity-50">
                    {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" strokeWidth={1.75} />}
                  </button></DropdownMenuTrigger>
                  <DropdownMenuContent align="end"><DropdownMenuItem onClick={() => inputRef.current?.click()}><ShieldCheck />Upload using account default</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => { inputRef.current?.setAttribute("data-provider", "s3"); inputRef.current?.click(); }}><Upload />Upload privately to S3</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => { inputRef.current?.setAttribute("data-provider", "ipfs"); inputRef.current?.click(); }}><Link2 />Publish to IPFS</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
              </div>
            </header>

            <div className="flex flex-wrap items-center justify-between gap-3 py-4">
              <div className="flex flex-wrap items-center gap-1 rounded-lg bg-stone-100 p-1">
                {tabs.map(([id, label, Icon]) => <button key={id} onClick={() => setView(id)} className={cn("flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm", view === id ? "bg-white font-medium shadow-sm" : "text-stone-500 hover:text-stone-900")}><Icon className="h-4 w-4" />{label}</button>)}
              </div>
              <div className="flex items-center gap-1">
                <DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline" size="sm"><Filter className="mr-1.5 h-4 w-4" />{source === "all" ? "Any source" : source.replace("_", " ")}</Button></DropdownMenuTrigger>
                  <DropdownMenuContent align="end">{["all", "upload", "agent_generated", "code_project"].map((value) => <DropdownMenuItem key={value} onClick={() => setSource(value)}>{value === "all" ? "Any source" : value.replace("_", " ")}</DropdownMenuItem>)}</DropdownMenuContent></DropdownMenu>
                <Button variant={favorites ? "secondary" : "ghost"} size="icon" onClick={() => setFavorites((v) => !v)} title="Favorites"><Heart className={cn("h-4 w-4", favorites && "fill-current")} /></Button>
                <Button variant={groupByChat ? "secondary" : "ghost"} size="sm" onClick={() => setGroupByChat((v) => !v)}>By chat</Button>
                <Button variant={layout === "grid" ? "secondary" : "ghost"} size="icon" onClick={() => setLayout("grid")}><Grid2X2 className="h-4 w-4" /></Button>
                <Button variant={layout === "list" ? "secondary" : "ghost"} size="icon" onClick={() => setLayout("list")}><LayoutList className="h-4 w-4" /></Button>
              </div>
            </div>

            {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
            {loading ? <div className="flex justify-center py-24"><Loader2 className="h-6 w-6 animate-spin text-stone-400" /></div> : items.length === 0 ?
              <div className="rounded-2xl border border-dashed border-stone-300 bg-white py-24 text-center"><LibraryBig className="mx-auto h-9 w-9 text-stone-300" /><p className="mt-3 font-medium">No artifacts here yet</p><p className="mt-1 text-sm text-stone-500">Upload a file or ask an agent to create one.</p></div> :
              <div className="space-y-9">{groups.map(([label, group]) => <section key={label}><div className="mb-3 flex items-center justify-between"><h2 className="text-sm font-semibold">{label}</h2><span className="text-xs text-stone-400">{group.length} item{group.length === 1 ? "" : "s"}</span></div>
                <div className={cn(layout === "grid" ? "grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4" : "divide-y divide-stone-200 overflow-hidden rounded-xl border border-stone-200 bg-white")}>
                  {group.map((item) => <Artifact key={item.itemId} item={item} layout={layout} onDownload={() => download(item)} onFavorite={() => mutate(item.itemId, "PATCH", { isFavorite: !item.isFavorite })} onShare={() => shareLink(item)} onAccess={() => openAccess(item)} onDelete={() => window.confirm(`Delete ${item.name}?`) && mutate(item.itemId, "DELETE")} />)}
                </div></section>)}</div>}
          </div>
        </main>
      </div>

      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}><DialogContent>
        <DialogHeader><DialogTitle>Access to {selected?.name}</DialogTitle><DialogDescription>Private by default. Grant a specific agent, user, or workspace read access.</DialogDescription></DialogHeader>
        <div className="flex gap-2"><select value={grantType} onChange={(e) => setGrantType(e.target.value as typeof grantType)} className="rounded-md border bg-background px-2 text-sm"><option value="agent">Agent</option><option value="user">User</option><option value="workspace">Workspace</option></select><Input value={grantId} onChange={(e) => setGrantId(e.target.value)} placeholder={`${grantType} ID`} /><Button onClick={addGrant}>Grant</Button></div>
        <div className="space-y-2">{selected?.grants?.length ? selected.grants.map((grant) => <div key={grant.grantId} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"><span>{grant.subjectType}: <code>{grant.subjectId}</code></span><Badge variant="outline">{grant.permission}</Badge></div>) : <p className="text-sm text-stone-500">No explicit grants. Only you can access this item.</p>}</div>
        <p className="text-xs text-stone-500">Storage: {selected?.blobs?.[0]?.storageProvider === "ipfs" ? "IPFS · publicly addressable" : "Private S3 · signed links only"}</p>
      </DialogContent></Dialog>
    </div>
  );
}

function Artifact({ item, layout, onDownload, onFavorite, onShare, onAccess, onDelete }: { item: LibraryItem; layout: "grid" | "list"; onDownload(): void; onFavorite(): void; onShare(): void; onAccess(): void; onDelete(): void }) {
  const Icon = item.kind === "image" ? FileImage : item.kind === "app" ? AppWindow : item.kind === "code" ? FileCode2 : item.kind === "archive" ? FileArchive : item.kind === "pdf" || item.kind === "document" ? FileText : File;
  const menu = <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onClick={onDownload}><Download />Open or download</DropdownMenuItem><DropdownMenuItem onClick={onFavorite}><Heart />{item.isFavorite ? "Remove favorite" : "Favorite"}</DropdownMenuItem><DropdownMenuItem onClick={onAccess}><ShieldCheck />Manage access</DropdownMenuItem><DropdownMenuItem onClick={onShare}><Share2 />Copy 7-day link</DropdownMenuItem><DropdownMenuItem className="text-red-600" onClick={onDelete}><Trash2 />Delete</DropdownMenuItem></DropdownMenuContent></DropdownMenu>;
  if (layout === "list") return <div className="flex items-center gap-3 px-4 py-3"><div className="flex h-9 w-9 items-center justify-center rounded-lg bg-stone-100"><Icon className="h-4 w-4" /></div><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{item.name}</p><p className="text-xs text-stone-500">{prettyBytes(item.sizeBytes)} · {item.kind} · {new Date(item.updatedAt).toLocaleDateString()}</p></div>{item.visibility === "shared" && <Badge variant="outline">Shared</Badge>}{menu}</div>;
  return <article className="group overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"><button onClick={onDownload} className="block h-44 w-full overflow-hidden bg-stone-100 text-left">{item.previewUrl ? <img src={item.previewUrl} alt="" className="h-full w-full object-cover" /> : item.textPreview ? <div className="h-full overflow-hidden whitespace-pre-wrap p-4 text-xs leading-5 text-stone-600 [mask-image:linear-gradient(to_bottom,black_70%,transparent)]">{item.textPreview}</div> : <div className="flex h-full items-center justify-center"><Icon className="h-10 w-10 text-stone-300" /></div>}</button><div className="p-3"><div className="flex items-start gap-2"><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{item.name}</p><p className="mt-1 text-xs text-stone-500">{item.kind.toUpperCase()} · {prettyBytes(item.sizeBytes)}</p></div>{item.isFavorite && <Heart className="mt-1 h-3.5 w-3.5 fill-stone-800" />}{menu}</div></div></article>;
}

function prettyBytes(bytes: number) { if (!bytes) return "0 B"; const units = ["B", "KB", "MB", "GB"]; const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1); return `${(bytes / 1024 ** index).toFixed(index ? 1 : 0)} ${units[index]}`; }

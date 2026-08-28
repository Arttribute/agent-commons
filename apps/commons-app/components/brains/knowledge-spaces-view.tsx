"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  BookOpen,
  Bot,
  Check,
  ChevronDown,
  ChevronRight,
  Clock3,
  FilePlus2,
  FileText,
  Folder,
  FolderInput,
  FolderPlus,
  FolderSync,
  Link2,
  Loader2,
  MoreHorizontal,
  Network,
  PanelRightClose,
  PanelRightOpen,
  Plus,
  Search,
  Share2,
  Tags,
  Trash2,
} from "lucide-react";
import { DashboardSideBar } from "@/components/layout/dashboard-side-bar";
import { PageTitle } from "@/components/layout/page-header";
import { CreditsMenu } from "@/components/billing/credits-menu";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAuth } from "@/context/AuthContext";
import { useAgents } from "@/hooks/agents/use-agents";
import { cn } from "@/lib/utils";
import { normalizePrincipalId } from "@/lib/principal-id";
import {
  chooseMarkdownFolder,
  hasConnectedFolder,
  removeConnectedNote,
  reconnectMarkdownFolder,
  rememberMarkdownFolder,
  writeConnectedNote,
} from "./browser-folder";
import { CreateSpaceDialog } from "./create-space-dialog";
import { SpaceAccessDialog } from "./space-access-dialog";
import type {
  KnowledgeDocument,
  KnowledgeGraph,
  KnowledgeSearchResult,
  KnowledgeSpace,
} from "./types";

const KnowledgeGraphView = dynamic(
  () => import("./knowledge-graph").then((module) => module.KnowledgeGraphView),
  {
    ssr: false,
    loading: () => (
      <div className="grid h-full place-items-center rounded-xl border bg-stone-50 text-sm text-muted-foreground">
        <Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> Loading graph
      </div>
    ),
  },
);

type EditorMode = "edit" | "preview";
type SaveState = "idle" | "saving" | "saved" | "error";

export function KnowledgeSpacesView() {
  const { authState } = useAuth();
  const userAddress = normalizePrincipalId(authState.walletAddress);
  const { agents } = useAgents(userAddress);
  const [spaces, setSpaces] = useState<KnowledgeSpace[]>([]);
  const [spaceId, setSpaceId] = useState("");
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);
  const [documentId, setDocumentId] = useState("");
  const [document, setDocument] = useState<KnowledgeDocument | null>(null);
  const [graph, setGraph] = useState<KnowledgeGraph>({ nodes: [], edges: [] });
  const [view, setView] = useState<"notes" | "graph">("notes");
  const [editorMode, setEditorMode] = useState<EditorMode>("edit");
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [draft, setDraft] = useState("");
  const [draftTitle, setDraftTitle] = useState("");
  const [draftPath, setDraftPath] = useState("");
  const draftRef = useRef({ content: "", title: "", path: "" });
  const [dirty, setDirty] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [loading, setLoading] = useState(true);
  const [documentsLoading, setDocumentsLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [createSpaceOpen, setCreateSpaceOpen] = useState(false);
  const [accessOpen, setAccessOpen] = useState(false);
  const [newNoteOpen, setNewNoteOpen] = useState(false);
  const [newNoteKind, setNewNoteKind] = useState<"note" | "project">("note");
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<KnowledgeSearchResult[]>(
    [],
  );
  const [searching, setSearching] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const activeSpace = spaces.find((space) => space.spaceId === spaceId) || null;
  const canWrite =
    activeSpace?.permission === "write" || activeSpace?.permission === "manage";
  const canManage = activeSpace?.permission === "manage";

  const loadSpaces = useCallback(async () => {
    const response = await fetch("/api/knowledge", { cache: "no-store" });
    const payload = await response.json();
    if (!response.ok)
      throw new Error(apiMessage(payload, "Could not load knowledge"));
    const next = Array.isArray(payload.data) ? payload.data : [];
    setSpaces(next);
    setSpaceId((current) =>
      next.some((space: KnowledgeSpace) => space.spaceId === current)
        ? current
        : next.find((space: KnowledgeSpace) => space.isDefault)?.spaceId ||
          next[0]?.spaceId ||
          "",
    );
    return next as KnowledgeSpace[];
  }, []);

  useEffect(() => {
    if (!userAddress) return;
    setLoading(true);
    loadSpaces()
      .catch((cause) =>
        setError(
          cause instanceof Error ? cause.message : "Could not load knowledge",
        ),
      )
      .finally(() => setLoading(false));
  }, [loadSpaces, userAddress]);

  const loadDocuments = useCallback(async (nextSpaceId: string) => {
    if (!nextSpaceId) return;
    setDocumentsLoading(true);
    try {
      const response = await fetch(`/api/knowledge/${nextSpaceId}/documents`, {
        cache: "no-store",
      });
      const payload = await response.json();
      if (!response.ok)
        throw new Error(apiMessage(payload, "Could not load notes"));
      const next = Array.isArray(payload.data) ? payload.data : [];
      setDocuments(next);
      setDocumentId((current) =>
        next.some((item: KnowledgeDocument) => item.documentId === current)
          ? current
          : next[0]?.documentId || "",
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load notes");
    } finally {
      setDocumentsLoading(false);
    }
  }, []);

  const loadGraph = useCallback(async (nextSpaceId: string) => {
    if (!nextSpaceId) return;
    const response = await fetch(`/api/knowledge/${nextSpaceId}/graph`, {
      cache: "no-store",
    });
    const payload = await response.json();
    if (response.ok) setGraph(payload.data || { nodes: [], edges: [] });
  }, []);

  useEffect(() => {
    setDocument(null);
    setDocumentId("");
    setDocuments([]);
    if (spaceId) {
      void loadDocuments(spaceId);
      void loadGraph(spaceId);
    }
  }, [loadDocuments, loadGraph, spaceId]);

  useEffect(() => {
    if (!spaceId || !documentId) {
      setDocument(null);
      return;
    }
    let cancelled = false;
    fetch(`/api/knowledge/${spaceId}/documents/${documentId}`, {
      cache: "no-store",
    })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok)
          throw new Error(apiMessage(payload, "Could not open note"));
        if (cancelled) return;
        const next = payload.data as KnowledgeDocument;
        setDocument(next);
        setDraft(next.content || "");
        setDraftTitle(next.title);
        setDraftPath(next.path);
        draftRef.current = {
          content: next.content || "",
          title: next.title,
          path: next.path,
        };
        setDirty(false);
        setSaveState("idle");
      })
      .catch(
        (cause) =>
          !cancelled &&
          setError(
            cause instanceof Error ? cause.message : "Could not open note",
          ),
      );
    return () => {
      cancelled = true;
    };
  }, [documentId, spaceId]);

  const saveDocument = useCallback(async () => {
    if (!document || !activeSpace || !canWrite || !dirty) return;
    const captured = { ...draftRef.current };
    setSaveState("saving");
    setError("");
    try {
      const response = await fetch(
        `/api/knowledge/${activeSpace.spaceId}/documents/${document.documentId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            path: captured.path,
            title: captured.title,
            content: captured.content,
            expectedRevision: document.revision,
            providerRevision:
              activeSpace.provider === "browser_filesystem"
                ? new Date().toISOString()
                : undefined,
          }),
        },
      );
      const payload = await response.json();
      if (!response.ok)
        throw new Error(apiMessage(payload, "Could not save note"));
      const saved = payload.data as KnowledgeDocument;
      setDocument(saved);
      setDocuments((items) =>
        items
          .map((item) =>
            item.documentId === saved.documentId
              ? { ...item, ...saved, content: undefined }
              : item,
          )
          .sort((left, right) => left.path.localeCompare(right.path)),
      );
      if (activeSpace.provider === "browser_filesystem") {
        await writeConnectedNote(
          activeSpace.spaceId,
          saved.path,
          captured.content,
        );
        if (document.path !== saved.path) {
          await removeConnectedNote(activeSpace.spaceId, document.path).catch(
            () => false,
          );
        }
      }
      const unchanged =
        draftRef.current.content === captured.content &&
        draftRef.current.title === captured.title &&
        draftRef.current.path === captured.path;
      if (unchanged) setDirty(false);
      setSaveState("saved");
      void loadGraph(activeSpace.spaceId);
    } catch (cause) {
      setSaveState("error");
      setError(cause instanceof Error ? cause.message : "Could not save note");
    }
  }, [activeSpace, canWrite, dirty, document, loadGraph]);

  useEffect(() => {
    if (!dirty) return;
    const timer = window.setTimeout(() => void saveDocument(), 900);
    return () => window.clearTimeout(timer);
  }, [dirty, draft, draftPath, draftTitle, saveDocument]);

  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void saveDocument();
      }
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, [saveDocument]);

  useEffect(() => {
    const query = search.trim();
    if (query.length < 2) {
      setSearchResults([]);
      return;
    }
    const timer = window.setTimeout(async () => {
      setSearching(true);
      try {
        const params = new URLSearchParams({ query, limit: "8" });
        if (spaceId) params.set("spaceIds", spaceId);
        const response = await fetch(`/api/knowledge/search?${params}`, {
          cache: "no-store",
        });
        const payload = await response.json();
        setSearchResults(response.ok ? payload.data?.results || [] : []);
      } finally {
        setSearching(false);
      }
    }, 240);
    return () => window.clearTimeout(timer);
  }, [search, spaceId]);

  function updateDraft(kind: "content" | "title" | "path", value: string) {
    draftRef.current = { ...draftRef.current, [kind]: value };
    if (kind === "content") setDraft(value);
    if (kind === "title") setDraftTitle(value);
    if (kind === "path") setDraftPath(value);
    setDirty(true);
  }

  async function createNote(input: { path: string; title: string }) {
    if (!activeSpace) return;
    const content = `---\ntype: Note\ntitle: ${JSON.stringify(input.title)}\nstatus: draft\n---\n\n# ${input.title}\n\n`;
    const response = await fetch(
      `/api/knowledge/${activeSpace.spaceId}/documents`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...input,
          content,
          providerRevision:
            activeSpace.provider === "browser_filesystem"
              ? new Date().toISOString()
              : undefined,
        }),
      },
    );
    const payload = await response.json();
    if (!response.ok)
      throw new Error(apiMessage(payload, "Could not create note"));
    const created = payload.data as KnowledgeDocument;
    if (activeSpace.provider === "browser_filesystem") {
      await writeConnectedNote(activeSpace.spaceId, created.path, content);
    }
    await Promise.all([
      loadDocuments(activeSpace.spaceId),
      loadGraph(activeSpace.spaceId),
      loadSpaces(),
    ]);
    setDocumentId(created.documentId);
    setNewNoteOpen(false);
  }

  async function removeDocument() {
    if (!document || !activeSpace) return;
    if (
      !window.confirm(
        `Delete “${document.title}”? Its revision history remains in provenance.`,
      )
    )
      return;
    let removedLocal = false;
    if (activeSpace.provider === "browser_filesystem") {
      if (!hasConnectedFolder(activeSpace.spaceId)) {
        setError("Reconnect this folder before deleting its source file.");
        return;
      }
      removedLocal = await removeConnectedNote(
        activeSpace.spaceId,
        document.path,
      );
    }
    const response = await fetch(
      `/api/knowledge/${activeSpace.spaceId}/documents/${document.documentId}`,
      { method: "DELETE" },
    );
    if (!response.ok) {
      if (removedLocal) {
        await writeConnectedNote(
          activeSpace.spaceId,
          document.path,
          document.content || draft,
        ).catch(() => false);
      }
      return setError("Could not delete note");
    }
    setDocument(null);
    await Promise.all([
      loadDocuments(activeSpace.spaceId),
      loadGraph(activeSpace.spaceId),
      loadSpaces(),
    ]);
  }

  async function importOrReconnect() {
    if (!activeSpace) return;
    setSyncing(true);
    setError("");
    setNotice("");
    try {
      const selected =
        activeSpace.provider === "browser_filesystem"
          ? await reconnectMarkdownFolder(activeSpace.spaceId)
          : await chooseMarkdownFolder();
      if (activeSpace.provider === "browser_filesystem") {
        rememberMarkdownFolder(activeSpace.spaceId, selected.handle);
      }
      const response = await fetch(
        `/api/knowledge/${activeSpace.spaceId}/import`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ documents: selected.documents }),
        },
      );
      const payload = await response.json();
      if (!response.ok)
        throw new Error(apiMessage(payload, "Could not import folder"));
      const result = payload.data;
      setNotice(
        `Folder synced: ${result.created} created, ${result.updated} updated, ${result.unchanged} unchanged${result.remoteKept ? `, ${result.remoteKept} newer agent edits kept` : ""}${result.failed?.length ? `, ${result.failed.length} conflicts need review` : ""}.`,
      );
      await Promise.all([
        loadDocuments(activeSpace.spaceId),
        loadGraph(activeSpace.spaceId),
        loadSpaces(),
      ]);
    } catch (cause) {
      if (!(cause instanceof DOMException && cause.name === "AbortError")) {
        setError(
          cause instanceof Error ? cause.message : "Could not import folder",
        );
      }
    } finally {
      setSyncing(false);
    }
  }

  async function selectSearchResult(result: KnowledgeSearchResult) {
    setSearch("");
    setSearchResults([]);
    if (result.spaceId !== spaceId) setSpaceId(result.spaceId);
    setDocumentId(result.documentId);
    setView("notes");
  }

  const preview = useMemo(() => markdownWithWikiLinks(draft), [draft]);
  const tree = useMemo(() => buildTree(documents), [documents]);

  return (
    <div className="h-screen overflow-hidden bg-page text-stone-950">
      <div className="flex h-screen">
        <DashboardSideBar username={userAddress} />
        <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <header className="flex h-[74px] shrink-0 items-center justify-between border-b bg-white px-6">
            <div className="min-w-0">
              <PageTitle title="Knowledge" />
              <p className="mt-1.5 truncate text-sm text-muted-foreground">
                Connected context for you and your agents.
              </p>
            </div>
            <div className="flex items-center gap-2.5">
              <div className="relative hidden w-[300px] lg:block">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-stone-400" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search this space"
                  className="h-9 bg-white pl-9 pr-9"
                />
                {searching && (
                  <Loader2 className="absolute right-3 top-2.5 h-4 w-4 animate-spin text-stone-400" />
                )}
                {search.trim().length >= 2 && (
                  <SearchResults
                    results={searchResults}
                    spaces={spaces}
                    onSelect={selectSearchResult}
                  />
                )}
              </div>
              <CreditsMenu />
              {canManage && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setAccessOpen(true)}
                >
                  <Share2 className="mr-1.5 h-4 w-4" /> Share
                </Button>
              )}
              <Button size="sm" onClick={() => setCreateSpaceOpen(true)}>
                <Plus className="mr-1.5 h-4 w-4" /> New space
              </Button>
            </div>
          </header>

          {(error || notice) && (
            <div
              className={cn(
                "flex shrink-0 items-center justify-between border-b px-6 py-2 text-xs",
                error
                  ? "border-red-100 bg-red-50 text-red-700"
                  : "border-teal-100 bg-teal-50 text-teal-800",
              )}
            >
              <span>{error || notice}</span>
              <button
                onClick={() => {
                  setError("");
                  setNotice("");
                }}
                aria-label="Dismiss"
              >
                ×
              </button>
            </div>
          )}

          <div className="flex min-h-0 flex-1">
            <aside className="flex w-[268px] shrink-0 flex-col border-r bg-white">
              <div className="border-b p-3">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="flex h-10 w-full items-center gap-2 rounded-lg px-2 text-left hover:bg-stone-50">
                      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-teal-100 text-teal-800">
                        <Network className="h-3.5 w-3.5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">
                          {activeSpace?.name || "Knowledge Spaces"}
                        </span>
                        <span className="block truncate text-[11px] text-muted-foreground">
                          {activeSpace
                            ? `${activeSpace.counts?.documents || 0} notes · ${activeSpace.provider === "native" ? "Commons native" : "Connected folder"}`
                            : "Select a space"}
                        </span>
                      </span>
                      <ChevronDown className="h-4 w-4 text-stone-400" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-[242px]">
                    {spaces.map((space) => (
                      <DropdownMenuItem
                        key={space.spaceId}
                        onClick={() => setSpaceId(space.spaceId)}
                        className="gap-2"
                      >
                        <span className="h-2 w-2 rounded-full bg-teal-400" />
                        <span className="min-w-0 flex-1 truncate">
                          {space.name}
                        </span>
                        {space.spaceId === spaceId && (
                          <Check className="h-3.5 w-3.5" />
                        )}
                      </DropdownMenuItem>
                    ))}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => setCreateSpaceOpen(true)}>
                      <Plus className="h-4 w-4" /> Create Knowledge Space
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              <div className="flex items-center justify-between px-3 pb-2 pt-3">
                <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  Notes
                </span>
                <div className="flex items-center gap-0.5">
                  <button
                    onClick={() => {
                      setNewNoteKind("project");
                      setNewNoteOpen(true);
                    }}
                    disabled={!canWrite}
                    className="rounded p-1 text-stone-500 hover:bg-stone-100 disabled:opacity-40"
                    title="New project folder"
                  >
                    <FolderPlus className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => {
                      setNewNoteKind("note");
                      setNewNoteOpen(true);
                    }}
                    disabled={!canWrite}
                    className="rounded p-1 text-stone-500 hover:bg-stone-100 disabled:opacity-40"
                    title="New note"
                  >
                    <FilePlus2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              <ScrollArea className="min-h-0 flex-1 px-2">
                {documentsLoading ? (
                  <div className="space-y-2 px-2 py-2">
                    {[0, 1, 2, 3].map((item) => (
                      <div
                        key={item}
                        className="h-7 animate-pulse rounded bg-stone-100"
                      />
                    ))}
                  </div>
                ) : (
                  <DocumentTree
                    tree={tree}
                    selectedId={documentId}
                    onSelect={(id) => {
                      setDocumentId(id);
                      setView("notes");
                    }}
                  />
                )}
              </ScrollArea>
              <div className="border-t p-2">
                <button
                  onClick={importOrReconnect}
                  disabled={!activeSpace || !canWrite || syncing}
                  className="flex h-9 w-full items-center gap-2 rounded-md px-2 text-xs text-muted-foreground hover:bg-stone-50 hover:text-foreground disabled:opacity-45"
                >
                  {syncing ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : activeSpace?.provider === "browser_filesystem" ? (
                    <FolderSync className="h-3.5 w-3.5" />
                  ) : (
                    <FolderInput className="h-3.5 w-3.5" />
                  )}
                  {activeSpace?.provider === "browser_filesystem"
                    ? hasConnectedFolder(activeSpace.spaceId)
                      ? "Sync connected folder"
                      : "Reconnect folder"
                    : "Import Markdown folder"}
                </button>
              </div>
            </aside>

            <section className="flex min-w-0 flex-1 flex-col bg-white">
              <div className="flex h-12 shrink-0 items-center justify-between border-b px-4">
                <div className="flex rounded-lg bg-stone-100 p-1">
                  <button
                    onClick={() => setView("notes")}
                    className={cn(
                      "flex items-center gap-1.5 rounded-md px-3 py-1 text-xs",
                      view === "notes"
                        ? "bg-white font-medium shadow-sm"
                        : "text-muted-foreground",
                    )}
                  >
                    <BookOpen className="h-3.5 w-3.5" /> Notes
                  </button>
                  <button
                    onClick={() => {
                      setView("graph");
                      if (spaceId) void loadGraph(spaceId);
                    }}
                    className={cn(
                      "flex items-center gap-1.5 rounded-md px-3 py-1 text-xs",
                      view === "graph"
                        ? "bg-white font-medium shadow-sm"
                        : "text-muted-foreground",
                    )}
                  >
                    <Network className="h-3.5 w-3.5" /> Graph
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  {view === "notes" && document && (
                    <SaveIndicator state={saveState} dirty={dirty} />
                  )}
                  <button
                    onClick={() => setInspectorOpen((open) => !open)}
                    className="rounded-md p-1.5 text-stone-500 hover:bg-stone-100"
                    title={inspectorOpen ? "Hide details" : "Show details"}
                  >
                    {inspectorOpen ? (
                      <PanelRightClose className="h-4 w-4" />
                    ) : (
                      <PanelRightOpen className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>

              <div className="flex min-h-0 flex-1">
                <div className="min-w-0 flex-1 overflow-hidden p-4 lg:p-5">
                  {loading ? (
                    <div className="grid h-full place-items-center">
                      <Loader2 className="h-5 w-5 animate-spin text-stone-400" />
                    </div>
                  ) : view === "graph" ? (
                    <KnowledgeGraphView
                      graph={graph}
                      selectedId={documentId}
                      onSelect={(id) => {
                        setDocumentId(id);
                        setView("notes");
                      }}
                    />
                  ) : document ? (
                    <div className="mx-auto flex h-full max-w-4xl flex-col">
                      <div className="flex shrink-0 items-start justify-between gap-4 border-b pb-4">
                        <div className="min-w-0 flex-1">
                          <input
                            value={draftTitle}
                            onChange={(event) =>
                              updateDraft("title", event.target.value)
                            }
                            disabled={!canWrite}
                            className="w-full bg-transparent text-2xl font-semibold tracking-tight outline-none placeholder:text-stone-300 disabled:text-stone-900"
                            placeholder="Untitled note"
                          />
                          <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                            <FileText className="h-3.5 w-3.5" />
                            <input
                              value={draftPath}
                              onChange={(event) =>
                                updateDraft("path", event.target.value)
                              }
                              disabled={!canWrite}
                              className="min-w-0 flex-1 bg-transparent font-mono text-[11px] outline-none disabled:text-muted-foreground"
                            />
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <div className="mr-1 flex rounded-md bg-stone-100 p-0.5">
                            <button
                              onClick={() => setEditorMode("edit")}
                              className={cn(
                                "rounded px-2 py-1 text-[11px]",
                                editorMode === "edit"
                                  ? "bg-white font-medium shadow-sm"
                                  : "text-muted-foreground",
                              )}
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => setEditorMode("preview")}
                              className={cn(
                                "rounded px-2 py-1 text-[11px]",
                                editorMode === "preview"
                                  ? "bg-white font-medium shadow-sm"
                                  : "text-muted-foreground",
                              )}
                            >
                              Preview
                            </button>
                          </div>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button className="rounded-md p-1.5 text-stone-500 hover:bg-stone-100">
                                <MoreHorizontal className="h-4 w-4" />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                onClick={() =>
                                  navigator.clipboard.writeText(draft)
                                }
                              >
                                <Link2 className="h-4 w-4" /> Copy Markdown
                              </DropdownMenuItem>
                              {canWrite && (
                                <>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    className="text-red-600"
                                    onClick={removeDocument}
                                  >
                                    <Trash2 className="h-4 w-4" /> Delete note
                                  </DropdownMenuItem>
                                </>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                      {editorMode === "edit" ? (
                        <textarea
                          value={draft}
                          onChange={(event) =>
                            updateDraft("content", event.target.value)
                          }
                          readOnly={!canWrite}
                          spellCheck
                          className="min-h-0 flex-1 resize-none bg-transparent py-5 font-mono text-[13px] leading-7 text-stone-800 outline-none placeholder:text-stone-300"
                          placeholder="Write in Markdown. Connect notes with [[double brackets]]."
                        />
                      ) : (
                        <ScrollArea className="min-h-0 flex-1 py-5">
                          <article className="prose prose-stone max-w-none prose-headings:tracking-tight prose-a:text-teal-700">
                            <ReactMarkdown
                              remarkPlugins={[remarkGfm]}
                              components={{
                                a: ({ href, children, ...props }) =>
                                  href?.startsWith("brain:") ? (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        openWikiLink(
                                          href.slice(6),
                                          documents,
                                          setDocumentId,
                                        )
                                      }
                                      className="font-medium text-teal-700 underline decoration-teal-300 underline-offset-2"
                                    >
                                      {children}
                                    </button>
                                  ) : (
                                    <a
                                      href={href}
                                      target="_blank"
                                      rel="noreferrer"
                                      {...props}
                                    >
                                      {children}
                                    </a>
                                  ),
                              }}
                            >
                              {preview}
                            </ReactMarkdown>
                          </article>
                        </ScrollArea>
                      )}
                    </div>
                  ) : (
                    <EmptyNotes
                      canWrite={Boolean(canWrite)}
                      onCreate={() => {
                        setNewNoteKind("note");
                        setNewNoteOpen(true);
                      }}
                    />
                  )}
                </div>

                {inspectorOpen && (
                  <Inspector
                    space={activeSpace}
                    document={document}
                    graph={graph}
                    view={view}
                    documents={documents}
                    onSelect={(id) => {
                      setDocumentId(id);
                      setView("notes");
                    }}
                    onAccess={() => setAccessOpen(true)}
                  />
                )}
              </div>
            </section>
          </div>
        </main>
      </div>

      <CreateSpaceDialog
        open={createSpaceOpen}
        onOpenChange={setCreateSpaceOpen}
        onCreated={async (space) => {
          await loadSpaces();
          setSpaceId(space.spaceId);
        }}
      />
      <SpaceAccessDialog
        open={accessOpen}
        onOpenChange={setAccessOpen}
        space={activeSpace}
        agents={agents}
        onChanged={async () => {
          await loadSpaces();
        }}
      />
      <NewNoteDialog
        open={newNoteOpen}
        kind={newNoteKind}
        onOpenChange={setNewNoteOpen}
        onCreate={createNote}
      />
    </div>
  );
}

type TreeNode = {
  folders: Map<string, TreeNode>;
  documents: KnowledgeDocument[];
};

function buildTree(documents: KnowledgeDocument[]) {
  const root: TreeNode = { folders: new Map(), documents: [] };
  for (const document of documents) {
    const parts = document.path.split("/");
    parts.pop();
    let node = root;
    for (const part of parts) {
      if (!node.folders.has(part))
        node.folders.set(part, { folders: new Map(), documents: [] });
      node = node.folders.get(part)!;
    }
    node.documents.push(document);
  }
  return root;
}

function DocumentTree({
  tree,
  selectedId,
  onSelect,
}: {
  tree: TreeNode;
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <TreeLevel
      tree={tree}
      depth={0}
      selectedId={selectedId}
      onSelect={onSelect}
    />
  );
}

function TreeLevel({
  tree,
  depth,
  selectedId,
  onSelect,
}: {
  tree: TreeNode;
  depth: number;
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const folders = [...tree.folders.entries()].sort(([left], [right]) =>
    left.localeCompare(right),
  );
  const docs = [...tree.documents].sort((left, right) =>
    left.title.localeCompare(right.title),
  );
  return (
    <div className="space-y-0.5 pb-3">
      {folders.map(([name, child]) => {
        const closed = collapsed.has(name);
        return (
          <div key={name}>
            <button
              type="button"
              onClick={() =>
                setCollapsed((current) => {
                  const next = new Set(current);
                  closed ? next.delete(name) : next.add(name);
                  return next;
                })
              }
              className="flex h-7 w-full items-center gap-1 rounded px-1.5 text-left text-xs text-stone-600 hover:bg-stone-50"
              style={{ paddingLeft: 6 + depth * 14 }}
            >
              {closed ? (
                <ChevronRight className="h-3 w-3" />
              ) : (
                <ChevronDown className="h-3 w-3" />
              )}
              <Folder className="h-3.5 w-3.5 fill-stone-100 text-stone-500" />
              <span className="truncate">{name}</span>
            </button>
            {!closed && (
              <TreeLevel
                tree={child}
                depth={depth + 1}
                selectedId={selectedId}
                onSelect={onSelect}
              />
            )}
          </div>
        );
      })}
      {docs.map((document) => (
        <button
          key={document.documentId}
          type="button"
          onClick={() => onSelect(document.documentId)}
          className={cn(
            "flex h-7 w-full items-center gap-1.5 rounded px-2 text-left text-xs hover:bg-stone-50",
            document.documentId === selectedId
              ? "bg-teal-50 font-medium text-teal-900"
              : "text-stone-600",
          )}
          style={{ paddingLeft: 21 + depth * 14 }}
        >
          <FileText className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{document.title}</span>
        </button>
      ))}
    </div>
  );
}

function Inspector({
  space,
  document,
  graph,
  view,
  documents,
  onSelect,
  onAccess,
}: {
  space: KnowledgeSpace | null;
  document: KnowledgeDocument | null;
  graph: KnowledgeGraph;
  view: "notes" | "graph";
  documents: KnowledgeDocument[];
  onSelect: (id: string) => void;
  onAccess: () => void;
}) {
  const selectedNode = graph.nodes.find(
    (node) => node.id === document?.documentId,
  );
  return (
    <aside className="hidden w-[286px] shrink-0 border-l bg-stone-50/40 xl:flex xl:flex-col">
      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-6 p-4">
          {view === "graph" ? (
            <>
              <InspectorHeading icon={Network} title="Graph overview" />
              <div className="grid grid-cols-2 gap-2">
                <Stat value={graph.nodes.length} label="Notes" />
                <Stat
                  value={graph.edges.filter((edge) => edge.resolved).length}
                  label="Links"
                />
              </div>
              {selectedNode && (
                <div className="rounded-lg border bg-white p-3">
                  <p className="truncate text-sm font-medium">
                    {selectedNode.title}
                  </p>
                  <p className="mt-1 truncate text-[11px] text-muted-foreground">
                    {selectedNode.path}
                  </p>
                  <p className="mt-3 text-xs text-muted-foreground">
                    {selectedNode.degree} connected links
                  </p>
                </div>
              )}
              <div>
                <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  How retrieval works
                </p>
                <p className="text-xs leading-5 text-muted-foreground">
                  Commons combines meaning, exact language, headings, and nearby
                  graph connections—then records what was retrieved in
                  provenance.
                </p>
              </div>
            </>
          ) : document ? (
            <>
              <div>
                <InspectorHeading
                  icon={Link2}
                  title="Linked from"
                  count={document.backlinks?.length || 0}
                />
                <LinkList
                  links={document.backlinks || []}
                  onSelect={onSelect}
                  empty="No backlinks yet"
                />
              </div>
              <div>
                <InspectorHeading
                  icon={Network}
                  title="Links to"
                  count={document.outgoing?.length || 0}
                />
                <LinkList
                  links={document.outgoing || []}
                  onSelect={onSelect}
                  empty="No outgoing links"
                />
              </div>
              <div>
                <InspectorHeading icon={Tags} title="Tags" />
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {document.tags?.map((tag) => (
                    <Badge
                      key={tag}
                      variant="secondary"
                      className="font-normal"
                    >
                      #{tag}
                    </Badge>
                  ))}
                  {!document.tags?.length && (
                    <span className="text-xs text-muted-foreground">
                      No tags
                    </span>
                  )}
                </div>
              </div>
              <div>
                <InspectorHeading icon={BookOpen} title="Knowledge format" />
                <div className="mt-2 rounded-lg border bg-white p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-xs font-medium">
                      {document.okf?.type ||
                        (document.okf?.kind === "index"
                          ? "Directory index"
                          : document.okf?.kind === "log"
                            ? "Update log"
                            : "Markdown note")}
                    </p>
                    <Badge
                      variant="secondary"
                      className={cn(
                        "shrink-0 font-normal",
                        document.okf?.conformant && "bg-teal-50 text-teal-800",
                      )}
                    >
                      {document.okf?.conformant ? "OKF 0.2" : "Markdown"}
                    </Badge>
                  </div>
                  {document.okf && (
                    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                      <span>{formatTrustTier(document.okf.trustTier)}</span>
                      <span>{document.okf.status || "stable"}</span>
                      {document.okf.sourceCount > 0 && (
                        <span>
                          {document.okf.sourceCount} source
                          {document.okf.sourceCount === 1 ? "" : "s"}
                        </span>
                      )}
                      {document.okf.isStale && (
                        <span className="text-amber-700">stale</span>
                      )}
                    </div>
                  )}
                  {document.okf && !document.okf.conformant && (
                    <p className="mt-2 text-[11px] leading-4 text-amber-700">
                      {document.okf.issues[0]}
                    </p>
                  )}
                </div>
              </div>
              <div>
                <InspectorHeading icon={Clock3} title="Details" />
                <dl className="mt-2 space-y-2 text-xs">
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">Revision</dt>
                    <dd>{document.revision}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">Updated</dt>
                    <dd>{relativeDate(document.updatedAt)}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">Format</dt>
                    <dd>{document.okf?.conformant ? "OKF 0.2" : "Markdown"}</dd>
                  </div>
                </dl>
              </div>
            </>
          ) : (
            <p className="text-xs leading-5 text-muted-foreground">
              Select a note to see its backlinks, tags, and revision details.
            </p>
          )}
        </div>
      </ScrollArea>
      {space && (
        <div className="border-t p-3">
          <button
            onClick={onAccess}
            disabled={space.permission !== "manage"}
            className="flex h-9 w-full items-center gap-2 rounded-md px-2 text-xs text-muted-foreground hover:bg-white hover:text-foreground disabled:opacity-50"
          >
            <Bot className="h-3.5 w-3.5" /> Agent access
            <ChevronRight className="ml-auto h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </aside>
  );
}

function InspectorHeading({
  icon: Icon,
  title,
  count,
}: {
  icon: typeof Link2;
  title: string;
  count?: number;
}) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="h-3.5 w-3.5 text-stone-500" />
      <p className="text-xs font-medium">{title}</p>
      {count !== undefined && (
        <span className="ml-auto text-[11px] text-muted-foreground">
          {count}
        </span>
      )}
    </div>
  );
}

function LinkList({
  links,
  onSelect,
  empty,
}: {
  links: NonNullable<KnowledgeDocument["backlinks"]>;
  onSelect: (id: string) => void;
  empty: string;
}) {
  return (
    <div className="mt-2 space-y-1">
      {links.map((link) => (
        <button
          key={link.linkId}
          disabled={!link.documentId}
          onClick={() => link.documentId && onSelect(link.documentId)}
          className="block w-full truncate rounded-md px-2 py-1.5 text-left text-xs text-stone-600 hover:bg-white disabled:cursor-default"
        >
          {link.title || link.targetPath || "Unresolved note"}
        </button>
      ))}
      {!links.length && (
        <p className="px-2 py-1 text-xs text-muted-foreground">{empty}</p>
      )}
    </div>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="rounded-lg border bg-white p-3">
      <p className="text-lg font-semibold">{value}</p>
      <p className="text-[11px] text-muted-foreground">{label}</p>
    </div>
  );
}

function SaveIndicator({ state, dirty }: { state: SaveState; dirty: boolean }) {
  if (state === "saving")
    return (
      <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" /> Saving
      </span>
    );
  if (state === "error")
    return <span className="text-[11px] text-red-600">Save failed</span>;
  if (dirty)
    return <span className="text-[11px] text-muted-foreground">Unsaved</span>;
  return (
    <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
      <Check className="h-3 w-3 text-teal-700" /> Saved
    </span>
  );
}

function EmptyNotes({
  canWrite,
  onCreate,
}: {
  canWrite: boolean;
  onCreate: () => void;
}) {
  return (
    <div className="grid h-full place-items-center">
      <div className="max-w-sm text-center">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-xl border bg-stone-50">
          <FileText className="h-5 w-5 text-stone-500" />
        </span>
        <h2 className="mt-4 text-base font-medium">
          A quiet place for durable context
        </h2>
        <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
          Create Markdown notes, organize them into folders, and connect ideas
          so agents can retrieve the right context.
        </p>
        {canWrite && (
          <Button size="sm" className="mt-4" onClick={onCreate}>
            <FilePlus2 className="mr-1.5 h-4 w-4" /> Create a note
          </Button>
        )}
      </div>
    </div>
  );
}

function SearchResults({
  results,
  spaces,
  onSelect,
}: {
  results: KnowledgeSearchResult[];
  spaces: KnowledgeSpace[];
  onSelect: (result: KnowledgeSearchResult) => void;
}) {
  return (
    <div className="absolute left-0 right-0 top-11 z-40 max-h-[420px] overflow-y-auto rounded-xl border bg-white p-1.5 shadow-xl">
      {results.map((result) => (
        <button
          key={`${result.documentId}:${result.heading || ""}`}
          onClick={() => onSelect(result)}
          className="block w-full rounded-lg px-3 py-2.5 text-left hover:bg-stone-50"
        >
          <span className="flex items-center justify-between gap-2">
            <span className="truncate text-sm font-medium">{result.title}</span>
            <span className="shrink-0 text-[10px] text-muted-foreground">
              {Math.round(Math.min(1, result.score) * 100)}%
            </span>
          </span>
          <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
            {spaces.find((space) => space.spaceId === result.spaceId)?.name} ·{" "}
            {result.heading || result.path}
          </span>
          <span className="mt-1 block line-clamp-2 text-xs leading-5 text-stone-500">
            {result.excerpt.replace(/^#.*\n+/, "")}
          </span>
        </button>
      ))}
      {!results.length && (
        <p className="px-3 py-6 text-center text-sm text-muted-foreground">
          No matching notes
        </p>
      )}
    </div>
  );
}

function NewNoteDialog({
  open,
  kind,
  onOpenChange,
  onCreate,
}: {
  open: boolean;
  kind: "note" | "project";
  onOpenChange: (open: boolean) => void;
  onCreate: (input: { path: string; title: string }) => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [path, setPath] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (open) {
      setTitle("");
      setPath(
        kind === "project" ? "Projects/New project/Overview.md" : "Untitled.md",
      );
      setError("");
    }
  }, [kind, open]);
  async function submit() {
    setBusy(true);
    setError("");
    try {
      const finalTitle =
        title.trim() ||
        path.split("/").pop()?.replace(/\.md$/i, "") ||
        "Untitled";
      await onCreate({ title: finalTitle, path });
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not create note",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {kind === "project" ? "Create a project folder" : "Create a note"}
          </DialogTitle>
          <DialogDescription>
            {kind === "project"
              ? "Folders are portable: they are represented directly by the note path."
              : "Use folders in the path to keep related knowledge together."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="note-title">Title</Label>
            <Input
              id="note-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder={
                kind === "project" ? "Project overview" : "Untitled note"
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="note-path">Path</Label>
            <Input
              id="note-path"
              value={path}
              onChange={(event) => setPath(event.target.value)}
              className="font-mono text-xs"
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy || !path.trim()}>
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function markdownWithWikiLinks(markdown: string) {
  return markdown.replace(
    /!?(\[\[([^\]|]+)(?:\|([^\]]+))?\]\])/g,
    (_match, _whole, target, label) =>
      `[${label || target}](brain:${encodeURIComponent(target.trim())})`,
  );
}

function openWikiLink(
  target: string,
  documents: KnowledgeDocument[],
  select: (id: string) => void,
) {
  const decoded = decodeURIComponent(target)
    .split("#")[0]
    .replace(/\.md$/i, "")
    .toLowerCase();
  const match = documents.find(
    (document) =>
      document.path.replace(/\.md$/i, "").toLowerCase() === decoded ||
      document.title.toLowerCase() === decoded ||
      document.path.replace(/\.md$/i, "").toLowerCase().endsWith(`/${decoded}`),
  );
  if (match) select(match.documentId);
}

function relativeDate(value: string) {
  const date = new Date(value);
  const seconds = Math.round((date.getTime() - Date.now()) / 1_000);
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  if (Math.abs(seconds) < 60) return formatter.format(seconds, "second");
  if (Math.abs(seconds) < 3_600)
    return formatter.format(Math.round(seconds / 60), "minute");
  if (Math.abs(seconds) < 86_400)
    return formatter.format(Math.round(seconds / 3_600), "hour");
  return formatter.format(Math.round(seconds / 86_400), "day");
}

function formatTrustTier(
  value: NonNullable<KnowledgeDocument["okf"]>["trustTier"],
) {
  if (value === "human-reviewed") return "Human reviewed";
  if (value === "machine-confirmed") return "Machine confirmed";
  return "Unverified";
}

function apiMessage(payload: any, fallback: string) {
  const message = payload?.message || payload?.error;
  return Array.isArray(message) ? message.join(", ") : message || fallback;
}

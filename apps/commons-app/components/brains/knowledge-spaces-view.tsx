"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  BookOpen,
  Bot,
  Check,
  ChevronDown,
  ChevronRight,
  Clock3,
  FilePlus2,
  FileText,
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
  createConnectedFolder,
  hasConnectedFolder,
  moveConnectedEntry,
  removeConnectedFolder,
  removeConnectedNote,
  reconnectMarkdownFolder,
  rememberMarkdownFolder,
  restoreMarkdownFolder,
  writeConnectedNote,
} from "./browser-folder";
import { CreateSpaceDialog } from "./create-space-dialog";
import { KnowledgeTree } from "./knowledge-tree";
import { RichMarkdownEditor } from "./rich-markdown-editor";
import { SpaceAccessDialog } from "./space-access-dialog";
import type {
  KnowledgeDocument,
  KnowledgeFolder,
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

type EditorMode = "visual" | "markdown";
type SaveState = "idle" | "saving" | "saved" | "error";

export function KnowledgeSpacesView() {
  const { authState } = useAuth();
  const userAddress = normalizePrincipalId(authState.walletAddress);
  const { agents } = useAgents(userAddress);
  const [spaces, setSpaces] = useState<KnowledgeSpace[]>([]);
  const [spaceId, setSpaceId] = useState("");
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);
  const [folders, setFolders] = useState<KnowledgeFolder[]>([]);
  const [documentId, setDocumentId] = useState("");
  const [document, setDocument] = useState<KnowledgeDocument | null>(null);
  const [graph, setGraph] = useState<KnowledgeGraph>({ nodes: [], edges: [] });
  const [view, setView] = useState<"notes" | "graph">("notes");
  const [editorMode, setEditorMode] = useState<EditorMode>("visual");
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
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderParent, setNewFolderParent] = useState("");
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<KnowledgeSearchResult[]>(
    [],
  );
  const [searching, setSearching] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [connectedFolderIds, setConnectedFolderIds] = useState<Set<string>>(
    new Set(),
  );

  const activeSpace = spaces.find((space) => space.spaceId === spaceId) || null;
  const canWrite =
    activeSpace?.permission === "write" || activeSpace?.permission === "manage";
  const sourceConnected =
    activeSpace?.provider !== "browser_filesystem" ||
    connectedFolderIds.has(activeSpace.spaceId);
  const canEdit = Boolean(canWrite && sourceConnected);
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

  const loadFolders = useCallback(async (nextSpaceId: string) => {
    if (!nextSpaceId) return;
    const response = await fetch(`/api/knowledge/${nextSpaceId}/folders`, {
      cache: "no-store",
    });
    const payload = await response.json();
    if (!response.ok)
      throw new Error(apiMessage(payload, "Could not load folders"));
    setFolders(Array.isArray(payload.data) ? payload.data : []);
  }, []);

  useEffect(() => {
    setDocument(null);
    setDocumentId("");
    setDocuments([]);
    setFolders([]);
    if (spaceId) {
      void loadDocuments(spaceId);
      void loadFolders(spaceId);
      void loadGraph(spaceId);
      const selectedSpace = spaces.find((space) => space.spaceId === spaceId);
      if (selectedSpace?.provider === "browser_filesystem") {
        void restoreMarkdownFolder(spaceId).then((connected) => {
          if (!connected) return;
          setConnectedFolderIds((current) => new Set(current).add(spaceId));
        });
      }
    }
  }, [activeSpace?.provider, loadDocuments, loadFolders, loadGraph, spaceId]);

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
    if (!dirty) return true;
    if (!document || !activeSpace || !canEdit) return false;
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
      return true;
    } catch (cause) {
      setSaveState("error");
      setError(cause instanceof Error ? cause.message : "Could not save note");
      return false;
    }
  }, [activeSpace, canEdit, dirty, document, loadGraph]);

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
    if (!sourceConnected) {
      throw new Error("Reconnect this folder before creating a note.");
    }
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
      const writtenLocally = await writeConnectedNote(
        activeSpace.spaceId,
        created.path,
        content,
      ).catch(() => false);
      if (!writtenLocally) {
        setNotice(
          "The note was created in Knowledge, but the connected source could not be updated. Reconnect it before the next sync.",
        );
      }
    }
    await Promise.all([
      loadDocuments(activeSpace.spaceId),
      loadFolders(activeSpace.spaceId),
      loadGraph(activeSpace.spaceId),
      loadSpaces(),
    ]);
    setDocumentId(created.documentId);
    setNewNoteOpen(false);
  }

  const refreshActiveSpace = useCallback(async () => {
    if (!activeSpace) return;
    await Promise.all([
      loadDocuments(activeSpace.spaceId),
      loadFolders(activeSpace.spaceId),
      loadGraph(activeSpace.spaceId),
      loadSpaces(),
    ]);
  }, [activeSpace, loadDocuments, loadFolders, loadGraph, loadSpaces]);

  async function documentDetail(target: KnowledgeDocument) {
    if (
      target.documentId === document?.documentId &&
      document.content != null
    ) {
      return {
        ...document,
        content: dirty ? draftRef.current.content : document.content,
      };
    }
    const response = await fetch(
      `/api/knowledge/${target.spaceId}/documents/${target.documentId}`,
      { cache: "no-store" },
    );
    const payload = await response.json();
    if (!response.ok)
      throw new Error(apiMessage(payload, "Could not open note"));
    return payload.data as KnowledgeDocument;
  }

  async function reloadOpenDocument(documentId: string) {
    if (!activeSpace) return;
    const response = await fetch(
      `/api/knowledge/${activeSpace.spaceId}/documents/${documentId}`,
      { cache: "no-store" },
    );
    const payload = await response.json();
    if (!response.ok)
      throw new Error(apiMessage(payload, "Could not refresh note"));
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
  }

  async function updateDocumentPath(
    target: KnowledgeDocument,
    nextPath: string,
    nextTitle = target.title,
  ) {
    if (!activeSpace || nextPath === target.path) return;
    setError("");
    const selectedTarget = target.documentId === document?.documentId;
    const hadUnsavedChanges = selectedTarget && dirty;
    if (selectedTarget) setDirty(false);
    try {
      const detail = await documentDetail(target);
      let movedLocal = false;
      if (activeSpace.provider === "browser_filesystem") {
        if (!hasConnectedFolder(activeSpace.spaceId)) {
          throw new Error(
            "Reconnect this folder before moving its source file.",
          );
        }
        movedLocal = await moveConnectedEntry(
          activeSpace.spaceId,
          target.path,
          nextPath,
          "file",
        );
      }
      const response = await fetch(
        `/api/knowledge/${activeSpace.spaceId}/documents/${target.documentId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            path: nextPath,
            title: nextTitle,
            content: detail.content || "",
            expectedRevision: detail.revision,
            providerRevision:
              activeSpace.provider === "browser_filesystem"
                ? new Date().toISOString()
                : undefined,
          }),
        },
      );
      const payload = await response.json();
      if (!response.ok) {
        if (movedLocal) {
          await moveConnectedEntry(
            activeSpace.spaceId,
            nextPath,
            target.path,
            "file",
          ).catch(() => false);
        }
        throw new Error(apiMessage(payload, "Could not move note"));
      }
      if (target.documentId === document?.documentId) {
        const saved = payload.data as KnowledgeDocument;
        setDocument(saved);
        setDraftPath(saved.path);
        setDraftTitle(saved.title);
        draftRef.current = {
          ...draftRef.current,
          path: saved.path,
          title: saved.title,
        };
        setDirty(false);
      }
      await refreshActiveSpace();
    } catch (cause) {
      if (hadUnsavedChanges) setDirty(true);
      setError(cause instanceof Error ? cause.message : "Could not move note");
    }
  }

  async function renameDocument(
    target: KnowledgeDocument,
    requestedName: string,
  ) {
    const name = cleanEntryName(requestedName).replace(/\.md$/i, "");
    if (!name) return;
    const parent = parentPath(target.path);
    await updateDocumentPath(target, joinPath(parent, `${name}.md`), name);
  }

  async function moveDocument(
    target: KnowledgeDocument,
    targetFolderPath: string,
  ) {
    await updateDocumentPath(
      target,
      joinPath(targetFolderPath, baseName(target.path)),
    );
  }

  async function createFolder(path: string) {
    if (!activeSpace) return;
    if (!sourceConnected) {
      setError("Reconnect this folder before creating a folder.");
      return;
    }
    setError("");
    let createdLocally = false;
    try {
      if (activeSpace.provider === "browser_filesystem") {
        createdLocally = await createConnectedFolder(activeSpace.spaceId, path);
        if (!createdLocally) {
          throw new Error("Reconnect this folder before creating a folder.");
        }
      }
      const response = await fetch(
        `/api/knowledge/${activeSpace.spaceId}/folders`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ path }),
        },
      );
      const payload = await response.json();
      if (!response.ok) {
        if (createdLocally) {
          await removeConnectedFolder(activeSpace.spaceId, path).catch(
            () => false,
          );
        }
        throw new Error(apiMessage(payload, "Could not create folder"));
      }
      await refreshActiveSpace();
      setNewFolderOpen(false);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not create folder",
      );
    }
  }

  async function updateFolderPath(target: KnowledgeFolder, nextPath: string) {
    if (!activeSpace || nextPath === target.path) return;
    if (nextPath.startsWith(`${target.path}/`)) {
      setError("A folder cannot be moved inside itself.");
      return;
    }
    setError("");
    try {
      if (dirty && !(await saveDocument())) {
        throw new Error("Save the open note before moving this folder.");
      }
      const selectedDocumentId =
        document &&
        (document.path.toLowerCase().startsWith(`${target.path.toLowerCase()}/`)
          ? document.documentId
          : undefined);
      let movedLocal = false;
      if (activeSpace.provider === "browser_filesystem") {
        if (!hasConnectedFolder(activeSpace.spaceId)) {
          throw new Error("Reconnect this folder before moving it.");
        }
        movedLocal = await moveConnectedEntry(
          activeSpace.spaceId,
          target.path,
          nextPath,
          "folder",
        );
      }
      const response = await fetch(
        `/api/knowledge/${activeSpace.spaceId}/folders/${target.folderId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ path: nextPath }),
        },
      );
      const payload = await response.json();
      if (!response.ok) {
        if (movedLocal) {
          await moveConnectedEntry(
            activeSpace.spaceId,
            nextPath,
            target.path,
            "folder",
          ).catch(() => false);
        }
        throw new Error(apiMessage(payload, "Could not move folder"));
      }
      await refreshActiveSpace();
      if (selectedDocumentId) await reloadOpenDocument(selectedDocumentId);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not move folder",
      );
    }
  }

  async function renameFolder(target: KnowledgeFolder, requestedName: string) {
    const name = cleanEntryName(requestedName);
    if (!name) return;
    await updateFolderPath(target, joinPath(parentPath(target.path), name));
  }

  async function moveFolder(target: KnowledgeFolder, targetFolderPath: string) {
    await updateFolderPath(
      target,
      joinPath(targetFolderPath, baseName(target.path)),
    );
  }

  async function removeFolder(target: KnowledgeFolder) {
    if (!activeSpace) return;
    if (!sourceConnected) {
      setError("Reconnect this folder before deleting it.");
      return;
    }
    if (
      !window.confirm(
        `Delete “${target.path}” and every note inside it? Note history remains in provenance.`,
      )
    )
      return;
    setError("");
    try {
      const response = await fetch(
        `/api/knowledge/${activeSpace.spaceId}/folders/${target.folderId}`,
        { method: "DELETE" },
      );
      const payload = await response.json().catch(() => null);
      if (!response.ok)
        throw new Error(apiMessage(payload, "Could not delete folder"));
      if (
        activeSpace.provider === "browser_filesystem" &&
        hasConnectedFolder(activeSpace.spaceId)
      ) {
        const removedLocally = await removeConnectedFolder(
          activeSpace.spaceId,
          target.path,
        ).catch(() => false);
        if (!removedLocally) {
          setNotice(
            "The Knowledge folder was deleted, but the connected source could not be updated. Reconnect it before the next sync.",
          );
        }
      }
      await refreshActiveSpace();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not delete folder",
      );
    }
  }

  async function removeDocument(target: KnowledgeDocument | null = document) {
    if (!target || !activeSpace) return;
    if (
      !window.confirm(
        `Delete “${target.title}”? Its revision history remains in provenance.`,
      )
    )
      return;
    let removedLocal = false;
    let sourceContent =
      target.documentId === document?.documentId
        ? document.content || draft
        : "";
    if (activeSpace.provider === "browser_filesystem") {
      if (!hasConnectedFolder(activeSpace.spaceId)) {
        setError("Reconnect this folder before deleting its source file.");
        return;
      }
      if (!sourceContent) {
        const detail = await fetch(
          `/api/knowledge/${activeSpace.spaceId}/documents/${target.documentId}`,
          { cache: "no-store" },
        );
        const payload = await detail.json();
        sourceContent = payload?.data?.content || "";
      }
      removedLocal = await removeConnectedNote(
        activeSpace.spaceId,
        target.path,
      );
    }
    const response = await fetch(
      `/api/knowledge/${activeSpace.spaceId}/documents/${target.documentId}`,
      { method: "DELETE" },
    );
    if (!response.ok) {
      if (removedLocal) {
        await writeConnectedNote(
          activeSpace.spaceId,
          target.path,
          sourceContent,
        ).catch(() => false);
      }
      return setError("Could not delete note");
    }
    if (target.documentId === document?.documentId) setDocument(null);
    await Promise.all([
      loadDocuments(activeSpace.spaceId),
      loadFolders(activeSpace.spaceId),
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
        await rememberMarkdownFolder(activeSpace.spaceId, selected.handle);
        setConnectedFolderIds((current) =>
          new Set(current).add(activeSpace.spaceId),
        );
      }
      const response = await fetch(
        `/api/knowledge/${activeSpace.spaceId}/import`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            documents: selected.documents,
            folders: selected.folders,
          }),
        },
      );
      const payload = await response.json();
      if (!response.ok)
        throw new Error(apiMessage(payload, "Could not import folder"));
      const result = payload.data;
      setNotice(
        `Folder synced: ${result.created} created, ${result.updated} updated, ${result.unchanged} unchanged${result.folders ? `, ${result.folders} folders ready` : ""}${result.remoteKept ? `, ${result.remoteKept} newer agent edits kept` : ""}${result.failed?.length ? `, ${result.failed.length} conflicts need review` : ""}.`,
      );
      await Promise.all([
        loadDocuments(activeSpace.spaceId),
        loadFolders(activeSpace.spaceId),
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

  return (
    <div className="h-screen overflow-hidden bg-white text-stone-950">
      <div className="flex h-screen">
        <DashboardSideBar username={userAddress} />
        <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <header className="flex h-[74px] shrink-0 items-center justify-between border-b border-stone-200/80 bg-white px-6">
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
            <aside className="flex w-[276px] shrink-0 flex-col border-r border-stone-200/80 bg-white">
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
                      setNewFolderParent("");
                      setNewFolderOpen(true);
                    }}
                    disabled={!canEdit}
                    className="rounded p-1 text-stone-500 hover:bg-stone-100 disabled:opacity-40"
                    title="New folder"
                  >
                    <FolderPlus className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => setNewNoteOpen(true)}
                    disabled={!canEdit}
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
                  <KnowledgeTree
                    folders={folders}
                    documents={documents}
                    selectedId={documentId}
                    canWrite={canEdit}
                    onSelect={(id) => {
                      setDocumentId(id);
                      setView("notes");
                    }}
                    onCreateFolder={(parent) => {
                      setNewFolderParent(parent);
                      setNewFolderOpen(true);
                    }}
                    onRenameDocument={renameDocument}
                    onRenameFolder={renameFolder}
                    onMoveDocument={moveDocument}
                    onMoveFolder={moveFolder}
                    onDeleteDocument={(target) => void removeDocument(target)}
                    onDeleteFolder={(target) => void removeFolder(target)}
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
                    ? connectedFolderIds.has(activeSpace.spaceId)
                      ? "Sync connected folder"
                      : "Reconnect folder"
                    : "Import Markdown folder"}
                </button>
              </div>
            </aside>

            <section className="flex min-w-0 flex-1 flex-col bg-white">
              <div className="flex h-12 shrink-0 items-center justify-between border-b border-stone-200/80 bg-white px-4">
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
                <div className="min-w-0 flex-1 overflow-hidden bg-page p-0">
                  {loading ? (
                    <div className="grid h-full place-items-center">
                      <Loader2 className="h-5 w-5 animate-spin text-stone-400" />
                    </div>
                  ) : view === "graph" ? (
                    <KnowledgeGraphView
                      graph={graph}
                      selectedId={documentId}
                      onSelect={setDocumentId}
                      onOpen={(id) => {
                        setDocumentId(id);
                        setView("notes");
                      }}
                    />
                  ) : document ? (
                    <div className="flex h-full w-full flex-col bg-page">
                      <div className="flex shrink-0 items-start justify-between gap-4 border-b border-stone-200/80 bg-white px-6 py-4">
                        <div className="min-w-0 flex-1">
                          <input
                            value={draftTitle}
                            onChange={(event) =>
                              updateDraft("title", event.target.value)
                            }
                            disabled={!canEdit}
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
                              disabled={!canEdit}
                              className="min-w-0 flex-1 bg-transparent font-mono text-[11px] outline-none disabled:text-muted-foreground"
                            />
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <div className="mr-1 flex rounded-md bg-stone-100 p-0.5">
                            <button
                              onClick={() => setEditorMode("visual")}
                              className={cn(
                                "rounded px-2 py-1 text-[11px]",
                                editorMode === "visual"
                                  ? "bg-white font-medium shadow-sm"
                                  : "text-muted-foreground",
                              )}
                            >
                              Visual
                            </button>
                            <button
                              onClick={() => setEditorMode("markdown")}
                              className={cn(
                                "rounded px-2 py-1 text-[11px]",
                                editorMode === "markdown"
                                  ? "bg-white font-medium shadow-sm"
                                  : "text-muted-foreground",
                              )}
                            >
                              Markdown
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
                              {canEdit && (
                                <>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    className="text-red-600"
                                    onClick={() => void removeDocument()}
                                  >
                                    <Trash2 className="h-4 w-4" /> Delete note
                                  </DropdownMenuItem>
                                </>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                      {editorMode === "visual" ? (
                        <RichMarkdownEditor
                          value={draft}
                          onChange={(value) => updateDraft("content", value)}
                          editable={canEdit}
                          documentPath={draftPath}
                          documents={documents}
                          onOpenDocument={setDocumentId}
                        />
                      ) : (
                        <textarea
                          value={draft}
                          onChange={(event) =>
                            updateDraft("content", event.target.value)
                          }
                          readOnly={!canEdit}
                          spellCheck
                          className="min-h-0 flex-1 resize-none border-0 bg-page px-6 py-6 font-mono text-[13px] leading-7 text-stone-800 outline-none placeholder:text-stone-300 sm:px-8"
                          placeholder="Write raw Markdown here."
                        />
                      )}
                    </div>
                  ) : (
                    <EmptyNotes
                      canWrite={canEdit}
                      onCreate={() => setNewNoteOpen(true)}
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
          await Promise.all([
            loadDocuments(space.spaceId),
            loadFolders(space.spaceId),
            loadGraph(space.spaceId),
          ]);
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
        onOpenChange={setNewNoteOpen}
        onCreate={createNote}
      />
      <NewFolderDialog
        open={newFolderOpen}
        parentPath={newFolderParent}
        onOpenChange={setNewFolderOpen}
        onCreate={createFolder}
      />
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
    <aside className="hidden w-[286px] shrink-0 border-l bg-white xl:flex xl:flex-col">
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
  onOpenChange,
  onCreate,
}: {
  open: boolean;
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
      setPath("Untitled.md");
      setError("");
    }
  }, [open]);
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
          <DialogTitle>Create a note</DialogTitle>
          <DialogDescription>
            Use folders in the path to keep related knowledge together.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="note-title">Title</Label>
            <Input
              id="note-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Untitled note"
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

function NewFolderDialog({
  open,
  parentPath,
  onOpenChange,
  onCreate,
}: {
  open: boolean;
  parentPath: string;
  onOpenChange: (open: boolean) => void;
  onCreate: (path: string) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!open) return;
    setName("");
    setError("");
  }, [open, parentPath]);
  async function submit() {
    const clean = cleanEntryName(name);
    if (!clean) return;
    setBusy(true);
    setError("");
    try {
      await onCreate(joinPath(parentPath, clean));
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not create folder",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New folder</DialogTitle>
          <DialogDescription>
            {parentPath
              ? `Create a folder inside ${parentPath}.`
              : "Create a folder at the top level of this space."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="folder-name">Name</Label>
          <Input
            id="folder-name"
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void submit();
            }}
            placeholder="Project notes"
          />
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
          <Button onClick={submit} disabled={busy || !name.trim()}>
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Create folder
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function cleanEntryName(value: string) {
  return value
    .trim()
    .replace(/[\\/]+/g, "-")
    .replace(/^\.+|\.+$/g, "");
}

function joinPath(parent: string, child: string) {
  return [parent, child].filter(Boolean).join("/");
}

function parentPath(path: string) {
  const parts = path.replace(/\\/g, "/").split("/");
  parts.pop();
  return parts.join("/");
}

function baseName(path: string) {
  return path.replace(/\\/g, "/").split("/").pop() || path;
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

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronDown,
  Code2,
  Download,
  Eraser,
  ExternalLink,
  History,
  Maximize,
  MessageSquareText,
  Music2,
  ScissorsLineDashed,
  ListCollapse,
  SpellCheck,
  Table2,
  Workflow,
  Minus,
  Palette,
  PanelLeft,
  Pencil,
  Plus,
  Share2,
  X,
} from "lucide-react";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ArtifactIcon } from "@/components/artifacts/artifact-icon";
import { useToast } from "@/hooks/use-toast";
import { useWorkspaceMode } from "@/context/WorkspaceModeContext";
import { desktopApiFetch } from "@/lib/desktop-api-fetch";
import { apiErrorMessage } from "@/lib/api-error";
import { artifactKind, isMermaid, type ArtifactPreview } from "@/lib/artifacts";
import {
  unwrapCanvasPayload,
  type CanvasAnnotation,
  type CanvasProjectBundle,
  type CanvasRevision,
  type MediaKind,
} from "@/lib/canvas";
import { useCanvasStore, type CanvasViewerState } from "@/stores/canvas-store";
import { ChromeButton, ChromeDivider, ChromeGroup, FileTypeMark, FloatingPanel } from "./canvas-chrome";
import {
  CreativeTools,
  HistoryList,
  NotesList,
  rememberedCreativeDefaults,
  type CreativeDefaults,
} from "./canvas-panels";
import { noteLocationLabel, noteQuote, noteTarget, type NoteDraft, type NoteTool } from "./canvas-notes";
import { NoteEditor } from "./note-editor";
import { NotePalette, type PaletteAction } from "./note-palette";
import { CodeStage } from "./stages/code-stage";
import { ImageStage } from "./stages/image-stage";
import { MediaStage } from "./stages/media-stage";
import { PageImagesStage, pageImages } from "./stages/page-images-stage";
import { PdfStage } from "./stages/pdf-stage";
import { SheetStage } from "./stages/sheet-stage";
import { StageMessage, type StageProps } from "./stages/stage-kit";
import { MARKDOWN, TextStage } from "./stages/text-stage";

type Panel = "notes" | "history" | "tools" | null;
type StageKind = "code" | "image" | "media" | "pdf" | "slides" | "sheet" | "text" | "none";

function stageKindFor(preview: ArtifactPreview): StageKind {
  if (preview.interactivePreview || preview.codeProject) return "code";
  if (isMermaid(preview)) return "text";
  const kind = artifactKind(preview);
  if (kind === "image") return "image";
  if (kind === "video" || kind === "audio") return "media";
  if (kind === "pdf") return "pdf";
  if (kind === "presentation") return pageImages(preview, "presentation_slide_image").length ? "slides" : "text";
  if (kind === "spreadsheet") return "sheet";
  if (["document", "text", "code"].includes(kind)) return "text";
  if (preview.content?.trim()) return "text";
  return "none";
}

function mediaKindOf(preview: ArtifactPreview | null): MediaKind | null {
  if (!preview) return null;
  if (preview.kind === "music") return "music";
  if (preview.mimeType.startsWith("image/")) return "image";
  if (preview.mimeType.startsWith("video/")) return "video";
  if (preview.mimeType.startsWith("audio/")) return "audio";
  return null;
}

export function CanvasViewer({
  itemId,
  onClose,
  leading,
}: {
  itemId: string;
  onClose?: () => void;
  /** Controls shown before the file name, e.g. a toggle for the file list. */
  leading?: React.ReactNode;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const { mode } = useWorkspaceMode();
  const local = mode === "private-local";
  const known = useCanvasStore((state) => state.known[itemId]);
  const revision = useCanvasStore((state) => state.revision);
  const chatInset = useCanvasStore((state) => state.chatInset);
  const dockInset = useCanvasStore((state) => state.dockInset);
  const attached = useCanvasStore((state) => state.attached);
  const setContext = useCanvasStore((state) => state.setContext);
  const setViewer = useCanvasStore((state) => state.setViewer);
  const attachNotes = useCanvasStore((state) => state.attachNotes);
  const sendPrompt = useCanvasStore((state) => state.sendPrompt);

  const [bundle, setBundle] = useState<CanvasProjectBundle | null>(null);
  const [canvasError, setCanvasError] = useState("");
  const [preview, setPreview] = useState<ArtifactPreview | null>(null);
  const [previewError, setPreviewError] = useState("");
  const [panel, setPanel] = useState<Panel>(null);
  const [tool, setTool] = useState<NoteTool>("interact");
  const [view, setView] = useState<"preview" | "source">("preview");
  const [showPages, setShowPages] = useState(false);
  const [pageCount, setPageCount] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [draft, setDraft] = useState<NoteDraft | null>(null);
  const [openNote, setOpenNote] = useState<{ id: string; anchor: { x: number; y: number } } | null>(null);
  const [focusedNoteId, setFocusedNoteId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [switching, setSwitching] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);
  const activatedRef = useRef(false);

  const fail = useCallback(
    (message: string) => toast({ title: message, variant: "destructive" }),
    [toast],
  );

  /* ---------------------------------------------------- loading */

  const loadBundle = useCallback(async () => {
    if (local) {
      setBundle(null);
      return null;
    }
    const attempt = async () => {
      const response = await desktopApiFetch("/api/canvas/projects/open", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ artifactId: itemId }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        const error = new Error(apiErrorMessage(payload, "Notes and history could not be loaded"));
        (error as Error & { retry?: boolean }).retry = response.status >= 500;
        throw error;
      }
      return unwrapCanvasPayload<CanvasProjectBundle>(payload);
    };
    try {
      let next: CanvasProjectBundle;
      try {
        next = await attempt();
      } catch (error) {
        if (!(error as { retry?: boolean }).retry) throw error;
        next = await attempt();
      }
      setBundle(next);
      setCanvasError("");
      return next;
    } catch (cause) {
      setCanvasError(cause instanceof Error ? cause.message : "Notes and history could not be loaded");
      return null;
    }
  }, [itemId, local]);

  // The item on screen is the canvas's current version once it is known.
  const viewedItemId = bundle?.project.activeItemId ?? itemId;

  const loadPreview = useCallback(async (id: string) => {
    setPreviewError("");
    try {
      const response = await desktopApiFetch(`/api/library/${encodeURIComponent(id)}/preview`, { cache: "no-store" });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(apiErrorMessage(payload, "This file could not be opened"));
      setPreview(unwrapCanvasPayload<ArtifactPreview>(payload));
    } catch (cause) {
      setPreviewError(cause instanceof Error ? cause.message : "This file could not be opened");
    }
  }, []);

  useEffect(() => {
    activatedRef.current = false;
    setBundle(null);
    setPreview(null);
    setDraft(null);
    setOpenNote(null);
    setPanel(null);
    setView("preview");
    setTool("interact");
    setZoom(1);
    void loadBundle();
  }, [loadBundle]);

  useEffect(() => {
    void loadPreview(viewedItemId);
  }, [loadPreview, viewedItemId]);

  // Opening an earlier version from the Library makes it the current one.
  useEffect(() => {
    if (!bundle || activatedRef.current) return;
    activatedRef.current = true;
    const opened = bundle.revisions.find((entry) => entry.itemId === itemId);
    if (opened && opened.itemId !== bundle.project.activeItemId) void activate(opened);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bundle, itemId]);

  // Agents changed something: refresh the record and the file.
  const lastRevision = useRef(revision);
  useEffect(() => {
    if (lastRevision.current === revision) return;
    lastRevision.current = revision;
    void loadBundle().then((next) => {
      const id = next?.project.activeItemId ?? itemId;
      void loadPreview(id);
    });
  }, [itemId, loadBundle, loadPreview, revision]);

  // Seed creative preferences from the last canvas this person configured.
  useEffect(() => {
    if (!bundle || bundle.project.settings?.creativeDefaults) return;
    const remembered = rememberedCreativeDefaults();
    if (remembered && Object.keys(remembered).length) void saveSettings({ creativeDefaults: remembered });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bundle?.project.projectId]);

  /* ------------------------------------------------- derived */

  const activeRevision = useMemo(
    () => bundle?.revisions.find((entry) => entry.itemId === bundle.project.activeItemId),
    [bundle],
  );
  const notes = useMemo(
    () =>
      (bundle?.annotations ?? [])
        .filter((note) => note.revisionId === activeRevision?.revisionId)
        .sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt)),
    [activeRevision?.revisionId, bundle?.annotations],
  );
  const numbers = useMemo(() => new Map(notes.map((note, index) => [note.annotationId, index + 1])), [notes]);
  const numberOf = useCallback((id: string) => numbers.get(id) ?? 0, [numbers]);
  const otherVersionNotes = (bundle?.annotations.length ?? 0) - notes.length;
  const attachedIds = useMemo(() => new Set(attached.map((note) => note.annotationId)), [attached]);
  const stage = preview ? stageKindFor(preview) : null;
  const canAnnotate = Boolean(bundle && activeRevision && !local);
  const hasSource =
    Boolean(preview?.codeProject?.files?.length) ||
    (stage === "code" && Boolean(preview?.content)) ||
    Boolean(preview && isMermaid(preview));
  const paged = stage === "pdf" || stage === "slides";

  // Tell the chat what is on screen.
  useEffect(() => {
    if (!preview) return;
    setContext({
      projectId: bundle?.project.projectId,
      revisionId: activeRevision?.revisionId,
      artifact: { itemId: preview.itemId, name: preview.name, kind: preview.kind, mimeType: preview.mimeType },
      viewer: { view },
    });
  }, [activeRevision?.revisionId, bundle?.project.projectId, preview, setContext, view]);
  useEffect(() => () => setContext(null), [setContext]);

  const onViewer = useCallback((viewer: Partial<CanvasViewerState>) => setViewer(viewer), [setViewer]);
  const onPages = useCallback((count: number) => setPageCount(count), []);

  /* ------------------------------------------------- actions */

  async function patchCanvas(body: Record<string, unknown>) {
    if (!bundle) return null;
    const response = await desktopApiFetch(`/api/canvas/projects/${encodeURIComponent(bundle.project.projectId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new Error(apiErrorMessage(payload, "The change could not be saved"));
    return payload;
  }

  async function saveSettings(settings: Record<string, unknown>) {
    try {
      await patchCanvas({ settings });
      setBundle((current) =>
        current
          ? { ...current, project: { ...current.project, settings: { ...(current.project.settings ?? {}), ...settings } } }
          : current,
      );
    } catch (cause) {
      fail(cause instanceof Error ? cause.message : "Preferences could not be saved");
      throw cause;
    }
  }

  async function activate(target: CanvasRevision) {
    setSwitching(target.revisionId);
    try {
      await patchCanvas({ activeRevisionId: target.revisionId });
      await loadBundle();
    } catch (cause) {
      fail(cause instanceof Error ? cause.message : "Could not switch versions");
    } finally {
      setSwitching(null);
    }
  }

  async function saveDraft(body: string) {
    if (!draft || !bundle || !activeRevision) return;
    setSaving(true);
    try {
      const text = body || (draft.target.type === "text" ? "Highlight" : "");
      const response = await desktopApiFetch(
        `/api/canvas/projects/${encodeURIComponent(bundle.project.projectId)}/annotations`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            revisionId: activeRevision.revisionId,
            kind: draft.kind,
            body: text,
            geometry: draft.geometry,
            startMs: draft.startMs,
            endMs: draft.endMs,
            metadata: {
              schemaVersion: 3,
              target: draft.target,
              intrinsicSize: draft.intrinsicSize ?? undefined,
              coordinateSpace: draft.geometry ? "artifact_content" : undefined,
            },
          }),
        },
      );
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(apiErrorMessage(payload, "The note could not be saved"));
      const created = unwrapCanvasPayload<CanvasAnnotation>(payload);
      setBundle((current) => (current ? { ...current, annotations: [...current.annotations, created] } : current));
      // New notes go with the next chat message; the chip can be removed.
      attachNotes([{ annotationId: created.annotationId, number: notes.length + 1, body: created.body }]);
      setDraft(null);
      setTool("interact");
    } catch (cause) {
      fail(cause instanceof Error ? cause.message : "The note could not be saved");
    } finally {
      setSaving(false);
    }
  }

  async function updateNote(note: CanvasAnnotation, change: { body?: string; status?: "open" | "resolved"; deleted?: boolean }) {
    if (!bundle) return;
    try {
      const response = await desktopApiFetch(
        `/api/canvas/projects/${encodeURIComponent(bundle.project.projectId)}/annotations/${encodeURIComponent(note.annotationId)}`,
        { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(change) },
      );
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(apiErrorMessage(payload, "The note could not be updated"));
      const { deleted, ...fields } = change;
      setBundle((current) =>
        current
          ? {
              ...current,
              annotations: deleted
                ? current.annotations.filter((entry) => entry.annotationId !== note.annotationId)
                : current.annotations.map((entry) =>
                    entry.annotationId === note.annotationId ? { ...entry, ...fields } : entry,
                  ),
            }
          : current,
      );
      if (change.deleted) {
        useCanvasStore.getState().detachNote(note.annotationId);
        setOpenNote(null);
      }
    } catch (cause) {
      fail(cause instanceof Error ? cause.message : "The note could not be updated");
    }
  }

  const addToChat = (list: CanvasAnnotation[]) =>
    attachNotes(list.map((note) => ({ annotationId: note.annotationId, number: numberOf(note.annotationId), body: note.body })));

  async function rename() {
    if (!preview) return;
    const name = window.prompt("Rename file", preview.name)?.trim();
    if (!name || name === preview.name) return;
    setRenaming(true);
    try {
      const response = await desktopApiFetch(`/api/library/${encodeURIComponent(preview.itemId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(apiErrorMessage(payload, "The file could not be renamed"));
      setPreview((current) => (current ? { ...current, name } : current));
      window.dispatchEvent(new CustomEvent("library-changed"));
    } catch (cause) {
      fail(cause instanceof Error ? cause.message : "The file could not be renamed");
    } finally {
      setRenaming(false);
    }
  }

  async function share() {
    if (!preview) return;
    try {
      const response = await desktopApiFetch(`/api/library/${encodeURIComponent(preview.itemId)}/share-links`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expiresAt: new Date(Date.now() + 7 * 86_400_000).toISOString() }),
      });
      const payload = await response.json().catch(() => null);
      const url = payload?.url ?? payload?.data?.url;
      if (!response.ok || !url) throw new Error(apiErrorMessage(payload, "A share link could not be created"));
      await navigator.clipboard.writeText(url);
      toast({ title: "Link copied", description: "Anyone with the link can view this file for 7 days." });
    } catch (cause) {
      fail(cause instanceof Error ? cause.message : "A share link could not be created");
    }
  }

  function exportFile() {
    const url = preview?.download?.url ?? preview?.inline?.url;
    if (!url || !preview) return;
    const link = document.createElement("a");
    link.href = url;
    link.download = preview.name;
    link.rel = "noopener";
    link.click();
  }

  const close = () => (onClose ? onClose() : router.push("/library"));

  // Escape closes the innermost open thing.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      const element = event.target as HTMLElement | null;
      if (element?.closest("input, textarea, [role='dialog']")) return;
      if (draft) setDraft(null);
      else if (openNote) setOpenNote(null);
      else if (tool !== "interact") setTool("interact");
      else if (panel) setPanel(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [draft, openNote, panel, tool]);

  /* --------------------------------------------------- render */

  const shownNote = openNote ? notes.find((note) => note.annotationId === openNote.id) : undefined;
  const artifactLike = preview ?? (known ? { ...known } : { name: "", mimeType: "" });
  const openCount = notes.filter((note) => note.status !== "resolved").length;
  const mediaKind = mediaKindOf(preview);

  const stageProps: StageProps | null = preview
    ? {
        preview,
        tool,
        notes,
        numberOf,
        focusedNoteId,
        zoom,
        showPages,
        canAnnotate,
        onDraft: (next) => {
          setOpenNote(null);
          setDraft(next as NoteDraft);
        },
        onOpenNote: (note, anchor) => {
          setDraft(null);
          setFocusedNoteId(note.annotationId);
          setOpenNote({ id: note.annotationId, anchor });
        },
        onViewer,
        onPages,
        view,
      }
    : null;

  // Note tools that fit the file: flowing text is noted by selecting it,
  // pictures, pages, frames and previews by pinning or marking an area.
  const textFlow = stage === "text" && !(preview && isMermaid(preview) && view === "preview");
  const sourceLike = view === "source" || (stage === "text" && preview && artifactKind(preview) === "code" && !MARKDOWN.test(preview.name) && !isMermaid(preview));
  const paletteTools: NoteTool[] =
    !canAnnotate || textFlow || sourceLike || stage === "sheet" || (stage === "media" && !preview?.mimeType.startsWith("video/"))
      ? []
      : ["interact", "point", "region"];
  const paletteHint = !canAnnotate
    ? undefined
    : sourceLike
      ? "Select code to add a note"
      : textFlow
        ? "Select text to add a note"
        : stage === "sheet"
          ? "Select cells to add a note"
          : undefined;
  const paletteActions = actionsFor(stage, preview, sendPrompt);
  const notesHint =
    stage === "pdf" || stage === "text"
      ? "Select text to highlight it, or pin a note with the tools below."
      : stage === "sheet"
        ? "Select cells to add a note."
        : stage === "code"
          ? "Pin a note on an element in the preview, or select code in the source."
          : stage === "media"
            ? "Add a note at a moment, or mark part of a frame."
            : "Pin a note or mark an area with the tools below.";

  return (
    <TooltipProvider delayDuration={300}>
      <div className="relative h-full w-full overflow-hidden bg-stone-100/70">
        {/* Stage */}
        <div
          className="absolute inset-0 transition-[right] duration-200"
          style={{ right: chatInset }}
        >
          {previewError ? (
            <StageMessage title="This file could not be opened" detail={previewError} />
          ) : !preview || !stageProps ? (
            <div className="flex h-full items-center justify-center">
              <FileTypeMark artifact={artifactLike} />
            </div>
          ) : stage === "code" ? (
            <CodeStage {...stageProps} />
          ) : stage === "image" ? (
            <ImageStage {...stageProps} />
          ) : stage === "media" ? (
            <MediaStage {...stageProps} />
          ) : stage === "pdf" ? (
            <PdfStage {...stageProps} />
          ) : stage === "slides" ? (
            <PageImagesStage {...stageProps} pageLabel="slide" />
          ) : stage === "sheet" ? (
            <SheetStage {...stageProps} />
          ) : stage === "text" ? (
            <TextStage {...stageProps} />
          ) : (
            <StageMessage title="There is no preview for this kind of file" detail="Download it to open it in another app." />
          )}
        </div>

        {/* Top left: file and panels */}
        <div className="pointer-events-none absolute left-3 top-3 z-30 flex max-w-[calc(100%-1.5rem)] items-start gap-2">
          <div className="flex flex-col items-start gap-2">
            <div className="flex items-center gap-2">
              {leading}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="pointer-events-auto flex h-10 max-w-[280px] items-center gap-2 rounded-xl border border-stone-200/80 bg-white/95 pl-3 pr-2 text-sm text-stone-900 shadow-floating backdrop-blur hover:bg-white"
                  >
                    <ArtifactIcon artifact={artifactLike} className="h-4 w-4 shrink-0 text-stone-500" strokeWidth={1.75} />
                    <span className="min-w-0 truncate">{preview?.name ?? known?.name ?? "Opening…"}</span>
                    <ChevronDown className="h-3.5 w-3.5 shrink-0 text-stone-400" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-52">
                  <DropdownMenuItem disabled={!preview || renaming} onSelect={() => void rename()}>
                    <Pencil className="mr-2 h-4 w-4" /> Rename
                  </DropdownMenuItem>
                  <DropdownMenuItem disabled={!preview?.download?.url && !preview?.inline?.url} onSelect={exportFile}>
                    <Download className="mr-2 h-4 w-4" /> Download
                  </DropdownMenuItem>
                  {preview?.inline?.url && !preview.inline.url.startsWith("data:") && (
                    <DropdownMenuItem onSelect={() => window.open(preview.inline!.url, "_blank", "noopener,noreferrer")}>
                      <ExternalLink className="mr-2 h-4 w-4" /> Open in new tab
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={close}>
                    <X className="mr-2 h-4 w-4" /> Close
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <ChromeGroup>
                {paged && pageCount > 1 && (
                  <ChromeButton
                    label={showPages ? "Hide pages" : stage === "slides" ? "Show slides" : "Show pages"}
                    active={showPages}
                    onClick={() => setShowPages((value) => !value)}
                  >
                    <PanelLeft />
                  </ChromeButton>
                )}
                {hasSource && (
                  <ChromeButton
                    label={view === "source" ? "Show preview" : "Show source"}
                    active={view === "source"}
                    onClick={() => {
                      setView((value) => (value === "source" ? "preview" : "source"));
                      setTool("interact");
                    }}
                  >
                    <Code2 />
                  </ChromeButton>
                )}
                {(paged || hasSource) && <ChromeDivider />}
                <ChromeButton
                  label="Notes"
                  active={panel === "notes"}
                  badge={openCount}
                  onClick={() => setPanel((value) => (value === "notes" ? null : "notes"))}
                >
                  <MessageSquareText />
                </ChromeButton>
                <ChromeButton
                  label="History"
                  active={panel === "history"}
                  disabled={!bundle}
                  onClick={() => setPanel((value) => (value === "history" ? null : "history"))}
                >
                  <History />
                </ChromeButton>
                <ChromeButton
                  label="Creative tools"
                  active={panel === "tools"}
                  disabled={!bundle}
                  onClick={() => setPanel((value) => (value === "tools" ? null : "tools"))}
                >
                  <Palette />
                </ChromeButton>
              </ChromeGroup>
            </div>

            {panel && (
              <div className="max-h-[calc(100vh-7rem)] overflow-hidden">
                {panel === "notes" ? (
                  <FloatingPanel
                    title="Notes"
                    onClose={() => setPanel(null)}
                    actions={
                      openCount > 0 ? (
                        <ChromeButton
                          label="Add open notes to chat"
                          onClick={() => addToChat(notes.filter((note) => note.status !== "resolved"))}
                        >
                          <MessageSquareText />
                        </ChromeButton>
                      ) : null
                    }
                  >
                    {local ? (
                      <p className="px-4 pb-4 text-xs leading-5 text-stone-500">
                        Notes are saved in Commons Cloud. In Local mode, describe the part you mean in chat.
                      </p>
                    ) : canvasError ? (
                      <div className="px-4 pb-4 text-xs leading-5 text-stone-500">
                        <p>{canvasError}</p>
                        <button type="button" onClick={() => void loadBundle()} className="mt-2 text-stone-900 underline">
                          Try again
                        </button>
                      </div>
                    ) : (
                      <NotesList
                        notes={notes}
                        numberOf={numberOf}
                        attachedIds={attachedIds}
                        focusedNoteId={focusedNoteId}
                        otherVersions={otherVersionNotes}
                        emptyHint={notesHint}
                        onFocus={(note) => {
                          setFocusedNoteId(note.annotationId);
                          const target = noteTarget(note);
                          if (target?.type === "source") setView("source");
                        }}
                        onAddToChat={addToChat}
                        onToggleResolved={(note) => void updateNote(note, { status: note.status === "resolved" ? "open" : "resolved" })}
                        onDelete={(note) => void updateNote(note, { deleted: true })}
                      />
                    )}
                  </FloatingPanel>
                ) : panel === "history" && bundle ? (
                  <FloatingPanel title="History" onClose={() => setPanel(null)}>
                    <HistoryList
                      bundle={bundle}
                      activeItemId={bundle.project.activeItemId}
                      switching={switching}
                      onSelect={(entry) => void activate(entry)}
                      onUseSource={
                        stage === "media" || stage === "image"
                          ? (asset) =>
                              sendPrompt(
                                asset.mimeType.startsWith("audio/") && stage === "media"
                                  ? `Use "${asset.name}" (fileId ${asset.itemId}) as the background music instead of the current track. Keep the speech clear.`
                                  : `Use "${asset.name}" (fileId ${asset.itemId}) as a reference for the next change to this ${preview?.mimeType.startsWith("image/") ? "image" : "clip"}: `,
                                asset.mimeType.startsWith("audio/") && stage === "media" ? "send" : "draft",
                              )
                          : undefined
                      }
                    />
                  </FloatingPanel>
                ) : panel === "tools" && bundle ? (
                  <FloatingPanel title="Creative tools" onClose={() => setPanel(null)}>
                    <p className="px-4 pb-3 text-xs leading-5 text-stone-500">
                      Agents use these when they create or edit media here.
                    </p>
                    <CreativeTools
                      value={(bundle.project.settings?.creativeDefaults as CreativeDefaults | undefined) ?? {}}
                      focusKind={mediaKind}
                      onSave={(next) => saveSettings({ creativeDefaults: next })}
                    />
                  </FloatingPanel>
                ) : null}
              </div>
            )}
          </div>
        </div>

        {/* Top right: view and file actions */}
        <div
          className="pointer-events-none absolute top-3 z-30 flex items-center gap-2 transition-[right] duration-200"
          style={{ right: chatInset + 12 }}
        >
          {stage && stage !== "sheet" && stage !== "none" && view === "preview" && (
            <ChromeGroup>
              <ChromeButton label="Zoom out" onClick={() => setZoom((value) => Math.max(0.5, +(value - 0.1).toFixed(2)))}>
                <Minus />
              </ChromeButton>
              <button
                type="button"
                onClick={() => setZoom(1)}
                className="h-8 min-w-12 rounded-lg px-1.5 text-xs tabular-nums text-stone-600 hover:bg-stone-100"
                aria-label="Reset zoom"
              >
                {Math.round(zoom * 100)}%
              </button>
              <ChromeButton label="Zoom in" onClick={() => setZoom((value) => Math.min(3, +(value + 0.1).toFixed(2)))}>
                <Plus />
              </ChromeButton>
            </ChromeGroup>
          )}
          <ChromeGroup>
            {!local && (
              <ChromeButton label="Copy share link" onClick={() => void share()} disabled={!preview}>
                <Share2 />
              </ChromeButton>
            )}
            <ChromeButton label="Download" onClick={exportFile} disabled={!preview?.download?.url && !preview?.inline?.url}>
              <Download />
            </ChromeButton>
            <ChromeButton label="Close" onClick={close}>
              <X />
            </ChromeButton>
          </ChromeGroup>
        </div>

        {/* Bottom: tools */}
        <div
          className="pointer-events-none absolute bottom-5 left-0 z-20 flex justify-center px-4 transition-[right,padding] duration-200"
          style={{ right: chatInset, paddingRight: Math.max(16, dockInset) }}
        >
          {preview && (
            <NotePalette
              tool={tool}
              tools={paletteTools}
              hint={paletteHint}
              actions={paletteActions}
              onTool={(next) => {
                setTool(next);
                setDraft(null);
                setOpenNote(null);
              }}
            />
          )}
        </div>

        {draft && (
          <NoteEditor
            key={`${draft.anchor.x}:${draft.anchor.y}`}
            anchor={draft.anchor}
            location={draftLocation(draft)}
            quote={draft.target.type === "text" ? draft.target.quote : draft.target.type === "source" ? draft.target.code.split("\n")[0] : undefined}
            saving={saving}
            allowEmpty={draft.target.type === "text"}
            onSave={(body) => void saveDraft(body)}
            onClose={() => setDraft(null)}
          />
        )}
        {shownNote && openNote && (
          <NoteEditor
            key={shownNote.annotationId}
            anchor={openNote.anchor}
            number={numberOf(shownNote.annotationId)}
            location={noteLocationLabel(shownNote)}
            quote={noteQuote(shownNote)}
            initialBody={shownNote.body}
            status={shownNote.status}
            attached={attachedIds.has(shownNote.annotationId)}
            onSave={(body) => void updateNote(shownNote, { body })}
            onClose={() => setOpenNote(null)}
            onAddToChat={() => addToChat([shownNote])}
            onToggleResolved={() =>
              void updateNote(shownNote, { status: shownNote.status === "resolved" ? "open" : "resolved" })
            }
            onDelete={() => void updateNote(shownNote, { deleted: true })}
          />
        )}
        <span className="sr-only" aria-live="polite">
          {saving ? "Saving note" : ""}
        </span>
      </div>
    </TooltipProvider>
  );
}

function draftLocation(draft: NoteDraft) {
  const target = draft.target;
  if (target.type === "cells") return `${target.sheet} ${target.range}`;
  if (target.type === "source") {
    return `${target.file.split("/").pop()} ${target.lineStart}${target.lineEnd !== target.lineStart ? `–${target.lineEnd}` : ""}`;
  }
  if (target.type === "element") {
    const element = target.elements[0];
    return element?.ariaLabel || element?.text?.slice(0, 40) || (element?.tag ? `<${element.tag}>` : "Element");
  }
  const page = "page" in target && target.page ? `${target.pageLabel === "slide" ? "Slide" : "Page"} ${target.page}` : "";
  if (typeof draft.startMs === "number" && target.type === "time") {
    const seconds = Math.floor(draft.startMs / 1000);
    return `At ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  }
  return page || (target.type === "region" ? "Area" : target.type === "point" ? "Point" : "Selection");
}

/** One-click requests that suit the open file, carried out by the agent. */
function actionsFor(
  stage: StageKind | null,
  preview: ArtifactPreview | null,
  send: (text: string, mode?: "send" | "draft") => void,
): PaletteAction[] {
  if (!preview) return [];
  const kind = artifactKind(preview);
  const ask = (text: string) => () => send(text, "send");
  if (stage === "image") {
    return [
      { id: "remove-background", label: "Remove background", icon: Eraser, onRun: ask("Remove the background from this image and keep the subject unchanged.") },
      { id: "expand", label: "Expand", icon: Maximize, onRun: ask("Expand this image to a wider frame, continuing the scene naturally at the edges.") },
    ];
  }
  if (stage === "media") {
    const video = preview.mimeType.startsWith("video/");
    return [
      {
        id: "tighten",
        label: video ? "Tighten pauses" : "Clean up pauses",
        icon: ScissorsLineDashed,
        onRun: ask(
          `Analyze this ${video ? "video" : "recording"} and remove long pauses, false starts and filler words so it flows naturally. Keep every important point and cut at natural sentence boundaries. Tell me what you removed, with times.`,
        ),
      },
      {
        id: "music",
        label: "Add music",
        icon: Music2,
        onRun: ask(
          `Generate three short instrumental background music options that fit the mood of this ${video ? "video" : "recording"}. Keep them with this artifact, add the best fit under the speech at a low volume with a gentle fade in and out, and tell me how the others differ so I can switch.`,
        ),
      },
    ];
  }
  if (isMermaid(preview)) {
    return [{ id: "tidy", label: "Tidy diagram", icon: Workflow, onRun: ask("Tidy this diagram: clear labels, consistent shapes and a readable layout, keeping its meaning. Save it as a new version.") }];
  }
  if (stage === "sheet") {
    return [{ id: "clean", label: "Clean data", icon: Table2, onRun: ask("Clean this spreadsheet: fix inconsistent formats, trim stray spaces and remove exact duplicate rows. List what changed and save it as a new version.") }];
  }
  if ((["pdf", "document", "text", "presentation"].includes(kind) || MARKDOWN.test(preview.name)) && stage !== "code") {
    return [
      { id: "proofread", label: "Proofread", icon: SpellCheck, onRun: ask("Proofread this file. Fix spelling, grammar and punctuation without changing the meaning, and save the result as a new version. List the changes.") },
      { id: "tighten", label: "Tighten", icon: ListCollapse, onRun: ask("Tighten the writing in this file: cut repetition and wordiness while keeping every point. Save it as a new version.") },
    ];
  }
  return [];
}

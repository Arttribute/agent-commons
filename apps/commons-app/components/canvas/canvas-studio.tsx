"use client";

import Link from "next/link";
import {
  AlertCircle,
  AudioLines,
  Bot,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Download,
  GitBranch,
  History,
  ImageIcon,
  Layers3,
  LibraryBig,
  Loader2,
  MapPin,
  MessageSquareText,
  Music2,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Pause,
  Play,
  Plus,
  Scan,
  Scissors,
  Search,
  Settings2,
  Share2,
  Sparkles,
  Trash2,
  Upload,
  Video,
  WandSparkles,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import {
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  LibraryPickerDialog,
  type LibraryPickerItem,
} from "@/components/sessions/chat/library-picker-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { openCommonsCopilotPrompt } from "@/lib/commons-copilot-events";
import {
  type CanvasAnnotation,
  type CanvasArtifact,
  type CanvasAnnotationKind,
  type CanvasPreview,
  type CanvasProjectBundle,
  type CanvasRevision,
  type CanvasTimeline,
  type CanvasTimelineClip,
  type MediaCatalog,
  type MediaJob,
  type MediaKind,
  type MediaModel,
  type MediaOperation,
  type MediaQuote,
  formatCanvasTime,
  unwrapCanvasPayload,
} from "@/lib/canvas";
import { cn } from "@/lib/utils";

type RightPanel = "project" | "notes" | "history";
type AnnotationTool = "select" | "region" | "point" | "time_range";
type Rect = { x: number; y: number; width: number; height: number };
type ContentBox = { left: number; top: number; width: number; height: number };

const KIND_OPTIONS: Array<{
  kind: MediaKind;
  label: string;
  icon: typeof ImageIcon;
}> = [
  { kind: "image", label: "Image", icon: ImageIcon },
  { kind: "video", label: "Video", icon: Video },
  { kind: "audio", label: "Speech", icon: AudioLines },
  { kind: "music", label: "Music", icon: Music2 },
];

export function CanvasStudio({ artifactId }: { artifactId: string }) {
  const [catalog, setCatalog] = useState<MediaCatalog | null>(null);
  const [bundle, setBundle] = useState<CanvasProjectBundle | null>(null);
  const [preview, setPreview] = useState<CanvasPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [error, setError] = useState("");
  const [kind, setKind] = useState<MediaKind>("image");
  const [modelId, setModelId] = useState("");
  const [quote, setQuote] = useState<MediaQuote | null>(null);
  const [operation, setOperation] = useState<MediaOperation>("transform");
  const [prompt, setPrompt] = useState("");
  const [settings, setSettings] = useState<Record<string, unknown>>({});
  const [references, setReferences] = useState<LibraryPickerItem[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const [rightPanel, setRightPanel] = useState<RightPanel>("project");
  const [currentJob, setCurrentJob] = useState<MediaJob | null>(null);
  const [lastJob, setLastJob] = useState<MediaJob | null>(null);
  const [generating, setGenerating] = useState(false);
  const [annotationTool, setAnnotationTool] =
    useState<AnnotationTool>("select");
  const [draftRect, setDraftRect] = useState<Rect | null>(null);
  const [draftPoint, setDraftPoint] = useState<{ x: number; y: number } | null>(
    null,
  );
  const [annotationBody, setAnnotationBody] = useState("");
  const [annotationSaving, setAnnotationSaving] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [currentTimeMs, setCurrentTimeMs] = useState(0);
  const [durationMs, setDurationMs] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [intrinsicSize, setIntrinsicSize] = useState<{ width: number; height: number } | null>(null);
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 });
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const mediaRef = useRef<HTMLMediaElement | null>(null);

  const loadProject = useCallback(
    async (projectId?: string) => {
      const response = projectId
        ? await fetch(`/api/canvas/projects/${encodeURIComponent(projectId)}`, {
            cache: "no-store",
          })
        : await fetch("/api/canvas/projects/open", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ artifactId }),
          });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(
          payload?.message || payload?.error || "Could not open this project",
        );
      }
      const next = unwrapCanvasPayload<CanvasProjectBundle>(payload);
      setBundle(next);
      return next;
    },
    [artifactId],
  );

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      fetch("/api/canvas/models", { cache: "no-store" }).then(async (response) => {
        const payload = await response.json().catch(() => null);
        if (!response.ok) throw new Error("Could not load creative models");
        return unwrapCanvasPayload<MediaCatalog>(payload);
      }),
      loadProject(),
    ])
      .then(([nextCatalog, nextBundle]) => {
        if (cancelled) return;
        setCatalog(nextCatalog);
        setBundle(nextBundle);
      })
      .catch((cause) => {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : "Canvas could not open");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [loadProject]);

  useEffect(() => {
    if (!bundle?.project.activeItemId) return;
    const controller = new AbortController();
    setIntrinsicSize(null);
    setPreviewLoading(true);
    fetch(
      `/api/library/${encodeURIComponent(bundle.project.activeItemId)}/preview`,
      { cache: "no-store", signal: controller.signal },
    )
      .then(async (response) => {
        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(payload?.message || "Could not preview this revision");
        }
        return unwrapCanvasPayload<CanvasPreview>(payload);
      })
      .then((next) => {
        setPreview(next);
        const previewKind = mediaKindFor(next.kind, next.mimeType);
        if (previewKind) setKind(previewKind);
      })
      .catch((cause) => {
        if (!controller.signal.aborted) {
          setError(cause instanceof Error ? cause.message : "Preview failed");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setPreviewLoading(false);
      });
    return () => controller.abort();
  }, [bundle?.project.activeItemId]);

  const models = useMemo(
    () => catalog?.models.filter((model) => model.kind === kind) ?? [],
    [catalog, kind],
  );
  const model = useMemo(
    () =>
      models.find((entry) => entry.modelKey === modelId) ??
      models.find(
        (entry) =>
          entry.available &&
          !entry.badges?.some((badge) => badge.toLowerCase().includes("retire")),
      ) ??
      models.find((entry) => entry.available) ??
      models[0],
    [modelId, models],
  );

  useEffect(() => {
    if (!model) return;
    setModelId(model.modelKey);
    setSettings(
      Object.fromEntries(
        model.settings
          .filter((field) => field.default !== undefined)
          .map((field) => [field.key, field.default]),
      ),
    );
    if (!model.operations.includes(operation)) {
      setOperation(model.operations[0] ?? "generate");
    }
  }, [model?.modelKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!model || !bundle) return;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      const inputItemIds = references.map((item) => item.itemId);
      if (operation === "transform" && bundle.project.activeItemId) inputItemIds.unshift(bundle.project.activeItemId);
      void fetch("/api/canvas/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          modelKey: model.modelKey,
          provider: model.provider,
          prompt,
          inputItemIds: [...new Set(inputItemIds)].slice(0, model.maxInputs),
          settings,
        }),
      }).then(async (response) => {
        const payload = await response.json().catch(() => null);
        if (!response.ok) throw new Error(payload?.message || "Quote unavailable");
        setQuote(unwrapCanvasPayload<MediaQuote>(payload));
      }).catch(() => {
        if (!controller.signal.aborted) setQuote(null);
      });
    }, 350);
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [bundle, model, operation, prompt, references, settings]);

  useEffect(() => {
    if (!currentJob || !["queued", "running"].includes(currentJob.status)) {
      return;
    }
    let stopped = false;
    let timeout: number | undefined;
    const poll = async () => {
      try {
        const response = await fetch(
          `/api/canvas/generations/${encodeURIComponent(currentJob.jobId)}`,
          { cache: "no-store" },
        );
        const payload = await response.json().catch(() => null);
        if (!response.ok) throw new Error(payload?.message || "Generation failed");
        const next = unwrapCanvasPayload<MediaJob>(payload);
        if (stopped) return;
        setCurrentJob(next);
        setLastJob(next);
        if (next.status === "completed") {
          await loadProject(bundle?.project.projectId);
          setGenerating(false);
          return;
        }
        if (next.status === "failed" || next.status === "cancelled") {
          setGenerating(false);
          return;
        }
        timeout = window.setTimeout(poll, 1_500);
      } catch (cause) {
        if (!stopped) {
          setError(cause instanceof Error ? cause.message : "Generation failed");
          setGenerating(false);
        }
      }
    };
    timeout = window.setTimeout(poll, 800);
    return () => {
      stopped = true;
      if (timeout) window.clearTimeout(timeout);
    };
  }, [currentJob?.jobId, currentJob?.status, bundle?.project.projectId, loadProject]);

  const activeRevision = useMemo(
    () =>
      bundle?.revisions.find(
        (revision) => revision.itemId === bundle.project.activeItemId,
      ) ?? bundle?.revisions[0],
    [bundle],
  );
  const activeAnnotations = useMemo(
    () =>
      bundle?.annotations.filter(
        (annotation) => annotation.revisionId === activeRevision?.revisionId,
      ) ?? [],
    [activeRevision?.revisionId, bundle?.annotations],
  );
  const annotationDraftOpen = Boolean(draftRect || draftPoint) || annotationTool === "time_range";
  const timeline = (bundle?.project.settings?.timeline ?? null) as CanvasTimeline | null;
  const visibleAnnotations = useMemo(
    () =>
      activeAnnotations.filter((annotation) => {
        if (!temporalAnnotation(annotation)) return true;
        return (
          currentTimeMs >= (annotation.startMs ?? 0) &&
          currentTimeMs <= (annotation.endMs ?? annotation.startMs ?? 0)
        );
      }),
    [activeAnnotations, currentTimeMs],
  );
  const contentBox = useMemo<ContentBox>(() => {
    if (!stageSize.width || !stageSize.height || !intrinsicSize) {
      return { left: 0, top: 0, width: stageSize.width, height: stageSize.height };
    }
    const scale = Math.min(
      stageSize.width / intrinsicSize.width,
      stageSize.height / intrinsicSize.height,
    );
    const width = intrinsicSize.width * scale;
    const height = intrinsicSize.height * scale;
    return {
      left: (stageSize.width - width) / 2,
      top: (stageSize.height - height) / 2,
      width,
      height,
    };
  }, [intrinsicSize, stageSize]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const update = () =>
      setStageSize({ width: stage.clientWidth, height: stage.clientHeight });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(stage);
    return () => observer.disconnect();
  }, [bundle?.project.projectId]);

  async function generate() {
    if (!model || !bundle || !prompt.trim()) return;
    setGenerating(true);
    setError("");
    const inputIds = references.map((item) => item.itemId);
    if (operation === "transform" && bundle.project.activeItemId) {
      inputIds.unshift(bundle.project.activeItemId);
    }
    const response = await fetch("/api/canvas/generations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId: bundle.project.projectId,
        provider: model.provider,
        modelKey: model.modelKey,
        operation,
        prompt: prompt.trim(),
        inputItemIds: [...new Set(inputIds)].slice(0, model.maxInputs),
        settings,
      }),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      setGenerating(false);
      setError(payload?.message || payload?.error || "Could not start generation");
      return;
    }
    const job = unwrapCanvasPayload<MediaJob>(payload);
    setCurrentJob(job);
    setLastJob(job);
  }

  async function activateRevision(revision: CanvasRevision) {
    if (!bundle || revision.itemId === bundle.project.activeItemId) return;
    const response = await fetch(
      `/api/canvas/projects/${encodeURIComponent(bundle.project.projectId)}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activeRevisionId: revision.revisionId }),
      },
    );
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      setError(payload?.message || "Could not switch revision");
      return;
    }
    await loadProject(bundle.project.projectId);
  }

  async function renameProject(name: string) {
    if (!bundle || !name.trim() || name.trim() === bundle.project.name) return;
    const response = await fetch(
      `/api/canvas/projects/${encodeURIComponent(bundle.project.projectId)}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      },
    );
    if (response.ok) await loadProject(bundle.project.projectId);
  }

  async function linkAssets(items: LibraryPickerItem[]) {
    if (!bundle || !items.length) return;
    setError("");
    try {
      await Promise.all(
        items.map(async (item) => {
          const response = await fetch(
            `/api/canvas/projects/${encodeURIComponent(bundle.project.projectId)}/assets`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ itemId: item.itemId }),
            },
          );
          const payload = await response.json().catch(() => null);
          if (!response.ok) {
            throw new Error(payload?.message || `Could not add ${item.name}`);
          }
        }),
      );
      const maximum = Math.max(
        0,
        (model?.maxInputs ?? 0) - (operation === "transform" ? 1 : 0),
      );
      setReferences((current) =>
        [...current, ...items]
          .filter(
            (item, index, all) =>
              all.findIndex((entry) => entry.itemId === item.itemId) === index,
          )
          .slice(0, maximum),
      );
      await loadProject(bundle.project.projectId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not add media");
    }
  }

  async function uploadProjectFiles(files: FileList | null) {
    if (!files?.length || !bundle) return;
    setUploading(true);
    setError("");
    try {
      const body = new FormData();
      [...files].forEach((file) => body.append("files", file));
      const response = await fetch("/api/files/upload", { method: "POST", body });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.message || payload?.error || "Upload failed");
      }
      const items = (Array.isArray(payload?.data) ? payload.data : [])
        .map((item: LibraryPickerItem & { fileId?: string }) => ({
          ...item,
          itemId: item.itemId ?? item.fileId ?? "",
        }))
        .filter((item: LibraryPickerItem) => Boolean(item.itemId));
      await linkAssets(items);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function timelineAction(
    action:
      | { action: "add_clip"; itemId: string; trackKind?: "video" | "audio"; durationMs?: number }
      | { action: "split_clip"; clipId: string; atMs: number }
      | { action: "delete_clip"; clipId: string },
  ) {
    if (!bundle) return;
    const response = await fetch(
      `/api/canvas/projects/${encodeURIComponent(bundle.project.projectId)}/timeline/actions`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(action),
      },
    );
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      setError(payload?.message || "Timeline edit failed");
      return;
    }
    if (action.action === "delete_clip") setSelectedClipId(null);
    await loadProject(bundle.project.projectId);
  }

  function stagePoint(event: ReactPointerEvent<HTMLDivElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    return {
      x: clamp((event.clientX - bounds.left) / bounds.width),
      y: clamp((event.clientY - bounds.top) / bounds.height),
    };
  }

  function onStagePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (annotationTool === "select" || annotationTool === "time_range") return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = stagePoint(event);
    if (annotationTool === "point") {
      setDraftPoint(point);
      setDraftRect(null);
      setRightPanel("notes");
      setRightOpen(true);
      return;
    }
    dragStartRef.current = point;
    setDraftPoint(null);
    setDraftRect({ x: point.x, y: point.y, width: 0, height: 0 });
  }

  function onStagePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (annotationTool !== "region" || !dragStartRef.current) return;
    const point = stagePoint(event);
    const start = dragStartRef.current;
    setDraftRect({
      x: Math.min(start.x, point.x),
      y: Math.min(start.y, point.y),
      width: Math.abs(point.x - start.x),
      height: Math.abs(point.y - start.y),
    });
  }

  function onStagePointerUp() {
    dragStartRef.current = null;
    setDraftRect((current) => {
      if (!current || current.width < 0.01 || current.height < 0.01) return null;
      setRightPanel("notes");
      setRightOpen(true);
      return current;
    });
  }

  async function saveAnnotation() {
    if (!bundle || !activeRevision || !annotationBody.trim()) return;
    let annotationKind: CanvasAnnotationKind = "comment";
    let geometry: Record<string, unknown> | undefined;
    let startMs: number | undefined;
    let endMs: number | undefined;
    if (draftRect) {
      annotationKind = "region";
      geometry = { ...draftRect, coordinateSpace: "artifact_content" };
    } else if (draftPoint) {
      annotationKind = "point";
      geometry = { ...draftPoint, coordinateSpace: "artifact_content" };
    } else if (annotationTool === "time_range") {
      annotationKind = "time_range";
      startMs = Math.round(currentTimeMs);
      endMs = Math.round(Math.min(durationMs || currentTimeMs + 5_000, currentTimeMs + 5_000));
    }
    if ((draftRect || draftPoint) && temporal) {
      startMs = Math.round(currentTimeMs);
      endMs = Math.round(currentTimeMs + 1000 / 30);
    }
    setAnnotationSaving(true);
    const response = await fetch(
      `/api/canvas/projects/${encodeURIComponent(bundle.project.projectId)}/annotations`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          revisionId: activeRevision.revisionId,
          kind: annotationKind,
          body: annotationBody.trim(),
          geometry,
          startMs,
          endMs,
          metadata: {
            schemaVersion: 1,
            coordinateSpace: geometry ? "artifact_content" : undefined,
            frameTimeMs: geometry && temporal ? Math.round(currentTimeMs) : undefined,
          },
        }),
      },
    );
    const payload = await response.json().catch(() => null);
    setAnnotationSaving(false);
    if (!response.ok) {
      setError(payload?.message || "Could not save annotation");
      return;
    }
    setAnnotationBody("");
    setDraftRect(null);
    setDraftPoint(null);
    setAnnotationTool("select");
    await loadProject(bundle.project.projectId);
  }

  async function resolveAnnotation(annotation: CanvasAnnotation) {
    if (!bundle) return;
    const response = await fetch(
      `/api/canvas/projects/${encodeURIComponent(bundle.project.projectId)}/annotations/${encodeURIComponent(annotation.annotationId)}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: annotation.status === "resolved" ? "open" : "resolved",
        }),
      },
    );
    if (response.ok) await loadProject(bundle.project.projectId);
  }

  function askCopilot(annotation?: CanvasAnnotation) {
    if (!bundle || !activeRevision) return;
    const artifact = activeRevision.artifact;
    openCommonsCopilotPrompt({
      mode: "draft",
      intentId: `canvas-${bundle.project.projectId}-${annotation?.annotationId ?? "project"}`,
      text: "",
      attachment: artifact
        ? {
            fileId: artifact.itemId,
            name: artifact.name,
            mimeType: artifact.mimeType,
            kind: artifact.kind,
            sizeBytes: artifact.sizeBytes,
            previewUrl: preview?.inline?.url,
          }
        : undefined,
      context: {
        resourceType: "canvas",
        resourceId: bundle.project.projectId,
        annotationId: annotation?.annotationId,
        routeName: "Canvas project",
      },
    });
  }

  function togglePlayback() {
    const media = mediaRef.current;
    if (!media) return;
    if (media.paused) void media.play();
    else media.pause();
  }

  if (loading) {
    return <CanvasLoading />;
  }

  if (!bundle) {
    return (
      <div className="flex h-full items-center justify-center bg-stone-100 p-8">
        <div className="max-w-md rounded-2xl border border-stone-200 bg-white p-8 text-center shadow-sm">
          <AlertCircle className="mx-auto h-7 w-7 text-rose-500" />
          <h1 className="mt-4 text-lg font-semibold text-stone-900">
            Canvas could not open
          </h1>
          <p className="mt-2 text-sm text-stone-500">{error}</p>
          <Button asChild variant="outline" className="mt-6">
            <Link href="/library">Back to Library</Link>
          </Button>
        </div>
      </div>
    );
  }

  const displayedJob = currentJob ?? lastJob ?? bundle.jobs[0] ?? null;
  const canGenerate = Boolean(model?.available && prompt.trim() && !generating);
  const estimatedCost = quote?.estimatedCostUsd ?? (model ? estimateCost(model, settings, prompt) : 0);
  const temporal = preview?.mimeType.startsWith("video/") || preview?.mimeType.startsWith("audio/");

  return (
    <div className="flex h-full min-w-0 flex-col overflow-hidden bg-[#f3f2ef] text-stone-900">
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-stone-200 bg-white px-3">
        <Button asChild variant="ghost" size="icon" className="h-9 w-9">
          <Link href="/library" aria-label="Back to Library">
            <ChevronLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="mx-1 h-5 w-px bg-stone-200" />
        <input
          key={bundle.project.name}
          defaultValue={bundle.project.name}
          aria-label="Project name"
          onBlur={(event) => void renameProject(event.currentTarget.value)}
          className="min-w-0 max-w-[340px] flex-1 truncate rounded-md border border-transparent bg-transparent px-2 py-1 text-sm font-semibold outline-none transition hover:border-stone-200 focus:border-stone-300 focus:bg-white"
        />
        <span className="hidden items-center gap-1.5 text-[11px] text-stone-400 sm:flex">
          <CheckCircle2 className="h-3.5 w-3.5" />
          Saved
        </span>
        <div className="ml-auto flex items-center gap-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9 gap-2"
            onClick={() => askCopilot()}
          >
            <Bot className="h-4 w-4" />
            <span className="hidden md:inline">Ask Copilot</span>
          </Button>
          <HeaderButton label="Share project" disabled>
            <Share2 />
          </HeaderButton>
          {preview?.download?.url ? (
            <a
              href={preview.download.url}
              download={preview.name}
              className="inline-flex h-9 items-center gap-2 rounded-lg bg-stone-900 px-3 text-xs font-medium text-white transition hover:bg-stone-800"
            >
              <Download className="h-4 w-4" />
              Export
            </a>
          ) : null}
        </div>
      </header>

      {error ? (
        <div className="flex h-9 shrink-0 items-center gap-2 border-b border-rose-200 bg-rose-50 px-4 text-xs text-rose-700">
          <AlertCircle className="h-3.5 w-3.5" />
          <span className="truncate">{error}</span>
          <button className="ml-auto" onClick={() => setError("")} aria-label="Dismiss error">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1">
        {leftOpen ? (
          <aside className="flex w-[310px] shrink-0 flex-col border-r border-stone-200 bg-white">
            <div className="flex items-start border-b border-stone-200 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-stone-900">Creative tools</p>
                <p className="mt-0.5 text-[11px] text-stone-500">
                  Generate or transform this project.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setLeftOpen(false)}
                className="rounded-md p-1 text-stone-400 hover:bg-stone-100 hover:text-stone-900"
                aria-label="Close creative tools"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              <FieldLabel>Model</FieldLabel>
              <ModelSelector
                catalog={catalog}
                selected={model}
                onSelect={(entry) => {
                  setKind(entry.kind);
                  setModelId(entry.modelKey);
                }}
              />
              {model ? (
                <div className="mt-2 rounded-lg bg-stone-50 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-stone-400">
                      {model.provider} · {model.tier}
                    </span>
                    <span className="text-right text-[10px] text-stone-500">
                      {quote ? `~${quote.estimatedCredits} credits` : `~$${estimatedCost.toFixed(3)}`}
                    </span>
                  </div>
                  <p className="mt-1.5 text-[11px] leading-4 text-stone-600">
                    {model.description}
                  </p>
                  <p className="mt-1 text-[9px] leading-3 text-stone-400">
                    ${estimatedCost.toFixed(4)} estimate · {model.pricing.settlement === "provider_usage" ? "final usage reconciled" : model.pricing.note}
                  </p>
                  {model.badges?.length ? (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {model.badges.map((badge) => (
                        <span key={badge} className="rounded-full border border-stone-200 bg-white px-2 py-0.5 text-[9px] text-stone-500">
                          {badge}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}

              {model?.operations.length && model.operations.length > 1 ? (
                <div className="mt-4 grid grid-cols-2 rounded-lg bg-stone-100 p-1">
                  {model.operations.map((entry) => (
                    <button
                      key={entry}
                      type="button"
                      onClick={() => setOperation(entry)}
                      className={cn(
                        "rounded-md px-2 py-1.5 text-xs font-medium capitalize",
                        operation === entry
                          ? "bg-white text-stone-900 shadow-sm"
                          : "text-stone-500",
                      )}
                    >
                      {entry === "transform" ? "Transform" : "Create new"}
                    </button>
                  ))}
                </div>
              ) : null}

              <FieldLabel className="mt-4">Prompt</FieldLabel>
              <Textarea
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                placeholder={promptPlaceholder(kind, operation)}
                className="mt-1.5 min-h-[112px] resize-y rounded-xl border-stone-200 text-sm leading-5"
              />

              {model?.maxInputs ? (
                <div className="mt-4">
                  <div className="flex items-center justify-between">
                    <FieldLabel>References</FieldLabel>
                    <span className="text-[10px] text-stone-400">
                      {references.length}/{Math.max(0, model.maxInputs - (operation === "transform" ? 1 : 0))}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setPickerOpen(true)}
                    className="mt-1.5 flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-stone-300 px-3 py-2.5 text-xs text-stone-500 transition hover:border-stone-400 hover:bg-stone-50 hover:text-stone-800"
                  >
                    <LibraryBig className="h-4 w-4" />
                    Add from Library
                  </button>
                  {references.length ? (
                    <div className="mt-2 space-y-1.5">
                      {references.map((item) => (
                        <div key={item.itemId} className="flex items-center gap-2 rounded-lg bg-stone-50 p-2">
                          {item.previewUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={item.previewUrl} alt="" className="h-8 w-8 rounded object-cover" />
                          ) : (
                            <span className="flex h-8 w-8 items-center justify-center rounded bg-stone-200">
                              <ImageIcon className="h-3.5 w-3.5 text-stone-500" />
                            </span>
                          )}
                          <span className="min-w-0 flex-1 truncate text-[11px] text-stone-700">{item.name}</span>
                          <button
                            type="button"
                            onClick={() => setReferences((current) => current.filter((entry) => entry.itemId !== item.itemId))}
                            aria-label={`Remove ${item.name}`}
                          >
                            <X className="h-3.5 w-3.5 text-stone-400" />
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}

              {model?.settings.length ? (
                <div className="mt-5 border-t border-stone-200 pt-4">
                  <div className="flex items-center gap-2">
                    <Settings2 className="h-3.5 w-3.5 text-stone-400" />
                    <FieldLabel>Settings</FieldLabel>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2.5">
                    {model.settings.map((field) => (
                      <label key={field.key} className={field.type === "text" ? "col-span-2" : ""}>
                        <span className="text-[10px] font-medium text-stone-500">{field.label}</span>
                        {field.type === "select" ? (
                          <select
                            value={String(settings[field.key] ?? field.default ?? "")}
                            onChange={(event) => setSettings((current) => ({ ...current, [field.key]: event.target.value }))}
                            className="mt-1 h-9 w-full rounded-lg border border-stone-200 bg-white px-2 text-xs outline-none focus:border-stone-400"
                          >
                            {field.options?.map((option) => (
                              <option key={option.value} value={option.value}>{option.label}</option>
                            ))}
                          </select>
                        ) : field.type === "boolean" ? (
                          <input
                            type="checkbox"
                            checked={Boolean(settings[field.key] ?? field.default)}
                            onChange={(event) => setSettings((current) => ({ ...current, [field.key]: event.target.checked }))}
                            className="mt-2 block"
                          />
                        ) : (
                          <Input
                            type={field.type === "number" ? "number" : "text"}
                            value={String(settings[field.key] ?? field.default ?? "")}
                            min={field.min}
                            max={field.max}
                            step={field.step}
                            onChange={(event) => setSettings((current) => ({
                              ...current,
                              [field.key]: field.type === "number" ? Number(event.target.value) : event.target.value,
                            }))}
                            className="mt-1 h-9 text-xs"
                          />
                        )}
                      </label>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
            <div className="border-t border-stone-200 bg-white p-3">
              {displayedJob && ["queued", "running"].includes(displayedJob.status) ? (
                <JobProgress job={displayedJob} />
              ) : displayedJob?.status === "failed" ? (
                <p className="mb-2 line-clamp-2 text-[10px] text-rose-600">{displayedJob.errorMessage}</p>
              ) : null}
              <Button
                type="button"
                onClick={() => void generate()}
                disabled={!canGenerate}
                className="h-11 w-full gap-2 rounded-xl bg-stone-900 text-white hover:bg-stone-800"
              >
                {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                {generating ? "Creating revision…" : operation === "transform" ? "Transform artifact" : "Generate"}
              </Button>
              {model && !model.available ? (
                <p className="mt-2 text-center text-[10px] text-amber-700">
                  {model.unavailableReason === "price_not_configured"
                    ? "This provider model needs an approved price override before billing can be enabled."
                    : `Configure ${model.provider === "openai" ? "OPENAI_API_KEY" : model.provider === "google" ? "GOOGLE_API_KEY" : model.provider === "kling" ? "KLING_ACCESS_KEY and KLING_SECRET_KEY" : "BYTEPLUS_ARK_API_KEY"} on staging to enable this model.`}
                </p>
              ) : null}
              <p className="mt-2 text-center text-[9px] leading-3 text-stone-400">
                {quote
                  ? `Up to ${quote.estimatedCredits} credits reserved · unused credits released after settlement.`
                  : "Outputs become private Library revisions with a provenance record."}
              </p>
            </div>
          </aside>
        ) : null}

        <main className="flex min-w-0 flex-1 flex-col">
          <div className="flex h-11 shrink-0 items-center justify-center gap-1 border-b border-stone-200 bg-white/80 px-3 backdrop-blur">
            <CanvasTool active={annotationTool === "select"} label="Select" onClick={() => setAnnotationTool("select")}>
              <Scan />
            </CanvasTool>
            <CanvasTool active={annotationTool === "region"} label="Region" onClick={() => setAnnotationTool("region")}>
              <MessageSquareText />
            </CanvasTool>
            <CanvasTool active={annotationTool === "point"} label="Point" onClick={() => setAnnotationTool("point")}>
              <MapPin />
            </CanvasTool>
            {temporal ? (
              <CanvasTool active={annotationTool === "time_range"} label="Time note" onClick={() => { setAnnotationTool("time_range"); setRightOpen(true); setRightPanel("notes"); }}>
                <Clock3 />
              </CanvasTool>
            ) : null}
            <div className="mx-1 h-5 w-px bg-stone-200" />
            <CanvasTool label="Zoom out" onClick={() => setZoom((value) => Math.max(0.25, value - 0.25))}>
              <ZoomOut />
            </CanvasTool>
            <button type="button" onClick={() => setZoom(1)} className="min-w-12 rounded-md px-2 py-1 text-[10px] text-stone-500 hover:bg-stone-100">
              {Math.round(zoom * 100)}%
            </button>
            <CanvasTool label="Zoom in" onClick={() => setZoom((value) => Math.min(4, value + 0.25))}>
              <ZoomIn />
            </CanvasTool>
          </div>

          <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-auto p-6 lg:p-8">
            <div
              className={cn(
                "relative flex aspect-video w-full max-w-5xl shrink-0 items-center justify-center overflow-hidden rounded-xl border border-stone-300 bg-[#171717] shadow-[0_24px_80px_rgba(28,25,23,0.18)] transition-transform",
                annotationTool !== "select" && "cursor-crosshair",
              )}
              style={{ transform: `scale(${zoom})` }}
              ref={stageRef}
            >
              {previewLoading ? (
                <div className="flex flex-col items-center gap-2 text-stone-400">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span className="text-xs">Preparing revision…</span>
                </div>
              ) : preview ? (
                <ArtifactStage
                  preview={preview}
                  mediaRef={mediaRef}
                  onIntrinsicSize={(width, height) =>
                    setIntrinsicSize({ width, height })
                  }
                  onTime={(time, duration, isPlaying) => {
                    setCurrentTimeMs(time);
                    setDurationMs(duration);
                    setPlaying(isPlaying);
                  }}
                />
              ) : (
                <span className="text-xs text-stone-400">No preview available</span>
              )}

              <div
                className={cn(
                  "absolute",
                  annotationTool === "select" ? "pointer-events-none" : "cursor-crosshair",
                )}
                style={contentBox}
                onPointerDown={onStagePointerDown}
                onPointerMove={onStagePointerMove}
                onPointerUp={onStagePointerUp}
              >
                {visibleAnnotations.map((annotation, index) => (
                  <AnnotationOverlay key={annotation.annotationId} annotation={annotation} index={index + 1} />
                ))}
                {draftRect ? <DraftRect rect={draftRect} /> : null}
                {draftPoint ? <DraftPoint point={draftPoint} /> : null}
              </div>
            </div>
            {!leftOpen ? (
              <button type="button" onClick={() => setLeftOpen(true)} className="absolute left-3 top-3 flex h-9 w-9 items-center justify-center rounded-lg border border-stone-200 bg-white text-stone-500 shadow-sm hover:text-stone-900" aria-label="Show creative controls">
                <PanelLeftOpen className="h-4 w-4" />
              </button>
            ) : null}
            {!rightOpen ? (
              <button type="button" onClick={() => setRightOpen(true)} className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-lg border border-stone-200 bg-white text-stone-500 shadow-sm hover:text-stone-900" aria-label="Show project panel">
                <PanelRightOpen className="h-4 w-4" />
              </button>
            ) : null}
          </div>

          <section className="h-[150px] shrink-0 border-t border-stone-200 bg-white">
            {temporal ? (
              <TemporalTimeline
                currentTimeMs={currentTimeMs}
                durationMs={durationMs}
                playing={playing}
                annotations={activeAnnotations}
                timeline={timeline}
                assets={bundle.assets}
                activeItemId={bundle.project.activeItemId}
                selectedClipId={selectedClipId}
                onSelectClip={setSelectedClipId}
                onAddClip={(item) =>
                  void timelineAction({
                    action: "add_clip",
                    itemId: item.itemId,
                    trackKind: item.mimeType.startsWith("audio/") ? "audio" : "video",
                    durationMs: item.itemId === bundle.project.activeItemId ? durationMs : 5_000,
                  })
                }
                onSplit={() =>
                  selectedClipId
                    ? void timelineAction({
                        action: "split_clip",
                        clipId: selectedClipId,
                        atMs: Math.round(currentTimeMs),
                      })
                    : undefined
                }
                onDelete={() =>
                  selectedClipId
                    ? void timelineAction({ action: "delete_clip", clipId: selectedClipId })
                    : undefined
                }
                onToggle={togglePlayback}
                onSeek={(value) => {
                  if (mediaRef.current) mediaRef.current.currentTime = value / 1000;
                  setCurrentTimeMs(value);
                }}
              />
            ) : (
              <RevisionStrip
                revisions={bundle.revisions}
                activeItemId={bundle.project.activeItemId}
                onSelect={(revision) => void activateRevision(revision)}
              />
            )}
          </section>
        </main>

        {rightOpen ? (
          <aside className="flex w-[320px] shrink-0 border-l border-stone-200 bg-white">
            <div className="flex w-12 shrink-0 flex-col items-center gap-1 border-r border-stone-200 py-2">
              <RailButton active={rightPanel === "project"} label="Project" onClick={() => setRightPanel("project")}>
                <Layers3 />
              </RailButton>
              <RailButton active={rightPanel === "notes"} label="Notes" badge={activeAnnotations.filter((item) => item.status === "open").length} onClick={() => setRightPanel("notes")}>
                <MessageSquareText />
              </RailButton>
              <RailButton active={rightPanel === "history"} label="History" onClick={() => setRightPanel("history")}>
                <History />
              </RailButton>
              <div className="mt-auto">
                <RailButton label="Ask Copilot" onClick={() => askCopilot()}>
                  <Bot />
                </RailButton>
              </div>
            </div>
            <div className="flex min-w-0 flex-1 flex-col">
              <div className="flex h-12 shrink-0 items-center border-b border-stone-200 px-4">
                <h2 className="text-xs font-semibold capitalize text-stone-900">{rightPanel}</h2>
                <button type="button" onClick={() => setRightOpen(false)} className="ml-auto text-stone-400 hover:text-stone-900" aria-label="Close panel">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto">
                {rightPanel === "project" ? (
                  <ProjectPanel
                    bundle={bundle}
                    activeRevision={activeRevision}
                    uploading={uploading}
                    onSelect={(revision) => void activateRevision(revision)}
                    onUpload={() => fileInputRef.current?.click()}
                    onLibrary={() => setPickerOpen(true)}
                  />
                ) : rightPanel === "notes" ? (
                  <NotesPanel
                    annotations={activeAnnotations}
                    annotationTool={annotationTool}
                    draftOpen={annotationDraftOpen}
                    currentTimeMs={currentTimeMs}
                    body={annotationBody}
                    saving={annotationSaving}
                    onBodyChange={setAnnotationBody}
                    onSave={() => void saveAnnotation()}
                    onCancel={() => {
                      setDraftRect(null);
                      setDraftPoint(null);
                      setAnnotationBody("");
                      setAnnotationTool("select");
                    }}
                    onResolve={(annotation) => void resolveAnnotation(annotation)}
                    onAsk={askCopilot}
                  />
                ) : (
                  <HistoryPanel revisions={bundle.revisions} jobs={bundle.jobs} />
                )}
              </div>
            </div>
          </aside>
        ) : null}
      </div>

      <LibraryPickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        attachedFileIds={references.map((item) => item.itemId)}
        onAdd={(items) => void linkAssets(items)}
      />
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        accept="image/*,video/*,audio/*,.pdf,.txt,.md,.doc,.docx"
        onChange={(event) => void uploadProjectFiles(event.target.files)}
      />
    </div>
  );
}

export function ModelSelector({
  catalog,
  selected,
  onSelect,
}: {
  catalog: MediaCatalog | null;
  selected?: MediaModel;
  onSelect: (model: MediaModel) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return catalog?.models ?? [];
    return (catalog?.models ?? []).filter((model) =>
      [
        model.displayName,
        model.modelId,
        model.provider,
        model.kind,
        model.description,
        ...(model.badges ?? []),
      ]
        .join(" ")
        .toLowerCase()
        .includes(needle),
    );
  }, [catalog?.models, query]);
  const SelectedIcon = KIND_OPTIONS.find((entry) => entry.kind === selected?.kind)?.icon ?? Sparkles;

  return (
    <div className="relative mt-1.5">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex min-h-12 w-full items-center gap-3 rounded-xl border border-stone-200 bg-white px-3 py-2 text-left transition hover:border-stone-300"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-stone-100 text-stone-600">
          <SelectedIcon className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs font-semibold text-stone-800">
            {selected?.displayName || "Choose a model"}
          </span>
          <span className="block truncate text-[9px] capitalize text-stone-400">
            {selected ? `${selected.provider} · ${selected.kind} · ${selected.tier}` : "Search every media provider"}
          </span>
        </span>
        <ChevronDown className={cn("h-4 w-4 text-stone-400 transition", open && "rotate-180")} />
      </button>
      {open ? (
        <div className="absolute left-0 top-[calc(100%+6px)] z-50 w-[340px] overflow-hidden rounded-xl border border-stone-200 bg-white shadow-2xl">
          <div className="border-b border-stone-100 p-2">
            <div className="flex items-center gap-2 rounded-lg bg-stone-100 px-2.5">
              <Search className="h-3.5 w-3.5 text-stone-400" />
              <input
                autoFocus
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search model, provider, or capability…"
                className="h-9 min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-stone-400"
              />
              <button type="button" onClick={() => setOpen(false)} aria-label="Close model selector">
                <X className="h-3.5 w-3.5 text-stone-400" />
              </button>
            </div>
          </div>
          <div className="max-h-[360px] overflow-y-auto p-1.5">
            {KIND_OPTIONS.map((group) => {
              const entries = filtered.filter((model) => model.kind === group.kind);
              if (!entries.length) return null;
              const Icon = group.icon;
              return (
                <div key={group.kind} className="mb-2 last:mb-0">
                  <div className="flex items-center gap-1.5 px-2 py-1.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-stone-400">
                    <Icon className="h-3 w-3" /> {group.label}
                  </div>
                  {entries.map((entry) => (
                    <button
                      key={entry.modelKey}
                      type="button"
                      role="option"
                      aria-selected={entry.modelKey === selected?.modelKey}
                      onClick={() => {
                        onSelect(entry);
                        setOpen(false);
                        setQuery("");
                      }}
                      className={cn(
                        "flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition hover:bg-stone-100",
                        entry.modelKey === selected?.modelKey && "bg-stone-100",
                        !entry.available && "opacity-60",
                      )}
                    >
                      <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", entry.available ? "bg-emerald-500" : "bg-stone-300")} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center justify-between gap-2">
                          <span className="truncate text-[11px] font-medium text-stone-800">{entry.displayName}</span>
                          <span className="shrink-0 text-[9px] capitalize text-stone-400">{entry.provider}</span>
                        </span>
                        <span className="mt-0.5 block line-clamp-2 text-[9px] leading-3 text-stone-500">{entry.description}</span>
                        {!entry.available ? (
                          <span className="mt-1 block text-[8px] text-amber-700">
                            {entry.unavailableReason === "price_not_configured" ? "Pricing approval required" : "Provider key required"}
                          </span>
                        ) : null}
                      </span>
                    </button>
                  ))}
                </div>
              );
            })}
            {!filtered.length ? (
              <p className="px-3 py-8 text-center text-xs text-stone-400">No models match “{query}”.</p>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ArtifactStage({
  preview,
  mediaRef,
  onTime,
  onIntrinsicSize,
}: {
  preview: CanvasPreview;
  mediaRef: React.MutableRefObject<HTMLMediaElement | null>;
  onTime: (timeMs: number, durationMs: number, playing: boolean) => void;
  onIntrinsicSize: (width: number, height: number) => void;
}) {
  const source = preview.inline?.url || preview.download?.url;
  const bindMedia = {
    onTimeUpdate: (event: React.SyntheticEvent<HTMLMediaElement>) => {
      const media = event.currentTarget;
      onTime(media.currentTime * 1000, (media.duration || 0) * 1000, !media.paused);
    },
    onDurationChange: (event: React.SyntheticEvent<HTMLMediaElement>) => {
      const media = event.currentTarget;
      onTime(media.currentTime * 1000, (media.duration || 0) * 1000, !media.paused);
    },
    onPlay: (event: React.SyntheticEvent<HTMLMediaElement>) => {
      const media = event.currentTarget;
      onTime(media.currentTime * 1000, (media.duration || 0) * 1000, true);
    },
    onPause: (event: React.SyntheticEvent<HTMLMediaElement>) => {
      const media = event.currentTarget;
      onTime(media.currentTime * 1000, (media.duration || 0) * 1000, false);
    },
  };
  if (!source) {
    return <div className="max-w-lg whitespace-pre-wrap p-8 text-sm text-stone-200">{preview.content || preview.textPreview || "No inline preview is available."}</div>;
  }
  if (preview.mimeType.startsWith("image/")) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={source}
        alt={preview.name}
        draggable={false}
        onLoad={(event) =>
          onIntrinsicSize(event.currentTarget.naturalWidth, event.currentTarget.naturalHeight)
        }
        className="h-full w-full select-none object-contain"
      />
    );
  }
  if (preview.mimeType.startsWith("video/")) {
    return (
      <video
        ref={(node) => { mediaRef.current = node; }}
        src={source}
        className="h-full w-full object-contain"
        controls={false}
        playsInline
        onLoadedMetadata={(event) => {
          const media = event.currentTarget;
          onIntrinsicSize(media.videoWidth || 16, media.videoHeight || 9);
          onTime(media.currentTime * 1000, (media.duration || 0) * 1000, !media.paused);
        }}
        {...bindMedia}
      />
    );
  }
  if (preview.mimeType.startsWith("audio/")) {
    return (
      <div className="flex w-full max-w-xl flex-col items-center px-10 text-center text-white">
        <div className="flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-cyan-400 shadow-xl">
          <AudioLines className="h-10 w-10" />
        </div>
        <p className="mt-5 max-w-full truncate text-sm font-medium">{preview.name}</p>
        <div className="mt-6 flex h-16 w-full items-end justify-center gap-1 opacity-50">
          {Array.from({ length: 52 }, (_, index) => (
            <span key={index} className="w-1 rounded-full bg-white" style={{ height: `${20 + ((index * 29) % 45)}%` }} />
          ))}
        </div>
        <audio
          ref={(node) => { mediaRef.current = node; }}
          src={source}
          className="hidden"
          {...bindMedia}
        />
      </div>
    );
  }
  return <iframe src={source} title={preview.name} className="h-full w-full border-0 bg-white" />;
}

function AnnotationOverlay({ annotation, index }: { annotation: CanvasAnnotation; index: number }) {
  const geometry = annotation.geometry as Partial<Rect & { x: number; y: number }> | null;
  if (!geometry) return null;
  if (annotation.kind === "point" && geometry.x !== undefined && geometry.y !== undefined) {
    return (
      <span className="absolute flex h-6 w-6 -translate-x-1/2 -translate-y-full items-center justify-center rounded-full border-2 border-white bg-amber-500 text-[9px] font-bold text-white shadow" style={{ left: `${geometry.x * 100}%`, top: `${geometry.y * 100}%` }}>
        {index}
      </span>
    );
  }
  if (annotation.kind === "region" && geometry.x !== undefined && geometry.y !== undefined && geometry.width !== undefined && geometry.height !== undefined) {
    return (
      <span className={cn("absolute border-2", annotation.status === "resolved" ? "border-emerald-400/70 bg-emerald-300/10" : "border-amber-400 bg-amber-300/10")} style={{ left: `${geometry.x * 100}%`, top: `${geometry.y * 100}%`, width: `${geometry.width * 100}%`, height: `${geometry.height * 100}%` }}>
        <span className="absolute -right-3 -top-3 flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-amber-500 text-[9px] font-bold text-white shadow">{index}</span>
      </span>
    );
  }
  return null;
}

function DraftRect({ rect }: { rect: Rect }) {
  return <span className="absolute border-2 border-cyan-400 bg-cyan-300/10" style={{ left: `${rect.x * 100}%`, top: `${rect.y * 100}%`, width: `${rect.width * 100}%`, height: `${rect.height * 100}%` }} />;
}

function DraftPoint({ point }: { point: { x: number; y: number } }) {
  return <span className="absolute h-7 w-7 -translate-x-1/2 -translate-y-full rounded-full border-2 border-white bg-cyan-500 shadow" style={{ left: `${point.x * 100}%`, top: `${point.y * 100}%` }} />;
}

function NotesPanel({
  annotations,
  annotationTool,
  draftOpen,
  currentTimeMs,
  body,
  saving,
  onBodyChange,
  onSave,
  onCancel,
  onResolve,
  onAsk,
}: {
  annotations: CanvasAnnotation[];
  annotationTool: AnnotationTool;
  draftOpen: boolean;
  currentTimeMs: number;
  body: string;
  saving: boolean;
  onBodyChange: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
  onResolve: (annotation: CanvasAnnotation) => void;
  onAsk: (annotation: CanvasAnnotation) => void;
}) {
  return (
    <div className="p-3">
      {draftOpen ? (
        <div className="mb-3 rounded-xl border border-cyan-200 bg-cyan-50/60 p-3">
          <div className="flex items-center gap-2 text-[11px] font-semibold text-cyan-900">
            {annotationTool === "time_range" ? <Clock3 className="h-3.5 w-3.5" /> : annotationTool === "point" ? <MapPin className="h-3.5 w-3.5" /> : <MessageSquareText className="h-3.5 w-3.5" />}
            {annotationTool === "time_range" ? `Note at ${formatCanvasTime(currentTimeMs)}` : "Add annotation"}
          </div>
          <Textarea autoFocus value={body} onChange={(event) => onBodyChange(event.target.value)} placeholder="What should collaborators or agents understand here?" className="mt-2 min-h-[88px] resize-none border-cyan-200 bg-white text-xs" />
          <div className="mt-2 flex justify-end gap-1.5">
            <Button type="button" variant="ghost" size="sm" className="h-8 text-xs" onClick={onCancel}>Cancel</Button>
            <Button type="button" size="sm" className="h-8 gap-1.5 bg-stone-900 text-xs" disabled={!body.trim() || saving} onClick={onSave}>
              {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
              Save note
            </Button>
          </div>
        </div>
      ) : (
        <div className="mb-3 rounded-lg border border-dashed border-stone-200 p-3 text-[10px] leading-4 text-stone-500">
          Choose Region, Point, or Time note above to give humans and agents exact context.
        </div>
      )}
      <div className="space-y-2">
        {annotations.length ? annotations.map((annotation, index) => (
          <article
            key={annotation.annotationId}
            draggable
            onDragStart={(event) => {
              const context = { type: "canvas_annotation", annotationId: annotation.annotationId, body: annotation.body, target: annotationLocation(annotation) };
              event.dataTransfer.setData("application/x-agent-commons-canvas-context", JSON.stringify(context));
              event.dataTransfer.setData("text/plain", `Canvas annotation: ${annotation.body}\n${annotationLocation(annotation)}`);
            }}
            className={cn("group rounded-xl border p-3 transition", annotation.status === "resolved" ? "border-stone-200 bg-stone-50 opacity-65" : "border-stone-200 bg-white hover:border-stone-300 hover:shadow-sm")}
          >
            <div className="flex items-start gap-2">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-100 text-[9px] font-bold text-amber-800">{index + 1}</span>
              <div className="min-w-0 flex-1">
                <p className={cn("text-[11px] leading-4 text-stone-700", annotation.status === "resolved" && "line-through")}>{annotation.body}</p>
                <p className="mt-1 text-[9px] text-stone-400">{annotationLocation(annotation) || "Whole revision"} · {relativeDate(annotation.createdAt)}</p>
              </div>
            </div>
            <div className="mt-2 flex justify-end gap-1 opacity-0 transition group-hover:opacity-100">
              <button type="button" onClick={() => onAsk(annotation)} className="rounded-md px-2 py-1 text-[9px] text-stone-500 hover:bg-stone-100 hover:text-stone-900">Ask Copilot</button>
              <button type="button" onClick={() => onResolve(annotation)} className="rounded-md px-2 py-1 text-[9px] text-stone-500 hover:bg-stone-100 hover:text-stone-900">{annotation.status === "resolved" ? "Reopen" : "Resolve"}</button>
            </div>
          </article>
        )) : (
          <div className="py-10 text-center">
            <MessageSquareText className="mx-auto h-6 w-6 text-stone-300" />
            <p className="mt-2 text-xs font-medium text-stone-600">No annotations yet</p>
            <p className="mt-1 text-[10px] text-stone-400">Mark a precise place or moment.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function ProjectPanel({
  bundle,
  activeRevision,
  uploading,
  onSelect,
  onUpload,
  onLibrary,
}: {
  bundle: CanvasProjectBundle;
  activeRevision?: CanvasRevision;
  uploading: boolean;
  onSelect: (revision: CanvasRevision) => void;
  onUpload: () => void;
  onLibrary: () => void;
}) {
  return (
    <div className="p-3">
      <div className="rounded-xl border border-stone-200 bg-stone-50 p-3">
        <p className="truncate text-xs font-semibold text-stone-800">{bundle.project.name}</p>
        <p className="mt-1 text-[10px] text-stone-500">{bundle.revisions.length} revision{bundle.revisions.length === 1 ? "" : "s"} · {bundle.annotations.length} note{bundle.annotations.length === 1 ? "" : "s"}</p>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button type="button" onClick={onUpload} disabled={uploading} className="flex h-9 items-center justify-center gap-1.5 rounded-lg border border-stone-200 text-[10px] font-medium text-stone-600 hover:bg-stone-50 disabled:opacity-50">
          {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />} Upload
        </button>
        <button type="button" onClick={onLibrary} className="flex h-9 items-center justify-center gap-1.5 rounded-lg border border-stone-200 text-[10px] font-medium text-stone-600 hover:bg-stone-50">
          <LibraryBig className="h-3.5 w-3.5" /> Library
        </button>
      </div>
      <div className="mt-4 flex items-center justify-between">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-stone-400">Artifacts</p>
        <button type="button" onClick={onUpload} className="text-stone-400 hover:text-stone-900" aria-label="Add artifact"><Plus className="h-3.5 w-3.5" /></button>
      </div>
      <div className="mt-2 space-y-1">
        {bundle.revisions.map((revision) => (
          <button key={revision.revisionId} type="button" onClick={() => onSelect(revision)} className={cn("flex w-full items-center gap-2 rounded-lg border px-2.5 py-2 text-left", revision.revisionId === activeRevision?.revisionId ? "border-stone-300 bg-stone-100" : "border-transparent hover:bg-stone-50")}>
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-white text-stone-500 shadow-sm"><ArtifactKindIcon kind={revision.artifact?.kind} /></span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[11px] font-medium text-stone-700">{revision.artifact?.name || "Artifact revision"}</span>
              <span className="block truncate text-[9px] capitalize text-stone-400">{revision.operation} · {revision.modelId || revision.createdByType}</span>
            </span>
            {revision.revisionId === activeRevision?.revisionId ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : null}
          </button>
        ))}
      </div>
      {bundle.assets.length > bundle.revisions.length ? (
        <div className="mt-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-stone-400">Project media</p>
          <div className="mt-2 space-y-1">
            {bundle.assets
              .filter((asset) => !bundle.revisions.some((revision) => revision.itemId === asset.itemId))
              .map((asset) => (
                <div key={asset.itemId} className="flex items-center gap-2 rounded-lg px-2.5 py-2 hover:bg-stone-50">
                  <span className="flex h-7 w-7 items-center justify-center rounded-md bg-stone-100 text-stone-500"><ArtifactKindIcon kind={asset.kind} /></span>
                  <span className="min-w-0 flex-1 truncate text-[10px] text-stone-600">{asset.name}</span>
                </div>
              ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function HistoryPanel({ revisions, jobs }: { revisions: CanvasRevision[]; jobs: MediaJob[] }) {
  const jobsByOutput = new Map(jobs.filter((job) => job.outputItemId).map((job) => [job.outputItemId, job]));
  return (
    <div className="p-4">
      <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
        <div className="flex items-center gap-2 text-[11px] font-semibold text-emerald-800"><GitBranch className="h-3.5 w-3.5" /> Provenance active</div>
        <p className="mt-1 text-[9px] leading-4 text-emerald-700">Every model action creates a traceable, non-destructive revision. Prompts are stored privately and exposed here only by hash.</p>
      </div>
      <div className="relative space-y-0 before:absolute before:bottom-3 before:left-[9px] before:top-3 before:w-px before:bg-stone-200">
        {revisions.map((revision) => {
          const job = jobsByOutput.get(revision.itemId);
          return (
            <div key={revision.revisionId} className="relative flex gap-3 pb-5">
              <span className="z-10 mt-1.5 h-[19px] w-[19px] shrink-0 rounded-full border-4 border-white bg-stone-400" />
              <div className="min-w-0">
                <p className="truncate text-[11px] font-medium capitalize text-stone-700">{revision.operation} {revision.artifact?.kind || "artifact"}</p>
                <p className="mt-0.5 truncate text-[9px] text-stone-400">{revision.modelId || "Imported"} · {relativeDate(revision.createdAt)}</p>
                {revision.promptHash ? <p className="mt-1 truncate font-mono text-[8px] text-stone-400">{revision.promptHash.slice(0, 24)}…</p> : null}
                {job?.actualCostUsd ? <p className="mt-1 text-[9px] text-stone-400">${Number(job.actualCostUsd).toFixed(3)} · {job.status}</p> : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function RevisionStrip({ revisions, activeItemId, onSelect }: { revisions: CanvasRevision[]; activeItemId: string; onSelect: (revision: CanvasRevision) => void }) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-8 items-center border-b border-stone-100 px-4">
        <GitBranch className="mr-2 h-3.5 w-3.5 text-stone-400" />
        <span className="text-[10px] font-semibold text-stone-600">Revision history</span>
        <span className="ml-2 text-[9px] text-stone-400">Non-destructive</span>
      </div>
      <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto px-4 py-3">
        {[...revisions].reverse().map((revision, index) => (
          <button key={revision.revisionId} type="button" onClick={() => onSelect(revision)} className={cn("group flex h-[88px] w-40 shrink-0 flex-col overflow-hidden rounded-lg border bg-white text-left transition", revision.itemId === activeItemId ? "border-stone-800 ring-1 ring-stone-800" : "border-stone-200 hover:border-stone-400")}>
            <span className="flex min-h-0 flex-1 items-center justify-center bg-stone-100 text-stone-400"><ArtifactKindIcon kind={revision.artifact?.kind} className="h-5 w-5" /></span>
            <span className="flex h-7 items-center gap-1.5 px-2"><span className="text-[9px] font-semibold text-stone-600">v{index + 1}</span><span className="min-w-0 flex-1 truncate text-[8px] capitalize text-stone-400">{revision.operation} · {revision.modelId || "source"}</span></span>
          </button>
        ))}
      </div>
    </div>
  );
}

function TemporalTimeline({
  currentTimeMs,
  durationMs,
  playing,
  annotations,
  timeline,
  assets,
  activeItemId,
  selectedClipId,
  onSelectClip,
  onAddClip,
  onSplit,
  onDelete,
  onToggle,
  onSeek,
}: {
  currentTimeMs: number;
  durationMs: number;
  playing: boolean;
  annotations: CanvasAnnotation[];
  timeline: CanvasTimeline | null;
  assets: CanvasArtifact[];
  activeItemId: string;
  selectedClipId: string | null;
  onSelectClip: (clipId: string | null) => void;
  onAddClip: (item: CanvasArtifact) => void;
  onSplit: () => void;
  onDelete: () => void;
  onToggle: () => void;
  onSeek: (value: number) => void;
}) {
  const [view, setView] = useState<"timeline" | "storyboard">("timeline");
  const tracks = timeline?.tracks ?? [];
  const clips = tracks.flatMap((track) => track.clips);
  const timelineEnd = clips.reduce(
    (end, clip) => Math.max(end, clip.startMs + clip.durationMs),
    0,
  );
  const duration = Math.max(durationMs, timelineEnd, 1);
  const currentAsset = assets.find((asset) => asset.itemId === activeItemId);
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-9 items-center gap-2 border-b border-stone-100 px-3">
        <button type="button" onClick={onToggle} className="flex h-7 w-7 items-center justify-center rounded-full bg-stone-900 text-white">{playing ? <Pause className="h-3 w-3" /> : <Play className="ml-0.5 h-3 w-3" />}</button>
        <span className="font-mono text-[10px] text-stone-600">{formatCanvasTime(currentTimeMs)} / {formatCanvasTime(durationMs)}</span>
        <div className="ml-2 h-5 w-px bg-stone-200" />
        <select
          value=""
          onChange={(event) => {
            const asset = assets.find((item) => item.itemId === event.target.value);
            if (asset) onAddClip(asset);
          }}
          className="h-7 max-w-36 rounded-md border border-stone-200 bg-white px-2 text-[9px] text-stone-600 outline-none"
          aria-label="Add media to timeline"
        >
          <option value="">+ Add media</option>
          {assets.filter((asset) => asset.mimeType.startsWith("video/") || asset.mimeType.startsWith("audio/")).map((asset) => (
            <option key={asset.itemId} value={asset.itemId}>{asset.name}</option>
          ))}
        </select>
        {!clips.length && currentAsset ? (
          <button type="button" onClick={() => onAddClip(currentAsset)} className="rounded-md border border-stone-200 px-2 py-1 text-[9px] text-stone-600 hover:bg-stone-50">Add current clip</button>
        ) : null}
        <button type="button" disabled={!selectedClipId} onClick={onSplit} className="flex h-7 items-center gap-1 rounded-md px-2 text-[9px] text-stone-500 hover:bg-stone-100 disabled:opacity-30"><Scissors className="h-3 w-3" /> Split</button>
        <button type="button" disabled={!selectedClipId} onClick={onDelete} className="flex h-7 items-center gap-1 rounded-md px-2 text-[9px] text-rose-600 hover:bg-rose-50 disabled:opacity-30"><Trash2 className="h-3 w-3" /> Delete</button>
        <div className="ml-auto flex rounded-md bg-stone-100 p-0.5">
          {(["timeline", "storyboard"] as const).map((entry) => (
            <button key={entry} type="button" onClick={() => setView(entry)} className={cn("rounded px-2 py-1 text-[8px] capitalize", view === entry ? "bg-white text-stone-700 shadow-sm" : "text-stone-400")}>{entry}</button>
          ))}
        </div>
      </div>
      <div className="relative min-h-0 flex-1 overflow-auto px-4 py-2">
        <div className="mb-2 flex justify-between text-[8px] text-stone-400"><span>0:00</span><span>{formatCanvasTime(durationMs / 2)}</span><span>{formatCanvasTime(durationMs)}</span></div>
        {view === "storyboard" && clips.length ? (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {clips.map((clip, index) => (
              <button key={clip.clipId} type="button" onClick={() => { onSelectClip(clip.clipId); onSeek(clip.startMs); }} className={cn("flex h-12 w-28 shrink-0 flex-col justify-center rounded-lg border px-2 text-left", selectedClipId === clip.clipId ? "border-stone-900 bg-stone-100" : "border-stone-200 bg-white")}>
                <span className="truncate text-[9px] font-medium text-stone-700">{index + 1}. {clip.name}</span>
                <span className="mt-1 text-[8px] text-stone-400">{formatCanvasTime(clip.durationMs)}</span>
              </button>
            ))}
          </div>
        ) : (
        <div className="relative min-h-12 space-y-1 rounded-lg bg-stone-100 p-1">
          <div className="absolute inset-y-0 left-0 rounded-l-lg bg-stone-200" style={{ width: `${(currentTimeMs / duration) * 100}%` }} />
          {tracks.map((track) => (
            <div key={track.trackId} className="relative h-5">
              {track.clips.map((clip) => (
                <button
                  key={clip.clipId}
                  type="button"
                  title={`${track.name}: ${clip.name}`}
                  onClick={() => { onSelectClip(clip.clipId); onSeek(clip.startMs); }}
                  className={cn("absolute inset-y-0 overflow-hidden rounded border px-1 text-left text-[8px]", track.kind === "audio" ? "border-violet-400 bg-violet-200 text-violet-900" : "border-cyan-500 bg-cyan-200 text-cyan-900", selectedClipId === clip.clipId && "ring-2 ring-stone-900 ring-offset-1")}
                  style={{ left: `${(clip.startMs / duration) * 100}%`, width: `${Math.max(1, (clip.durationMs / duration) * 100)}%` }}
                >
                  <span className="block truncate">{clip.name}</span>
                </button>
              ))}
            </div>
          ))}
          {annotations.filter((annotation) => annotation.startMs !== null && annotation.startMs !== undefined).map((annotation) => (
            <span key={annotation.annotationId} title={annotation.body} className="absolute top-1 h-3 w-3 -translate-x-1/2 rounded-full border-2 border-white bg-amber-500 shadow" style={{ left: `${((annotation.startMs ?? 0) / duration) * 100}%` }} />
          ))}
          <input type="range" min={0} max={duration} value={Math.min(currentTimeMs, duration)} onChange={(event) => onSeek(Number(event.target.value))} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" aria-label="Media timeline" />
          <span className="pointer-events-none absolute inset-y-0 w-px bg-stone-900" style={{ left: `${(currentTimeMs / duration) * 100}%` }} />
        </div>
        )}
      </div>
    </div>
  );
}

function JobProgress({ job }: { job: MediaJob }) {
  return (
    <div className="mb-2 rounded-lg bg-stone-50 p-2.5">
      <div className="flex items-center justify-between text-[10px]"><span className="flex items-center gap-1.5 font-medium text-stone-600"><Loader2 className="h-3 w-3 animate-spin" /> {job.status === "queued" ? "Queued" : "Generating"}</span><span className="font-mono text-stone-400">{job.progress}%</span></div>
      <div className="mt-2 h-1 overflow-hidden rounded-full bg-stone-200"><div className="h-full rounded-full bg-stone-900 transition-all" style={{ width: `${job.progress}%` }} /></div>
    </div>
  );
}

function HeaderButton({ label, children, onClick, disabled }: { label: string; children: React.ReactNode; onClick?: () => void; disabled?: boolean }) {
  return <button type="button" title={label} aria-label={label} onClick={onClick} disabled={disabled} className="flex h-9 w-9 items-center justify-center rounded-lg text-stone-500 transition hover:bg-stone-100 hover:text-stone-900 disabled:cursor-not-allowed disabled:opacity-35 [&_svg]:h-4 [&_svg]:w-4">{children}</button>;
}

function CanvasTool({ active, label, children, onClick }: { active?: boolean; label: string; children: React.ReactNode; onClick: () => void }) {
  return <button type="button" title={label} aria-label={label} onClick={onClick} className={cn("flex h-8 items-center gap-1.5 rounded-lg px-2 text-[10px] font-medium transition [&_svg]:h-3.5 [&_svg]:w-3.5", active ? "bg-stone-900 text-white" : "text-stone-500 hover:bg-stone-100 hover:text-stone-900")}><span>{children}</span><span className="hidden xl:inline">{label}</span></button>;
}

function RailButton({ active, label, badge, children, onClick }: { active?: boolean; label: string; badge?: number; children: React.ReactNode; onClick: () => void }) {
  return <button type="button" title={label} aria-label={label} onClick={onClick} className={cn("relative flex h-10 w-10 items-center justify-center rounded-lg transition [&_svg]:h-4 [&_svg]:w-4", active ? "bg-stone-900 text-white" : "text-stone-400 hover:bg-stone-100 hover:text-stone-800")}>{children}{badge ? <span className="absolute right-0 top-0 flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[8px] font-bold text-white">{badge}</span> : null}</button>;
}

function FieldLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={cn("text-[10px] font-semibold uppercase tracking-[0.12em] text-stone-500", className)}>{children}</p>;
}

function ArtifactKindIcon({ kind, className }: { kind?: string; className?: string }) {
  const Icon = kind === "video" ? Video : kind === "audio" || kind === "music" ? AudioLines : ImageIcon;
  return <Icon className={cn("h-4 w-4", className)} />;
}

function CanvasLoading() {
  return <div className="flex h-full items-center justify-center bg-stone-100"><div className="text-center"><span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-white shadow-sm"><WandSparkles className="h-5 w-5 text-stone-500" /></span><Loader2 className="mx-auto mt-5 h-4 w-4 animate-spin text-stone-400" /><p className="mt-2 text-xs text-stone-500">Opening Canvas…</p></div></div>;
}

function estimateCost(model: MediaModel, settings: Record<string, unknown>, prompt: string) {
  if (model.pricing.unit === "second") return model.pricing.usd * Number(settings.durationSeconds ?? 8);
  if (model.pricing.unit === "million_video_tokens") {
    const resolution = String(settings.resolution ?? "720p");
    const pixels = resolution === "4k" ? 3840 * 2160 : resolution === "1080p" ? 1920 * 1080 : resolution === "480p" ? 854 * 480 : 1280 * 720;
    const tokens = (pixels * Number(settings.fps ?? 24) * Number(settings.durationSeconds ?? 5)) / 1024;
    return (tokens / 1_000_000) * model.pricing.usd;
  }
  if (model.pricing.unit === "audio_token") return model.pricing.usd * Math.max(25, (prompt.length / 15) * 25);
  if (model.kind === "image") {
    const size = String(settings.imageSize ?? "1K");
    return model.pricing.usd * (size === "0.5K" ? 0.67 : size === "2K" ? 1.5 : size === "4K" ? 2.25 : 1);
  }
  return model.pricing.usd;
}

function promptPlaceholder(kind: MediaKind, operation: MediaOperation) {
  if (operation === "transform") return "Describe exactly what should change, and what must stay the same…";
  if (kind === "video") return "Describe the scene, action, camera movement, light, dialogue, and sound…";
  if (kind === "audio") return "Write the words to speak and describe the desired delivery…";
  if (kind === "music") return "Describe genre, mood, instrumentation, structure, and energy…";
  return "Describe the composition, subject, style, lighting, and important details…";
}

function mediaKindFor(kind?: string, mimeType?: string): MediaKind | null {
  if (kind === "music") return "music";
  if (mimeType?.startsWith("video/") || kind === "video") return "video";
  if (mimeType?.startsWith("audio/") || kind === "audio") return "audio";
  if (mimeType?.startsWith("image/") || kind === "image") return "image";
  return null;
}

function annotationLocation(annotation?: CanvasAnnotation) {
  if (!annotation) return "";
  if (annotation.startMs !== undefined && annotation.startMs !== null) {
    const end = annotation.endMs !== undefined && annotation.endMs !== null ? `–${formatCanvasTime(annotation.endMs)}` : "";
    return `${formatCanvasTime(annotation.startMs)}${end}`;
  }
  const geometry = annotation.geometry as Partial<Rect & { x: number; y: number }> | null;
  if (geometry?.x !== undefined && geometry.y !== undefined) {
    if (annotation.kind === "region") return `region x ${percent(geometry.x)}, y ${percent(geometry.y)}, w ${percent(geometry.width ?? 0)}, h ${percent(geometry.height ?? 0)}`;
    return `point x ${percent(geometry.x)}, y ${percent(geometry.y)}`;
  }
  return "";
}

function temporalAnnotation(annotation: CanvasAnnotation) {
  return annotation.startMs !== undefined && annotation.startMs !== null;
}

function percent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function relativeDate(value: string) {
  const date = new Date(value);
  const seconds = Math.round((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "now";
  if (seconds < 3_600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3_600)}h ago`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function clamp(value: number) {
  return Math.max(0, Math.min(1, value));
}

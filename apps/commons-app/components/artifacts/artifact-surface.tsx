"use client";
import { desktopApiFetch } from "@/lib/desktop-api-fetch";


import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BadgeCheck,
  ChevronLeft,
  ChevronRight,
  Code2,
  Download,
  ExternalLink,
  Loader2,
  Maximize2,
  MoreHorizontal,
  MousePointer2,
  PencilLine,
  RefreshCw,
  X,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneLight } from "react-syntax-highlighter/dist/esm/styles/prism";
import { ArtifactIcon } from "./artifact-icon";
import {
  ArtifactProvenance,
  type ArtifactProvenanceRecord,
} from "@/components/provenance/artifact-provenance";
import {
  artifactKind,
  artifactLabel,
  isMermaid,
  prettyBytes,
  type ArtifactPreview,
  type ArtifactRef,
} from "@/lib/artifacts";
import { cn } from "@/lib/utils";
import { apiErrorMessage } from "@/lib/api-error";
import { MermaidDiagram } from "./mermaid-diagram";

export function ArtifactSurface({
  artifact,
  onClose,
  onRevise,
}: {
  artifact: ArtifactRef;
  onClose: () => void;
  onRevise?: (artifact: ArtifactRef) => void;
}) {
  const [preview, setPreview] = useState<ArtifactPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const surfaceRef = useRef<HTMLElement>(null);
  const [view, setView] = useState<"preview" | "source" | "provenance">(
    "preview",
  );
  const [provenance, setProvenance] = useState<ArtifactProvenanceRecord | null>(
    null,
  );
  const [provenanceLoading, setProvenanceLoading] = useState(false);
  const [provenanceError, setProvenanceError] = useState("");
  const provenanceAbortRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await desktopApiFetch(
        `/api/library/${encodeURIComponent(artifact.fileId)}/preview`,
        { cache: "no-store" },
      );
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(apiErrorMessage(data, "Could not open this artifact"));
      }
      setPreview(data?.data ?? data);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not open this artifact",
      );
    } finally {
      setLoading(false);
    }
  }, [artifact.fileId]);

  useEffect(() => {
    provenanceAbortRef.current?.abort("artifact-changed");
    provenanceAbortRef.current = null;
    setPreview(null);
    setProvenance(null);
    setProvenanceLoading(false);
    setProvenanceError("");
    setView("preview");
    void load();
    return () => {
      provenanceAbortRef.current?.abort("artifact-changed");
      provenanceAbortRef.current = null;
    };
  }, [load]);

  const loadProvenance = useCallback(async () => {
    if (provenance || provenanceAbortRef.current) return;
    const controller = new AbortController();
    provenanceAbortRef.current = controller;
    const timeoutId = window.setTimeout(
      () => controller.abort("timeout"),
      8_000,
    );
    setProvenanceLoading(true);
    setProvenanceError("");
    try {
      const response = await desktopApiFetch(
        `/api/library/${encodeURIComponent(artifact.fileId)}/provenance?eventLimit=40`,
        { cache: "no-store", signal: controller.signal },
      );
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(apiErrorMessage(data, "Could not load provenance"));
      }
      setProvenance(data?.data ?? data);
    } catch (cause) {
      if (controller.signal.reason === "artifact-changed") return;
      setProvenanceError(
        controller.signal.reason === "timeout"
          ? "Provenance took too long to load. Please try again."
          : cause instanceof Error
            ? cause.message
            : "Could not load provenance",
      );
    } finally {
      window.clearTimeout(timeoutId);
      if (provenanceAbortRef.current === controller) {
        provenanceAbortRef.current = null;
        setProvenanceLoading(false);
      }
    }
  }, [artifact.fileId, provenance]);

  useEffect(() => {
    if (view === "provenance") void loadProvenance();
  }, [loadProvenance, view]);

  useEffect(() => {
    if (!preview || provenance || provenanceError) return;
    const timeoutId = window.setTimeout(() => void loadProvenance(), 150);
    return () => window.clearTimeout(timeoutId);
  }, [loadProvenance, preview, provenance, provenanceError]);

  const resolved = useMemo<ArtifactRef>(
    () => ({
      ...artifact,
      name: preview?.name || artifact.name,
      mimeType: preview?.mimeType || artifact.mimeType,
      kind: preview?.kind || artifact.kind,
      sizeBytes: preview?.sizeBytes || artifact.sizeBytes,
    }),
    [artifact, preview],
  );

  const hasSource = Boolean(
    preview && (preview.kind === "code" || preview.kind === "app" || preview.codeProject),
  );

  return (
    <aside
      ref={surfaceRef}
      className="relative z-40 flex h-full min-h-0 w-[min(720px,56vw)] min-w-[420px] shrink-0 flex-col overflow-hidden border-l border-border bg-white shadow-floating max-lg:absolute max-lg:inset-0 max-lg:w-full max-lg:min-w-0"
    >
      <header className="flex h-14 shrink-0 items-center gap-2.5 border-b border-border/70 px-3">
        <ArtifactIcon artifact={resolved} className="ml-1 h-4 w-4 shrink-0 text-stone-500" strokeWidth={1.75} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-stone-900">
            {resolved.name || "Artifact"}
          </p>
          <p className="truncate text-xs text-stone-500">
            {[artifactLabel(resolved), resolved.sizeBytes ? prettyBytes(resolved.sizeBytes) : null]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          <ToolbarButton
            label={view === "provenance" ? "Hide provenance" : "Provenance"}
            active={view === "provenance"}
            onClick={() => {
              setView((current) => (current === "provenance" ? "preview" : "provenance"));
              void loadProvenance();
            }}
          >
            <BadgeCheck className="h-4 w-4" />
          </ToolbarButton>
          <Link
            href={`/library/${encodeURIComponent(artifact.fileId)}`}
            title="Open in canvas"
            aria-label="Open in canvas"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-stone-500 transition-colors hover:bg-stone-100 hover:text-stone-900"
          >
            <Maximize2 className="h-4 w-4" />
          </Link>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label="More actions"
                title="More actions"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-stone-500 transition-colors hover:bg-stone-100 hover:text-stone-900"
              >
                <MoreHorizontal className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              {hasSource && (
                <DropdownMenuItem onSelect={() => setView((current) => (current === "source" ? "preview" : "source"))}>
                  <Code2 className="mr-2 h-4 w-4" />
                  {view === "source" ? "Show preview" : "View source"}
                </DropdownMenuItem>
              )}
              {onRevise && (
                <DropdownMenuItem onSelect={() => onRevise(resolved)}>
                  <PencilLine className="mr-2 h-4 w-4" /> Revise with agent
                </DropdownMenuItem>
              )}
              {preview?.download?.url && (
                <DropdownMenuItem asChild>
                  <a href={preview.download.url} download={preview.name}>
                    <Download className="mr-2 h-4 w-4" /> Download
                  </a>
                </DropdownMenuItem>
              )}
              {preview?.download?.url && (
                <DropdownMenuItem asChild>
                  <a href={preview.inline?.url || preview.download.url} target="_blank" rel="noreferrer">
                    <ExternalLink className="mr-2 h-4 w-4" /> Open in new tab
                  </a>
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          <ToolbarButton label="Close" onClick={onClose}>
            <X className="h-4 w-4" />
          </ToolbarButton>
        </div>
      </header>

      {loading ? (
        <div className="flex min-h-0 flex-1 items-center justify-center">
          <div className="flex flex-col items-center gap-2 text-stone-400">
            <ArtifactIcon artifact={resolved} className="h-10 w-10 animate-pulse" strokeWidth={1.25} />
            <span className="text-xs">{artifactLabel(resolved)}</span>
          </div>
        </div>
      ) : error ? (
        <div className="flex min-h-0 flex-1 items-center justify-center p-8">
          <div className="max-w-sm text-center">
            <p className="text-sm font-medium text-stone-900">
              This artifact could not be previewed
            </p>
            <p className="mt-1 text-xs leading-5 text-stone-500">{error}</p>
            <button
              type="button"
              onClick={load}
              className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs font-medium shadow-card hover:bg-stone-50"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Try again
            </button>
          </div>
        </div>
      ) : preview && view === "source" ? (
        <ArtifactSource preview={preview} />
      ) : preview && view === "provenance" ? (
        provenanceLoading ? (
          <CenteredMessage message="Loading provenance…" loading />
        ) : provenanceError ? (
          <CenteredMessage
            message={provenanceError}
            actionLabel="Try again"
            onAction={() => void loadProvenance()}
          />
        ) : provenance ? (
          <ArtifactProvenance record={provenance} itemId={artifact.fileId} />
        ) : null
      ) : preview ? (
        <ArtifactPreviewBody preview={preview} />
      ) : null}
    </aside>
  );
}

function ArtifactPreviewBody({ preview }: { preview: ArtifactPreview }) {
  const kind = artifactKind(preview);
  if (isMermaid(preview) && (preview.content || preview.textPreview)) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto bg-white p-8">
        <MermaidDiagram source={preview.content || preview.textPreview || ""} className="flex justify-center" />
      </div>
    );
  }
  const inlineUrl = preview.inline?.url || preview.download?.url;
  const visualPages = (preview.artifacts || []).filter(
    (artifact) => artifact.url && artifact.kind !== "image",
  );
  const presentationSlides = (preview.artifacts || []).filter(
    (artifact) => artifact.url && artifact.kind === "presentation_slide_image",
  );
  const pageCount =
    typeof preview.metadata?.pages === "number"
      ? preview.metadata.pages
      : visualPages.length;

  if (kind === "app" || kind === "code") {
    const interactive = preview.interactivePreview;
    if (interactive?.type === "html") {
      return (
        <iframe
          srcDoc={interactive.html}
          title={`Interactive preview of ${preview.name}`}
          sandbox="allow-scripts allow-modals"
          referrerPolicy="no-referrer"
          className="min-h-0 flex-1 border-0 bg-white"
        />
      );
    }
    if (interactive?.type === "url") {
      return (
        <iframe
          src={interactive.url}
          title={`Interactive preview of ${preview.name}`}
          sandbox="allow-scripts allow-forms allow-modals allow-popups allow-same-origin"
          referrerPolicy="no-referrer"
          className="min-h-0 flex-1 border-0 bg-white"
        />
      );
    }
    if (interactive?.type === "unavailable") {
      return (
        <div className="flex min-h-0 flex-1 items-center justify-center p-8">
          <div className="max-w-sm text-center">
            <Code2 className="mx-auto h-8 w-8 text-stone-300" />
            <p className="mt-3 text-sm font-medium text-stone-800">
              Interactive preview unavailable
            </p>
            <p className="mt-1 text-xs leading-5 text-stone-500">
              {interactive.error}
            </p>
            <p className="mt-2 text-[11px] text-stone-400">
              The source remains available in the Source tab.
            </p>
          </div>
        </div>
      );
    }
    return <ArtifactSource preview={preview} />;
  }

  if (kind === "image" && inlineUrl) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto bg-[radial-gradient(#d6d3d1_0.7px,transparent_0.7px)] bg-[size:16px_16px] p-8">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={inlineUrl}
          alt={preview.name}
          className="max-h-full max-w-full rounded-lg object-contain shadow-xl"
        />
      </div>
    );
  }

  if (kind === "video" && inlineUrl) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center bg-black p-4">
        <video
          src={inlineUrl}
          controls
          playsInline
          className="max-h-full max-w-full rounded-lg"
        />
      </div>
    );
  }

  if (kind === "audio" && inlineUrl) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center bg-gradient-to-br from-amber-50 to-orange-100 p-8">
        <div className="w-full max-w-md rounded-2xl border border-white/70 bg-white/80 p-6 shadow-xl backdrop-blur">
          <ArtifactIcon
            artifact={preview}
            className="mx-auto mb-5 h-10 w-10 text-amber-600"
          />
          <p className="mb-5 truncate text-center text-sm font-medium">
            {preview.name}
          </p>
          <audio src={inlineUrl} controls className="w-full" />
          {preview.content ? (
            <p className="mt-5 max-h-52 overflow-y-auto whitespace-pre-wrap text-xs leading-5 text-stone-600">
              {preview.content}
            </p>
          ) : null}
        </div>
      </div>
    );
  }

  if (kind === "pdf" && inlineUrl) {
    return (
      <iframe
        src={`${inlineUrl}#toolbar=0&navpanes=0&view=FitH`}
        title={preview.name}
        className="min-h-0 flex-1 border-0 bg-stone-100"
      />
    );
  }

  if (kind === "pdf" && visualPages.length) {
    return (
      <div className="min-h-0 flex-1 overflow-y-auto bg-stone-200/70 p-4 sm:p-7">
        <div className="mx-auto max-w-3xl space-y-5">
          {visualPages.map((page, index) => (
            <figure key={page.artifactId}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={page.url}
                alt={`${preview.name}, page ${page.pageNumber || index + 1}`}
                className="w-full bg-white shadow-lg"
              />
              <figcaption className="mt-1 text-center text-[10px] text-stone-500">
                Page {page.pageNumber || index + 1}
              </figcaption>
            </figure>
          ))}
          {pageCount > visualPages.length ? (
            <p className="py-3 text-center text-xs text-stone-500">
              Previewing {visualPages.length} of {pageCount} pages. Download to
              view the full document.
            </p>
          ) : null}
        </div>
      </div>
    );
  }

  if (kind === "presentation") {
    if (presentationSlides.length) {
      return (
        <PresentationSlides
          name={preview.name}
          slides={presentationSlides}
          totalSlides={pageCount || presentationSlides.length}
        />
      );
    }
    const slides = splitPresentation(
      preview.content || preview.textPreview || "",
    );
    return (
      <div className="min-h-0 flex-1 overflow-y-auto bg-stone-200/70 p-4 sm:p-6">
        <div className="mx-auto max-w-3xl space-y-5">
          {slides.length ? (
            slides.map((slide, index) => (
              <article
                key={`${index}-${slide.slice(0, 20)}`}
                className="aspect-video overflow-hidden rounded-md border border-stone-200 bg-white p-[7%] shadow-lg"
              >
                <p className="mb-3 text-[10px] font-medium uppercase tracking-widest text-indigo-500">
                  Slide {index + 1}
                </p>
                <PresentationText text={slide} />
              </article>
            ))
          ) : (
            <EmptyPreview preview={preview} />
          )}
        </div>
      </div>
    );
  }

  if (kind === "spreadsheet") {
    return <SpreadsheetPreview preview={preview} />;
  }

  if (["document", "text"].includes(kind)) {
    return (
      <div className="min-h-0 flex-1 overflow-y-auto bg-stone-200/60 p-4 sm:p-7">
        <article
          className={cn(
            "mx-auto min-h-full max-w-3xl bg-white p-8 shadow-lg sm:p-12",
            (kind === "text" || kind === "code") &&
              "font-mono text-[12px] leading-6",
          )}
        >
          <div className="whitespace-pre-wrap break-words text-sm leading-7 text-stone-800">
            {preview.content ||
              preview.textPreview ||
              "No text preview is available for this file."}
          </div>
        </article>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 items-center justify-center p-8">
      <EmptyPreview preview={preview} />
    </div>
  );
}

function ArtifactSource({ preview }: { preview: ArtifactPreview }) {
  const files = preview.codeProject?.files ?? [];
  const [activePath, setActivePath] = useState(
    preview.codeProject?.entryFile || files[0]?.path || preview.name,
  );
  const active = files.find((file) => file.path === activePath);
  const content =
    active?.content ?? preview.content ?? preview.textPreview ?? "";
  const language = codeLanguage(active?.path || preview.name);

  return (
    <div className="flex min-h-0 flex-1 bg-[#fafaf9]">
      {files.length ? (
        <aside className="w-44 shrink-0 overflow-y-auto border-r border-stone-200 bg-white py-2">
          {files.map((file) => (
            <button
              key={file.path}
              type="button"
              onClick={() => setActivePath(file.path)}
              className={cn(
                "block w-full truncate px-3 py-1.5 text-left font-mono text-[11px] text-stone-500 hover:bg-stone-50 hover:text-stone-900",
                activePath === file.path &&
                  "bg-stone-100 font-medium text-stone-900",
              )}
            >
              {file.path}
            </button>
          ))}
        </aside>
      ) : null}
      <div className="min-w-0 flex-1 overflow-auto">
        {content ? (
          <SyntaxHighlighter
            language={language}
            style={oneLight}
            showLineNumbers
            wrapLongLines={false}
            customStyle={{
              margin: 0,
              minHeight: "100%",
              padding: "20px",
              background: "#fafaf9",
              fontSize: "12px",
              lineHeight: "1.65",
            }}
            lineNumberStyle={{ color: "#a8a29e", minWidth: "2.6em" }}
          >
            {content}
          </SyntaxHighlighter>
        ) : (
          <CenteredMessage message="No source is available for this artifact." />
        )}
      </div>
    </div>
  );
}

function SpreadsheetPreview({ preview }: { preview: ArtifactPreview }) {
  const sheets = useMemo(
    () => parseWorkbookPreview(preview.content || preview.textPreview || ""),
    [preview.content, preview.textPreview],
  );
  const [active, setActive] = useState(0);
  const sheet = sheets[active];
  if (!sheet)
    return <CenteredMessage message="No cell preview is available." />;
  return (
    <div className="flex min-h-0 flex-1 flex-col bg-white">
      <div className="flex h-9 shrink-0 items-center gap-1 overflow-x-auto border-b border-stone-200 bg-stone-50 px-2">
        {sheets.map((candidate, index) => (
          <button
            key={`${candidate.name}-${index}`}
            type="button"
            onClick={() => setActive(index)}
            className={cn(
              "shrink-0 rounded-md px-2.5 py-1 text-[11px] text-stone-500 hover:bg-white",
              active === index &&
                "bg-white font-medium text-stone-900 shadow-sm",
            )}
          >
            {candidate.name}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="min-w-full border-collapse text-left text-xs">
          <tbody>
            {sheet.rows.map((row, rowIndex) => (
              <tr
                key={rowIndex}
                className={rowIndex === 0 ? "bg-stone-50 font-medium" : ""}
              >
                <th className="sticky left-0 border-b border-r border-stone-200 bg-stone-50 px-2 py-1.5 text-right font-mono text-[10px] font-normal text-stone-400">
                  {rowIndex + 1}
                </th>
                {row.map((cell, columnIndex) => (
                  <td
                    key={columnIndex}
                    className="min-w-28 max-w-72 border-b border-r border-stone-200 px-3 py-1.5 text-stone-700"
                  >
                    <span className="line-clamp-3 whitespace-pre-wrap">
                      {cell}
                    </span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CenteredMessage({
  message,
  loading = false,
  actionLabel,
  onAction,
}: {
  message: string;
  loading?: boolean;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center p-8 text-center text-xs text-stone-500">
      <div>
        {loading ? (
          <Loader2 className="mx-auto mb-2 h-4 w-4 animate-spin" />
        ) : null}
        <p>{message}</p>
        {actionLabel && onAction ? (
          <button
            type="button"
            onClick={onAction}
            className="mt-3 inline-flex items-center rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-[11px] font-medium text-stone-700 shadow-sm hover:bg-stone-50"
          >
            {actionLabel}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function PresentationSlides({
  name,
  slides,
  totalSlides,
}: {
  name: string;
  slides: NonNullable<ArtifactPreview["artifacts"]>;
  totalSlides: number;
}) {
  const [index, setIndex] = useState(0);
  const [pointerEnabled, setPointerEnabled] = useState(false);
  const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null);
  const lastIndex = Math.max(0, slides.length - 1);

  useEffect(() => {
    setIndex(0);
  }, [name]);

  const previous = () => setIndex((value) => Math.max(0, value - 1));
  const next = () => setIndex((value) => Math.min(lastIndex, value + 1));
  const current = slides[Math.min(index, lastIndex)];

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) return;
      if (["ArrowLeft", "PageUp"].includes(event.key)) {
        event.preventDefault();
        setIndex((value) => Math.max(0, value - 1));
      }
      if (["ArrowRight", "PageDown", " "].includes(event.key)) {
        event.preventDefault();
        setIndex((value) => Math.min(lastIndex, value + 1));
      }
      if (event.key === "Home") {
        event.preventDefault();
        setIndex(0);
      }
      if (event.key === "End") {
        event.preventDefault();
        setIndex(lastIndex);
      }
      if (event.key.toLowerCase() === "l") {
        setPointerEnabled((value) => !value);
        setPointer(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [lastIndex]);

  return (
    <div
      className="flex min-h-0 flex-1 flex-col bg-stone-950"
      tabIndex={0}
      aria-label={`${name} presentation viewer`}
    >
      <div
        className={cn(
          "relative flex min-h-0 flex-1 items-center justify-center p-3 sm:p-6",
          pointerEnabled && "cursor-none",
        )}
        onPointerMove={(event) => {
          if (!pointerEnabled) return;
          const bounds = event.currentTarget.getBoundingClientRect();
          setPointer({
            x: ((event.clientX - bounds.left) / bounds.width) * 100,
            y: ((event.clientY - bounds.top) / bounds.height) * 100,
          });
        }}
        onPointerLeave={() => setPointer(null)}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={current?.url}
          alt={`${name}, slide ${current?.pageNumber || index + 1}`}
          className="max-h-full max-w-full rounded-sm bg-white object-contain shadow-2xl"
        />
        {pointerEnabled && pointer ? (
          <span
            aria-hidden
            className="pointer-events-none absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-red-500 shadow-[0_0_8px_3px_rgba(239,68,68,0.75)]"
            style={{ left: `${pointer.x}%`, top: `${pointer.y}%` }}
          />
        ) : null}
      </div>
      <div className="flex h-14 shrink-0 items-center justify-between border-t border-white/10 px-4 text-white">
        <button
          type="button"
          onClick={previous}
          disabled={index === 0}
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium hover:bg-white/10 disabled:opacity-30"
        >
          <ChevronLeft className="h-4 w-4" /> Previous
        </button>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setPointerEnabled((value) => !value);
              setPointer(null);
            }}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium hover:bg-white/10",
              pointerEnabled && "bg-red-500/20 text-red-200",
            )}
            title="Toggle laser pointer (L)"
          >
            <MousePointer2 className="h-3.5 w-3.5" /> Pointer
          </button>
          <span className="text-xs tabular-nums text-stone-300">
            {index + 1} / {slides.length}
            {totalSlides > slides.length ? ` · ${totalSlides} total` : ""}
          </span>
        </div>
        <button
          type="button"
          onClick={next}
          disabled={index === lastIndex}
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium hover:bg-white/10 disabled:opacity-30"
        >
          Next <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function isEditableTarget(target: EventTarget | null) {
  const element = target instanceof HTMLElement ? target : null;
  return Boolean(
    element?.isContentEditable ||
      element?.closest("input, textarea, select, [contenteditable='true']"),
  );
}

function PresentationText({ text }: { text: string }) {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  return (
    <>
      {lines[0] ? (
        <h2 className="text-xl font-semibold tracking-tight text-stone-900 sm:text-2xl">
          {lines[0]}
        </h2>
      ) : null}
      {lines.slice(1).map((line, index) => (
        <p
          key={`${index}-${line}`}
          className="mt-2 text-sm leading-6 text-stone-600"
        >
          {line}
        </p>
      ))}
    </>
  );
}

function EmptyPreview({ preview }: { preview: ArtifactPreview }) {
  return (
    <div className="max-w-sm text-center">
      <ArtifactIcon
        artifact={preview}
        className="mx-auto h-10 w-10 text-stone-300"
      />
      <p className="mt-3 text-sm font-medium text-stone-800">
        Preview unavailable
      </p>
      <p className="mt-1 text-xs leading-5 text-stone-500">
        The file is safely stored and can be downloaded or processed by the
        agent&apos;s computer.
      </p>
    </div>
  );
}

function splitPresentation(content: string) {
  return content
    .split(/--- Slide \d+ ---/g)
    .map((slide) => slide.trim())
    .filter(Boolean);
}

function parseWorkbookPreview(content: string) {
  return content
    .split(/^## Sheet: /gm)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const newline = part.indexOf("\n");
      const name = newline >= 0 ? part.slice(0, newline).trim() : part;
      const csv = newline >= 0 ? part.slice(newline + 1) : "";
      return {
        name,
        rows: parseCsv(csv).slice(0, 500),
      };
    });
}

function parseCsv(csv: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < csv.length; index += 1) {
    const char = csv[index];
    if (char === '"') {
      if (quoted && csv[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && csv[index + 1] === "\n") index += 1;
      row.push(cell);
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  if (cell || row.length) {
    row.push(cell);
    if (row.some(Boolean)) rows.push(row);
  }
  return rows;
}

function codeLanguage(fileName: string) {
  const extension = fileName.split(".").pop()?.toLowerCase();
  return (
    (
      {
        tsx: "tsx",
        ts: "typescript",
        jsx: "jsx",
        js: "javascript",
        mjs: "javascript",
        cjs: "javascript",
        html: "html",
        css: "css",
        json: "json",
        md: "markdown",
        py: "python",
        sql: "sql",
        yml: "yaml",
        yaml: "yaml",
        xml: "xml",
        sh: "bash",
      } as Record<string, string>
    )[extension || ""] || "text"
  );
}

function ToolbarButton({
  label,
  onClick,
  active,
  children,
}: {
  label: string;
  onClick: () => void;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "flex h-8 w-8 items-center justify-center rounded-lg text-stone-500 transition-colors hover:bg-stone-100 hover:text-stone-900",
        active && "bg-stone-100 text-stone-900",
      )}
    >
      {children}
    </button>
  );
}

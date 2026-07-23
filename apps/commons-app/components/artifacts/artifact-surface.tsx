"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Download,
  ExternalLink,
  Loader2,
  Maximize2,
  Minimize2,
  PencilLine,
  RefreshCw,
  X,
} from "lucide-react";
import { ArtifactIcon } from "./artifact-icon";
import {
  artifactKind,
  artifactLabel,
  prettyBytes,
  type ArtifactPreview,
  type ArtifactRef,
} from "@/lib/artifacts";
import { cn } from "@/lib/utils";

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
  const [fullscreen, setFullscreen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(
        `/api/library/${encodeURIComponent(artifact.fileId)}/preview`,
        { cache: "no-store" },
      );
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(
          data?.message || data?.error || "Could not open this artifact",
        );
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
    setPreview(null);
    load();
  }, [load]);

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

  return (
    <aside
      className={cn(
        "relative z-40 flex h-full min-h-0 shrink-0 flex-col overflow-hidden border-l border-stone-200 bg-stone-50 shadow-2xl max-lg:absolute max-lg:inset-0 max-lg:w-full",
        fullscreen
          ? "absolute inset-0 w-full"
          : "w-[min(760px,58vw)] min-w-[460px]",
      )}
    >
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-stone-200 bg-white px-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-stone-100 text-stone-600">
          <ArtifactIcon artifact={resolved} className="h-4.5 w-4.5" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-stone-900">
            {resolved.name || "Artifact"}
          </p>
          <p className="flex items-center gap-1.5 text-[11px] text-stone-500">
            <span>{artifactLabel(resolved)}</span>
            {resolved.sizeBytes ? (
              <>
                <span className="text-stone-300">·</span>
                <span>{prettyBytes(resolved.sizeBytes)}</span>
              </>
            ) : null}
            {preview?.status ? (
              <>
                <span className="text-stone-300">·</span>
                <span className="capitalize">{preview.status}</span>
              </>
            ) : null}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-0.5">
          {onRevise && (
            <ToolbarButton
              label="Revise with agent"
              onClick={() => onRevise(resolved)}
            >
              <PencilLine className="h-4 w-4" />
            </ToolbarButton>
          )}
          {preview?.download?.url && (
            <>
              <a
                href={preview.download.url}
                download={preview.name}
                title="Download original"
                className="flex h-8 w-8 items-center justify-center rounded-md text-stone-500 hover:bg-stone-100 hover:text-stone-900"
              >
                <Download className="h-4 w-4" />
              </a>
              <a
                href={preview.inline?.url || preview.download.url}
                target="_blank"
                rel="noreferrer"
                title="Open in a new tab"
                className="flex h-8 w-8 items-center justify-center rounded-md text-stone-500 hover:bg-stone-100 hover:text-stone-900"
              >
                <ExternalLink className="h-4 w-4" />
              </a>
            </>
          )}
          <ToolbarButton
            label={fullscreen ? "Exit full screen" : "Full screen"}
            onClick={() => setFullscreen((value) => !value)}
          >
            {fullscreen ? (
              <Minimize2 className="h-4 w-4" />
            ) : (
              <Maximize2 className="h-4 w-4" />
            )}
          </ToolbarButton>
          <ToolbarButton label="Close artifact" onClick={onClose}>
            <X className="h-4 w-4" />
          </ToolbarButton>
        </div>
      </header>

      {loading ? (
        <div className="flex min-h-0 flex-1 items-center justify-center">
          <div className="text-center text-stone-500">
            <Loader2 className="mx-auto h-5 w-5 animate-spin" />
            <p className="mt-2 text-xs">Preparing preview…</p>
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
              className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs font-medium shadow-sm hover:bg-stone-50"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Try again
            </button>
          </div>
        </div>
      ) : preview ? (
        <ArtifactPreviewBody preview={preview} />
      ) : null}
    </aside>
  );
}

function ArtifactPreviewBody({ preview }: { preview: ArtifactPreview }) {
  const kind = artifactKind(preview);
  const inlineUrl = preview.inline?.url || preview.download?.url;
  const visualPages = (preview.artifacts || []).filter(
    (artifact) => artifact.url && artifact.kind !== "image",
  );
  const pageCount =
    typeof preview.metadata?.pages === "number"
      ? preview.metadata.pages
      : visualPages.length;

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

  if (kind === "pdf" && inlineUrl) {
    return (
      <iframe
        src={inlineUrl}
        title={preview.name}
        className="min-h-0 flex-1 border-0 bg-stone-100"
      />
    );
  }

  if (kind === "presentation") {
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
    return (
      <div className="min-h-0 flex-1 overflow-auto bg-white">
        <pre className="min-w-max whitespace-pre p-5 font-mono text-xs leading-6 text-stone-700">
          {preview.content ||
            preview.textPreview ||
            "No cell preview available."}
        </pre>
      </div>
    );
  }

  if (["document", "text", "code"].includes(kind)) {
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

function ToolbarButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className="flex h-8 w-8 items-center justify-center rounded-md text-stone-500 hover:bg-stone-100 hover:text-stone-900"
    >
      {children}
    </button>
  );
}

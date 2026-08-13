"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Expand,
  FileText,
  LoaderCircle,
  MousePointer2,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

type MaterialData = {
  id: string;
  name: string;
  mimeType: string;
  kind: "presentation" | "pdf";
  content: string;
  imageUrls: string[];
  downloadUrl?: string;
  embeddable?: boolean;
};

export function CourseMaterialViewer({
  materialId,
  compact = false,
}: {
  materialId: string;
  compact?: boolean;
}) {
  const [material, setMaterial] = useState<MaterialData | null>(null);
  const [error, setError] = useState("");
  const [slide, setSlide] = useState(0);
  const [full, setFull] = useState(false);
  const [pointerEnabled, setPointerEnabled] = useState(false);
  const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/course-materials/${materialId}`, { cache: "no-store" })
      .then(async (res) => ({
        ok: res.ok,
        body: await res.json().catch(() => ({})),
      }))
      .then(({ ok, body }) => {
        if (cancelled) return;
        if (ok) setMaterial(body.material);
        else setError(body.error || "Could not open this material.");
      })
      .catch(() => {
        if (!cancelled) setError("Could not open this material.");
      });
    return () => {
      cancelled = true;
    };
  }, [materialId]);
  const slides = useMemo(
    () => splitSlides(material?.content || ""),
    [material?.content],
  );
  const visualSlideCount = material?.imageUrls.length || 0;
  const presentationSlideCount = visualSlideCount || slides.length || 1;
  useEffect(() => {
    if (material?.kind !== "presentation") return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) return;
      if (["ArrowLeft", "PageUp"].includes(event.key)) {
        event.preventDefault();
        setSlide((value) => Math.max(0, value - 1));
      }
      if (["ArrowRight", "PageDown", " "].includes(event.key)) {
        event.preventDefault();
        setSlide((value) => Math.min(presentationSlideCount - 1, value + 1));
      }
      if (event.key === "Home") {
        event.preventDefault();
        setSlide(0);
      }
      if (event.key === "End") {
        event.preventDefault();
        setSlide(presentationSlideCount - 1);
      }
      if (event.key.toLowerCase() === "l") {
        setPointerEnabled((value) => !value);
        setPointer(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [material?.kind, presentationSlideCount]);
  if (error)
    return (
      <div className="rounded-xl bg-amber-50 p-4 text-sm text-amber-800">
        {error}
      </div>
    );
  if (!material)
    return (
      <div className="flex min-h-48 items-center justify-center rounded-xl bg-slate-50">
        <LoaderCircle className="h-5 w-5 animate-spin text-slate-300" />
      </div>
    );
  const stage =
    material.kind === "pdf" && material.downloadUrl ? (
      <iframe
        title={material.name}
        src={`${material.downloadUrl}#toolbar=0&view=FitH`}
        className={cn(
          "w-full border-0 bg-slate-100",
          full ? "h-[calc(100dvh-64px)]" : compact ? "h-[58vh]" : "h-[72vh]",
        )}
      />
    ) : material.kind === "presentation" && visualSlideCount ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={material.imageUrls[Math.min(slide, visualSlideCount - 1)]}
        alt={`${material.name}, slide ${slide + 1}`}
        className={cn(
          "mx-auto w-full bg-slate-950 object-contain",
          full ? "h-[calc(100dvh-112px)]" : compact ? "h-[58vh]" : "h-[72vh]",
        )}
      />
    ) : material.kind === "presentation" &&
      material.downloadUrl &&
      material.embeddable !== false ? (
      <iframe
        title={material.name}
        src={`https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(material.downloadUrl)}`}
        className={cn(
          "w-full border-0 bg-slate-950",
          full ? "h-[calc(100dvh-64px)]" : compact ? "h-[58vh]" : "h-[72vh]",
        )}
        allowFullScreen
      />
    ) : (
      <div
        className={cn(
          "flex min-h-[420px] items-center justify-center bg-slate-950 p-8 text-white sm:p-14",
          full && "min-h-[calc(100dvh-64px)]",
        )}
      >
        <div className="w-full max-w-5xl">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-300">
            Slide {slide + 1} of {Math.max(slides.length, 1)}
          </p>
          <div className="mt-7 whitespace-pre-wrap text-2xl font-semibold leading-relaxed sm:text-4xl sm:leading-snug">
            {slides[slide] || material.name}
          </div>
        </div>
      </div>
    );
  return (
    <div
      className={cn(
        "overflow-hidden rounded-2xl border border-slate-200 bg-white",
        full && "fixed inset-0 z-[100] rounded-none border-0 bg-slate-950",
      )}
    >
      <div className="flex h-14 items-center gap-3 border-b border-slate-200 bg-white px-4">
        <FileText className="h-4 w-4 text-slate-400" />
        <p className="min-w-0 flex-1 truncate text-sm font-bold text-slate-800">
          {material.name}
        </p>
        {material.kind === "presentation" ? (
          <button
            onClick={() => {
              setPointerEnabled((value) => !value);
              setPointer(null);
            }}
            className={cn(
              "rounded-lg p-2 hover:bg-slate-100",
              pointerEnabled ? "bg-red-50 text-red-600" : "text-slate-500",
            )}
            title={`${pointerEnabled ? "Turn off" : "Turn on"} laser pointer (L)`}
          >
            <MousePointer2 className="h-4 w-4" />
          </button>
        ) : null}
        {material.downloadUrl ? (
          <a
            href={material.downloadUrl}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
            title="Download original"
          >
            <Download className="h-4 w-4" />
          </a>
        ) : null}
        <button
          onClick={() => setFull(!full)}
          className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
          title={full ? "Exit presentation" : "Present full screen"}
        >
          {full ? <X className="h-4 w-4" /> : <Expand className="h-4 w-4" />}
        </button>
      </div>
      <div
        className={cn(
          "relative",
          pointerEnabled && material.kind === "presentation" && "cursor-none",
        )}
        onPointerMove={(event) => {
          if (!pointerEnabled || material.kind !== "presentation") return;
          const bounds = event.currentTarget.getBoundingClientRect();
          setPointer({
            x: ((event.clientX - bounds.left) / bounds.width) * 100,
            y: ((event.clientY - bounds.top) / bounds.height) * 100,
          });
        }}
        onPointerLeave={() => setPointer(null)}
      >
        {stage}
        {pointerEnabled && pointer ? (
          <span
            aria-hidden
            className="pointer-events-none absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-red-500 shadow-[0_0_8px_3px_rgba(239,68,68,0.75)]"
            style={{ left: `${pointer.x}%`, top: `${pointer.y}%` }}
          />
        ) : null}
      </div>
      {material.kind === "presentation" &&
      (visualSlideCount > 0 ||
        !material.downloadUrl ||
        material.embeddable === false) ? (
        <div className="flex h-14 items-center justify-between border-t border-slate-800 bg-slate-950 px-4 text-white">
          <button
            disabled={slide <= 0}
            onClick={() => setSlide((value) => Math.max(0, value - 1))}
            className="inline-flex items-center gap-2 text-xs font-bold disabled:opacity-30"
          >
            <ChevronLeft className="h-4 w-4" /> Previous
          </button>
          <span className="text-xs text-slate-400">
            {slide + 1} / {presentationSlideCount}
          </span>
          <button
            disabled={slide >= presentationSlideCount - 1}
            onClick={() =>
              setSlide((value) =>
                Math.min(presentationSlideCount - 1, value + 1),
              )
            }
            className="inline-flex items-center gap-2 text-xs font-bold disabled:opacity-30"
          >
            Next <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      ) : null}
    </div>
  );
}

function splitSlides(content: string) {
  const matches = content
    .split(/--- Slide \d+ ---/i)
    .map((value) => value.trim())
    .filter(Boolean);
  return matches.length ? matches : content ? [content] : [];
}

function isEditableTarget(target: EventTarget | null) {
  const element = target instanceof HTMLElement ? target : null;
  return Boolean(
    element?.isContentEditable ||
      element?.closest("input, textarea, select, [contenteditable='true']"),
  );
}

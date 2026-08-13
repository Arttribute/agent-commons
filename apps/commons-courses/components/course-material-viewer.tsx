"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Expand,
  FileText,
  LoaderCircle,
  MonitorUp,
  MousePointer2,
  PictureInPicture2,
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
  presenter = false,
}: {
  materialId: string;
  compact?: boolean;
  presenter?: boolean;
}) {
  const [material, setMaterial] = useState<MaterialData | null>(null);
  const [error, setError] = useState("");
  const [slide, setSlide] = useState(0);
  const [full, setFull] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [presenterNotice, setPresenterNotice] = useState("");
  const [pointerEnabled, setPointerEnabled] = useState(false);
  const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const channelRef = useRef<BroadcastChannel | null>(null);
  const sourceIdRef = useRef("");
  const stateRef = useRef({
    slide: 0,
    pointerEnabled: false,
    pointer: null as { x: number; y: number } | null,
  });
  const controlsTimerRef = useRef<number | null>(null);
  const receivedStateRef = useRef(false);
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
    stateRef.current = { slide, pointerEnabled, pointer };
  }, [pointer, pointerEnabled, slide]);
  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    sourceIdRef.current ||= crypto.randomUUID();
    const channel = new BroadcastChannel(
      `commonlab-presentation:${materialId}`,
    );
    channelRef.current = channel;
    channel.onmessage = (
      event: MessageEvent<{
        source?: string;
        type?: string;
        slide?: number;
        pointerEnabled?: boolean;
        pointer?: { x: number; y: number } | null;
      }>,
    ) => {
      const message = event.data;
      if (!message || message.source === sourceIdRef.current) return;
      if (message.type === "ready") {
        channel.postMessage({
          type: "state",
          source: sourceIdRef.current,
          ...stateRef.current,
        });
        return;
      }
      if (message.type !== "state") return;
      receivedStateRef.current = true;
      if (typeof message.slide === "number")
        setSlide(
          Math.max(0, Math.min(presentationSlideCount - 1, message.slide)),
        );
      if (typeof message.pointerEnabled === "boolean")
        setPointerEnabled(message.pointerEnabled);
      setPointer(message.pointer || null);
    };
    channel.postMessage({ type: "ready", source: sourceIdRef.current });
    return () => {
      channel.close();
      channelRef.current = null;
    };
  }, [materialId, presentationSlideCount]);
  const broadcastState = useCallback(
    (next: Partial<typeof stateRef.current>) => {
      const state = { ...stateRef.current, ...next };
      stateRef.current = state;
      channelRef.current?.postMessage({
        type: "state",
        source: sourceIdRef.current,
        ...state,
      });
    },
    [],
  );
  useEffect(() => {
    if (receivedStateRef.current) return;
    broadcastState({ slide, pointerEnabled, pointer });
  }, [broadcastState, pointer, pointerEnabled, slide]);
  useEffect(() => {
    const handleFullscreenChange = () => {
      const active = document.fullscreenElement === containerRef.current;
      setFull(active);
      setControlsVisible(true);
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () =>
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);
  const revealControls = useCallback(() => {
    setControlsVisible(true);
    if (controlsTimerRef.current) window.clearTimeout(controlsTimerRef.current);
    if (full || presenter) {
      controlsTimerRef.current = window.setTimeout(
        () => setControlsVisible(false),
        2400,
      );
    }
  }, [full, presenter]);
  useEffect(() => {
    if (full || presenter) revealControls();
  }, [full, presenter, revealControls]);
  useEffect(
    () => () => {
      if (controlsTimerRef.current)
        window.clearTimeout(controlsTimerRef.current);
    },
    [],
  );
  async function toggleFullscreen() {
    if (document.fullscreenElement === containerRef.current) {
      await document.exitFullscreen();
      return;
    }
    try {
      await containerRef.current?.requestFullscreen({ navigationUI: "hide" });
    } catch {
      setPresenterNotice(
        "Your browser blocked full screen. Use the browser menu or press F11.",
      );
    }
  }
  function openPresenterWindow() {
    const popup = window.open(
      `/present/materials/${materialId}`,
      `commonlab-presenter-${materialId}`,
      "popup=yes,width=1440,height=900,menubar=no,toolbar=no,location=no,status=no",
    );
    if (popup) {
      popup.focus();
      setPresenterNotice(
        "Presentation window opened. Move it to the extended display, then choose Full screen there.",
      );
    } else {
      setPresenterNotice(
        "Allow pop-ups for CommonLab, then try Presenter window again.",
      );
    }
  }
  useEffect(() => {
    if (material?.kind !== "presentation") return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) return;
      if (["ArrowLeft", "PageUp"].includes(event.key)) {
        event.preventDefault();
        setSlide((value) => {
          const next = Math.max(0, value - 1);
          broadcastState({ slide: next });
          return next;
        });
      }
      if (["ArrowRight", "PageDown", " "].includes(event.key)) {
        event.preventDefault();
        setSlide((value) => {
          const next = Math.min(presentationSlideCount - 1, value + 1);
          broadcastState({ slide: next });
          return next;
        });
      }
      if (event.key === "Home") {
        event.preventDefault();
        setSlide(0);
        broadcastState({ slide: 0 });
      }
      if (event.key === "End") {
        event.preventDefault();
        setSlide(presentationSlideCount - 1);
        broadcastState({ slide: presentationSlideCount - 1 });
      }
      if (event.key.toLowerCase() === "l") {
        setPointerEnabled((value) => {
          broadcastState({ pointerEnabled: !value, pointer: null });
          return !value;
        });
        setPointer(null);
      }
      if (event.key.toLowerCase() === "f") void toggleFullscreen();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [broadcastState, material?.kind, presentationSlideCount]);
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
          full || presenter ? "h-dvh" : compact ? "h-[58vh]" : "h-[72vh]",
        )}
      />
    ) : material.kind === "presentation" && visualSlideCount ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={material.imageUrls[Math.min(slide, visualSlideCount - 1)]}
        alt={`${material.name}, slide ${slide + 1}`}
        className={cn(
          "mx-auto w-full bg-slate-950 object-contain",
          full || presenter ? "h-dvh" : compact ? "h-[58vh]" : "h-[72vh]",
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
          full || presenter ? "h-dvh" : compact ? "h-[58vh]" : "h-[72vh]",
        )}
        allowFullScreen
      />
    ) : (
      <div
        className={cn(
          "flex min-h-[420px] items-center justify-center bg-slate-950 p-8 text-white sm:p-14",
          (full || presenter) && "min-h-dvh",
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
      ref={containerRef}
      onPointerMove={revealControls}
      className={cn(
        "overflow-hidden rounded-2xl border border-slate-200 bg-white",
        (full || presenter) &&
          "fixed inset-0 z-[100] rounded-none border-0 bg-slate-950",
      )}
    >
      <div
        className={cn(
          "flex h-14 items-center gap-3 border-b border-slate-200 bg-white px-4 transition-opacity duration-300",
          (full || presenter) &&
            "absolute inset-x-0 top-0 z-20 border-white/10 bg-slate-950/75 text-white backdrop-blur",
          (full || presenter) &&
            !controlsVisible &&
            "pointer-events-none opacity-0",
        )}
      >
        <FileText className="h-4 w-4 text-slate-400" />
        <p
          className={cn(
            "min-w-0 flex-1 truncate text-sm font-bold",
            full || presenter ? "text-white" : "text-slate-800",
          )}
        >
          {material.name}
        </p>
        {material.kind === "presentation" ? (
          <button
            onClick={() => {
              setPointerEnabled((value) => {
                broadcastState({ pointerEnabled: !value, pointer: null });
                return !value;
              });
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
        {material.kind === "presentation" && !presenter ? (
          <button
            onClick={openPresenterWindow}
            className="inline-flex items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-bold text-slate-500 hover:bg-slate-100"
            title="Open presenter window for an extended display"
          >
            <PictureInPicture2 className="h-4 w-4" />
            <span className="hidden xl:inline">Presenter window</span>
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
          onClick={() => void toggleFullscreen()}
          className="inline-flex items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-bold text-slate-500 hover:bg-slate-100"
          title={full ? "Exit full screen (F)" : "Present full screen (F)"}
        >
          {full ? <X className="h-4 w-4" /> : <Expand className="h-4 w-4" />}
          <span className="hidden xl:inline">
            {full ? "Exit full screen" : "Full screen"}
          </span>
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
          const nextPointer = {
            x: ((event.clientX - bounds.left) / bounds.width) * 100,
            y: ((event.clientY - bounds.top) / bounds.height) * 100,
          };
          setPointer(nextPointer);
          broadcastState({ pointer: nextPointer });
        }}
        onPointerLeave={() => {
          setPointer(null);
          broadcastState({ pointer: null });
        }}
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
        <div
          className={cn(
            "flex h-14 items-center justify-between border-t border-slate-800 bg-slate-950 px-4 text-white transition-opacity duration-300",
            (full || presenter) &&
              "absolute inset-x-0 bottom-0 z-20 border-white/10 bg-slate-950/75 backdrop-blur",
            (full || presenter) &&
              !controlsVisible &&
              "pointer-events-none opacity-0",
          )}
        >
          <button
            disabled={slide <= 0}
            onClick={() =>
              setSlide((value) => {
                const next = Math.max(0, value - 1);
                broadcastState({ slide: next });
                return next;
              })
            }
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
              setSlide((value) => {
                const next = Math.min(presentationSlideCount - 1, value + 1);
                broadcastState({ slide: next });
                return next;
              })
            }
            className="inline-flex items-center gap-2 text-xs font-bold disabled:opacity-30"
          >
            Next <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      ) : null}
      {presenterNotice && !presenter ? (
        <div className="absolute bottom-16 left-1/2 z-30 max-w-lg -translate-x-1/2 rounded-xl bg-slate-950/90 px-4 py-3 text-center text-xs font-bold text-white shadow-2xl">
          <MonitorUp className="mr-2 inline h-4 w-4" />
          {presenterNotice}
          <button
            onClick={() => setPresenterNotice("")}
            className="ml-3 opacity-60 hover:opacity-100"
            aria-label="Dismiss"
          >
            <X className="inline h-3.5 w-3.5" />
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

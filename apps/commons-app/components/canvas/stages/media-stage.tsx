"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AudioLines,
  Captions,
  ChevronLeft,
  ChevronRight,
  Loader2,
  MessageSquarePlus,
  Pause,
  Play,
  Repeat,
  Scissors,
  SquareSplitHorizontal,
  X,
} from "lucide-react";
import { useWorkspaceMode } from "@/context/WorkspaceModeContext";
import { apiErrorMessage } from "@/lib/api-error";
import { useCanvasStore } from "@/stores/canvas-store";
import { cn } from "@/lib/utils";
import {
  NoteMarkers,
  SpatialLayer,
  StageMessage,
  fitInStage,
  useElementSize,
  type StageProps,
} from "./stage-kit";

/** How close the playhead must be for a frame note to show on the video. */
const FRAME_WINDOW_MS = 750;

type Segment = { startMs: number; endMs: number; text: string };
type Analysis = {
  durationMs?: number;
  fps?: number;
  transcript?: { segments?: Segment[]; note?: string } | null;
  scenes?: number[];
  silences?: Array<{ startMs: number; endMs: number }>;
};
type Range = { startMs: number; endMs: number };

/** 1:02.345, with milliseconds for precise work. */
export function timecode(ms: number) {
  const safe = Math.max(0, ms);
  const minutes = Math.floor(safe / 60_000);
  const seconds = Math.floor((safe % 60_000) / 1000);
  const millis = Math.floor(safe % 1000);
  return `${minutes}:${String(seconds).padStart(2, "0")}.${String(millis).padStart(3, "0")}`;
}

export function MediaStage({
  preview,
  tool,
  notes,
  numberOf,
  focusedNoteId,
  zoom,
  canAnnotate,
  onDraft,
  onOpenNote,
  onViewer,
}: StageProps) {
  const { mode } = useWorkspaceMode();
  const sendPrompt = useCanvasStore((state) => state.sendPrompt);
  const dockInset = useCanvasStore((state) => state.dockInset);
  const source = preview.inline?.url || preview.download?.url;
  const isVideo = preview.mimeType.startsWith("video/") || preview.kind === "video";
  const noun = isVideo ? "video" : "recording";
  const media = useRef<HTMLVideoElement & HTMLAudioElement>(null);
  const outer = useRef<HTMLDivElement>(null);
  const size = useElementSize(outer);
  const [natural, setNatural] = useState<{ width: number; height: number } | null>(null);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);
  const [selection, setSelection] = useState<Range | null>(null);
  const [loop, setLoop] = useState(false);
  const [analysis, setAnalysis] = useState<Analysis | null>(
    (preview.metadata?.mediaAnalysis as Analysis | undefined) ?? null,
  );
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState("");
  const [showTranscript, setShowTranscript] = useState(Boolean(preview.metadata?.mediaAnalysis));
  const lastReport = useRef(0);
  const analysisRequest = useRef(0);
  const fps = analysis?.fps && analysis.fps > 0 ? analysis.fps : 30;
  const frameMs = 1000 / fps;
  const segments = analysis?.transcript?.segments ?? [];
  const box = isVideo ? fitInStage(size, natural, showTranscript && segments.length ? 150 : 120) : null;

  useEffect(() => {
    ++analysisRequest.current;
    setAnalyzing(false);
    setAnalysisError("");
    setAnalysis((preview.metadata?.mediaAnalysis as Analysis | undefined) ?? null);
    setSelection(null);
  }, [preview.itemId, preview.metadata]);

  const report = useCallback(
    (force = false) => {
      const now = Date.now();
      if (!force && now - lastReport.current < 2000) return;
      lastReport.current = now;
      onViewer({ timeMs: Math.round((media.current?.currentTime ?? 0) * 1000), durationMs: Math.round(duration) });
    },
    [duration, onViewer],
  );

  const seek = useCallback(
    (ms: number) => {
      if (!media.current) return;
      const clamped = Math.max(0, Math.min(ms, duration || ms));
      media.current.currentTime = clamped / 1000;
      setTime(clamped);
      report(true);
    },
    [duration, report],
  );
  const pause = () => media.current?.pause();
  const toggle = useCallback(() => {
    if (!media.current) return;
    if (media.current.paused) {
      if (loop && selection && (time < selection.startMs || time >= selection.endMs)) seek(selection.startMs);
      void media.current.play();
    } else media.current.pause();
  }, [loop, seek, selection, time]);

  // Jump to a focused note's moment and show its range.
  useEffect(() => {
    const note = notes.find((entry) => entry.annotationId === focusedNoteId);
    if (note && typeof note.startMs === "number") {
      pause();
      seek(note.startMs);
      if (typeof note.endMs === "number" && note.endMs - note.startMs > 200) {
        setSelection({ startMs: note.startMs, endMs: note.endMs });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusedNoteId]);

  // Keyboard: space plays, arrows step frames (shift: seconds), I and O set a range.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const element = event.target as HTMLElement | null;
      if (element?.closest("input, textarea, select, [contenteditable='true'], [role='dialog']")) return;
      if (event.key === " ") {
        event.preventDefault();
        toggle();
      } else if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        pause();
        const step = event.shiftKey ? 1000 : frameMs;
        seek(time + (event.key === "ArrowRight" ? step : -step));
      } else if (event.key.toLowerCase() === "i") {
        setSelection((current) => ({ startMs: time, endMs: Math.max(time + frameMs, current?.endMs ?? duration) }));
      } else if (event.key.toLowerCase() === "o") {
        setSelection((current) => ({ startMs: Math.min(current?.startMs ?? 0, time - frameMs), endMs: time }));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [duration, frameMs, seek, time, toggle]);

  if (!source || failed) {
    return <StageMessage title={`This ${noun} could not be played`} detail="Download it to play the original." />;
  }

  const frameIndex = Math.floor(time / frameMs);
  const atMs = Math.round(time);
  const frameNotes = notes.filter(
    (note) => typeof note.startMs !== "number" || Math.abs(note.startMs - atMs) <= FRAME_WINDOW_MS,
  );
  const caption = segments.find((segment) => time >= segment.startMs && time <= segment.endMs)?.text;
  const transcriptFor = (range: Range) =>
    segments
      .filter((segment) => segment.endMs > range.startMs && segment.startMs < range.endMs)
      .map((segment) => segment.text)
      .join(" ")
      .slice(0, 2000) || undefined;

  const analyze = async () => {
    const request = ++analysisRequest.current;
    const selectedAgentId = useCanvasStore.getState().agentId;
    setAnalyzing(true);
    setAnalysisError("");
    try {
      if (mode === "private-local") {
        if (!source || !window.agentCommonsLocal) throw new Error("Open a playable local recording first");
        const audio = new AudioContext();
        try {
          const bytes = await fetch(source).then((response) => response.arrayBuffer());
          const decoded = await audio.decodeAudioData(bytes);
          if (!Number.isFinite(decoded.duration) || decoded.duration > 1800) throw new Error("Canvas transcription supports recordings up to 30 minutes long.");
          const offline = new OfflineAudioContext(1, Math.ceil(decoded.duration * 16000), 16000);
          const track = offline.createBufferSource();
          track.buffer = decoded;
          track.connect(offline.destination);
          track.start();
          const rendered = await offline.startRendering();
          const result = await window.agentCommonsLocal.analyzeAudio(new Float32Array(rendered.getChannelData(0)), preview.itemId, selectedAgentId || undefined);
          if (request !== analysisRequest.current) return;
          setAnalysis(result);
          setShowTranscript(true);
        } finally { await audio.close(); }
        return;
      }
      const response = await fetch("/api/canvas/media/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileId: preview.itemId }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(apiErrorMessage(payload, "The transcript could not be made"));
      if (request !== analysisRequest.current) return;
      setAnalysis((payload?.data ?? payload) as Analysis);
      setShowTranscript(true);
    } catch (cause) {
      if (request !== analysisRequest.current) return;
      setAnalysisError(cause instanceof Error ? cause.message : "The transcript could not be made");
    } finally {
      if (request === analysisRequest.current) setAnalyzing(false);
    }
  };

  const bindings = {
    onTimeUpdate: () => {
      const now = (media.current?.currentTime ?? 0) * 1000;
      if (loop && selection && now >= selection.endMs) {
        seek(selection.startMs);
        return;
      }
      setTime(now);
      report();
    },
    onDurationChange: () => setDuration((media.current?.duration || 0) * 1000),
    onPlay: () => setPlaying(true),
    onPause: () => {
      setPlaying(false);
      report(true);
    },
    onError: () => setFailed(true),
  };

  const rangeLabel = selection ? `${timecode(selection.startMs)}–${timecode(selection.endMs)}` : "";
  const rangeExact = selection ? `(startMs ${Math.round(selection.startMs)}, endMs ${Math.round(selection.endMs)})` : "";

  return (
    <div ref={outer} className="relative h-full w-full">
      {isVideo ? (
        <div
          className="absolute"
          style={
            box
              ? { left: box.left, top: box.top, width: box.width, height: box.height, transform: `scale(${zoom})`, transformOrigin: "center" }
              : { inset: 0, opacity: 0 }
          }
        >
          <video
            ref={media}
            src={source}
            playsInline
            preload="metadata"
            className="h-full w-full rounded-[3px] bg-black object-contain shadow-card"
            onLoadedMetadata={(event) => {
              setNatural({ width: event.currentTarget.videoWidth || 16, height: event.currentTarget.videoHeight || 9 });
              setDuration((event.currentTarget.duration || 0) * 1000);
            }}
            onClick={() => tool === "interact" && toggle()}
            {...bindings}
          />
          {caption && showTranscript && (
            <p className="pointer-events-none absolute inset-x-6 bottom-4 z-10 mx-auto w-fit max-w-[90%] rounded-md bg-black/70 px-2.5 py-1 text-center text-sm leading-snug text-white">
              {caption}
            </p>
          )}
          <SpatialLayer
            tool={tool}
            disabled={!canAnnotate}
            onPoint={(point, anchor) => {
              pause();
              onDraft({
                kind: "point",
                target: { type: "point", frameTimeMs: atMs },
                geometry: point,
                startMs: atMs,
                endMs: atMs + Math.round(frameMs),
                intrinsicSize: natural,
                anchor,
              });
            }}
            onRegion={(region, anchor) => {
              pause();
              onDraft({
                kind: "region",
                target: { type: "region", frameTimeMs: atMs },
                geometry: region,
                startMs: selection?.startMs ?? atMs,
                endMs: selection?.endMs ?? atMs + Math.round(frameMs),
                intrinsicSize: natural,
                anchor,
              });
            }}
          />
          <div className="pointer-events-none absolute inset-0 z-20">
            <NoteMarkers notes={frameNotes} numberOf={numberOf} focusedNoteId={focusedNoteId} onOpenNote={onOpenNote} />
          </div>
        </div>
      ) : (
        <div className="flex h-full items-center justify-center px-6 pb-56">
          <div className="flex w-full max-w-md flex-col items-center rounded-3xl bg-white px-8 py-8 text-center shadow-card ring-1 ring-stone-900/5">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-stone-100 text-stone-500">
              <AudioLines className="h-6 w-6" strokeWidth={1.5} />
            </span>
            <p className="mt-3 max-w-full truncate text-sm font-medium text-stone-900">{preview.name}</p>
            {caption && showTranscript && <p className="mt-3 text-sm leading-6 text-stone-600">{caption}</p>}
            <audio ref={media} src={source} preload="metadata" className="hidden" {...bindings} />
          </div>
        </div>
      )}

      {/* Timeline */}
      <div
        className="pointer-events-none absolute inset-x-0 bottom-20 flex justify-center px-4 transition-[padding] duration-200"
        style={{ paddingRight: Math.max(16, dockInset) }}
      >
        <div className="pointer-events-auto w-full max-w-4xl rounded-2xl border border-stone-200/80 bg-white/95 p-2 shadow-floating backdrop-blur">
          <div className="flex items-center gap-1.5 px-1 pb-2">
            <button
              type="button"
              onClick={toggle}
              aria-label={playing ? "Pause" : "Play"}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-stone-900 text-white hover:bg-stone-800"
            >
              {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="ml-0.5 h-3.5 w-3.5" />}
            </button>
            <IconControl label="Previous frame (←)" onClick={() => { pause(); seek(time - frameMs); }}>
              <ChevronLeft />
            </IconControl>
            <IconControl label="Next frame (→)" onClick={() => { pause(); seek(time + frameMs); }}>
              <ChevronRight />
            </IconControl>
            <span className="ml-1 font-mono text-[11px] tabular-nums text-stone-700">
              {timecode(time)}
              <span className="text-stone-400"> / {timecode(duration)}</span>
            </span>
            {isVideo && <span className="font-mono text-[10px] tabular-nums text-stone-400">frame {frameIndex}</span>}
            <div className="ml-auto flex items-center gap-1">
              {selection ? (
                <>
                  <span className="hidden font-mono text-[11px] tabular-nums text-stone-600 sm:inline">{rangeLabel}</span>
                  <IconControl label={loop ? "Stop looping" : "Loop selection"} active={loop} onClick={() => setLoop((value) => !value)}>
                    <Repeat />
                  </IconControl>
                  {canAnnotate && (
                    <TextControl
                      onClick={(event) => {
                        pause();
                        const rect = event.currentTarget.getBoundingClientRect();
                        onDraft({
                          kind: "time_range",
                          target: { type: "time", transcript: transcriptFor(selection) },
                          startMs: Math.round(selection.startMs),
                          endMs: Math.round(selection.endMs),
                          anchor: { x: rect.left - 160, y: rect.top - 200 },
                        });
                      }}
                    >
                      <MessageSquarePlus className="h-3.5 w-3.5" /> Note
                    </TextControl>
                  )}
                  <TextControl onClick={() => sendPrompt(`Trim this ${noun} to ${rangeLabel} ${rangeExact}.`, "send")}>
                    <SquareSplitHorizontal className="h-3.5 w-3.5" /> Trim to this
                  </TextControl>
                  <TextControl onClick={() => sendPrompt(`Cut ${rangeLabel} ${rangeExact} out of this ${noun} and join the rest cleanly.`, "send")}>
                    <Scissors className="h-3.5 w-3.5" /> Cut
                  </TextControl>
                  <IconControl label="Clear selection" onClick={() => { setSelection(null); setLoop(false); }}>
                    <X />
                  </IconControl>
                </>
              ) : (
                <>
                  <span className="hidden text-[11px] text-stone-400 md:inline">Drag on the timeline to select</span>
                  {canAnnotate && (
                    <TextControl
                      onClick={(event) => {
                        pause();
                        const rect = event.currentTarget.getBoundingClientRect();
                        onDraft({
                          kind: "time_range",
                          target: { type: "time", transcript: transcriptFor({ startMs: atMs, endMs: atMs + 1 }) },
                          startMs: atMs,
                          endMs: atMs + Math.round(frameMs),
                          anchor: { x: rect.left - 160, y: rect.top - 200 },
                        });
                      }}
                    >
                      <MessageSquarePlus className="h-3.5 w-3.5" /> Note at {timecode(time).slice(0, -4)}
                    </TextControl>
                  )}
                </>
              )}
              {(
                <IconControl
                  label={
                    analyzing
                      ? "Transcribing…"
                      : segments.length
                        ? showTranscript
                          ? "Hide transcript"
                          : "Show transcript"
                        : "Transcribe"
                  }
                  active={showTranscript && segments.length > 0}
                  disabled={analyzing}
                  onClick={() => (segments.length ? setShowTranscript((value) => !value) : void analyze())}
                >
                  {analyzing ? <Loader2 className="animate-spin" /> : <Captions />}
                </IconControl>
              )}
            </div>
          </div>
          <Track
            source={source}
            isVideo={isVideo}
            itemId={preview.itemId}
            time={time}
            duration={duration}
            selection={selection}
            notes={notes}
            focusedNoteId={focusedNoteId}
            scenes={analysis?.scenes ?? []}
            numberOf={numberOf}
            onSeek={(ms) => seek(ms)}
            onSelect={(range) => {
              pause();
              setSelection(range);
              if (range) seek(range.startMs);
            }}
            onOpenNote={onOpenNote}
          />
          {showTranscript && segments.length > 0 && (
            <TranscriptLane
              segments={segments}
              duration={duration}
              time={time}
              onPick={(segment, extend) => {
                seek(segment.startMs);
                setSelection((current) =>
                  extend && current
                    ? { startMs: Math.min(current.startMs, segment.startMs), endMs: Math.max(current.endMs, segment.endMs) }
                    : { startMs: segment.startMs, endMs: segment.endMs },
                );
              }}
            />
          )}
          {analysisError && <p className="px-1 pt-1.5 text-xs text-red-600">{analysisError}</p>}
        </div>
      </div>
    </div>
  );
}

function IconControl({
  label,
  onClick,
  active,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      aria-pressed={active}
      className={cn(
        "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-stone-500 hover:bg-stone-100 hover:text-stone-900 disabled:opacity-50 [&_svg]:h-4 [&_svg]:w-4",
        active && "bg-stone-100 text-stone-900",
      )}
    >
      {children}
    </button>
  );
}

function TextControl({
  onClick,
  children,
}: {
  onClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-7 shrink-0 items-center gap-1.5 rounded-lg px-2 text-xs text-stone-600 hover:bg-stone-100 hover:text-stone-900"
    >
      {children}
    </button>
  );
}

/** Filmstrip or waveform with playhead, range selection and note bands. */
function Track({
  source,
  isVideo,
  itemId,
  time,
  duration,
  selection,
  notes,
  focusedNoteId,
  scenes,
  numberOf,
  onSeek,
  onSelect,
  onOpenNote,
}: {
  source: string;
  isVideo: boolean;
  itemId: string;
  time: number;
  duration: number;
  selection: Range | null;
  notes: StageProps["notes"];
  focusedNoteId?: string | null;
  scenes: number[];
  numberOf: StageProps["numberOf"];
  onSeek: (ms: number) => void;
  onSelect: (range: Range | null) => void;
  onOpenNote: StageProps["onOpenNote"];
}) {
  const track = useRef<HTMLDivElement>(null);
  const { width } = useElementSize(track);
  const drag = useRef<{ startMs: number; moved: boolean } | null>(null);
  const [draft, setDraft] = useState<Range | null>(null);
  const toMs = (clientX: number) => {
    const rect = track.current!.getBoundingClientRect();
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)) * duration;
  };
  const pct = (ms: number) => `${duration ? (ms / duration) * 100 : 0}%`;
  const shown = draft ?? selection;
  const timed = notes.filter((note) => typeof note.startMs === "number");

  return (
    <div
      ref={track}
      className="relative h-14 cursor-text touch-none select-none overflow-hidden rounded-lg bg-stone-900"
      onPointerDown={(event) => {
        if (!duration || event.button !== 0) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = { startMs: toMs(event.clientX), moved: false };
      }}
      onPointerMove={(event) => {
        if (!drag.current) return;
        const ms = toMs(event.clientX);
        if (Math.abs(ms - drag.current.startMs) > duration * 0.004) drag.current.moved = true;
        if (drag.current.moved) {
          setDraft({ startMs: Math.min(drag.current.startMs, ms), endMs: Math.max(drag.current.startMs, ms) });
        }
      }}
      onPointerUp={(event) => {
        const current = drag.current;
        drag.current = null;
        setDraft(null);
        if (!current) return;
        if (current.moved) {
          const ms = toMs(event.clientX);
          onSelect({ startMs: Math.min(current.startMs, ms), endMs: Math.max(current.startMs, ms) });
        } else {
          onSeek(current.startMs);
        }
      }}
    >
      {isVideo ? (
        <Filmstrip source={source} duration={duration} width={width} />
      ) : (
        <Waveform itemId={itemId} source={source} width={width} />
      )}
      {scenes.map((scene) => (
        <span key={scene} className="pointer-events-none absolute inset-y-0 w-px bg-white/40" style={{ left: pct(scene) }} />
      ))}
      {timed.map((note) => {
        const start = note.startMs!;
        const end = Math.max(start, note.endMs ?? start);
        const focused = note.annotationId === focusedNoteId;
        return (
          <button
            key={note.annotationId}
            type="button"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              onSeek(start);
              const rect = event.currentTarget.getBoundingClientRect();
              onOpenNote(note, { x: rect.left, y: rect.top - 200 });
            }}
            aria-label={`Note ${numberOf(note.annotationId)}: ${note.body}`}
            title={note.body}
            className={cn(
              "absolute top-0 h-2 min-w-1.5 rounded-b-sm",
              note.status === "resolved" ? "bg-stone-400" : focused ? "bg-amber-300" : "bg-amber-400",
            )}
            style={{ left: pct(start), width: `max(6px, ${pct(end - start)})` }}
          />
        );
      })}
      {shown && (
        <>
          <span className="pointer-events-none absolute inset-y-0 left-0 bg-stone-950/60" style={{ width: pct(shown.startMs) }} />
          <span className="pointer-events-none absolute inset-y-0 right-0 bg-stone-950/60" style={{ left: pct(shown.endMs) }} />
          <span
            className="pointer-events-none absolute inset-y-0 rounded-sm border-2 border-amber-300"
            style={{ left: pct(shown.startMs), width: pct(shown.endMs - shown.startMs) }}
          />
        </>
      )}
      <span className="pointer-events-none absolute inset-y-0 w-0.5 bg-white shadow-[0_0_4px_rgba(0,0,0,0.6)]" style={{ left: pct(time) }} />
    </div>
  );
}

/** Frames from the video drawn across the track. */
function Filmstrip({ source, duration, width }: { source: string; duration: number; width: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const tiles = Math.max(4, Math.min(24, Math.floor(width / 72)));
  useEffect(() => {
    const target = canvas.current;
    if (!target || !duration || !width) return;
    let cancelled = false;
    const video = document.createElement("video");
    video.muted = true;
    video.preload = "auto";
    video.src = source;
    const context = target.getContext("2d");
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    target.width = Math.round(width * ratio);
    target.height = Math.round(56 * ratio);
    const tileWidth = target.width / tiles;
    const draw = async () => {
      for (let index = 0; index < tiles && !cancelled; index += 1) {
        await new Promise<void>((resolve) => {
          const done = () => {
            video.removeEventListener("seeked", done);
            resolve();
          };
          video.addEventListener("seeked", done);
          video.currentTime = ((index + 0.5) / tiles) * (duration / 1000);
          window.setTimeout(done, 1500);
        });
        if (cancelled || !context || !video.videoWidth) continue;
        const scale = Math.max(tileWidth / video.videoWidth, target.height / video.videoHeight);
        const w = video.videoWidth * scale;
        const h = video.videoHeight * scale;
        context.save();
        context.beginPath();
        context.rect(index * tileWidth, 0, tileWidth, target.height);
        context.clip();
        context.drawImage(video, index * tileWidth + (tileWidth - w) / 2, (target.height - h) / 2, w, h);
        context.restore();
      }
    };
    video.addEventListener("loadeddata", () => void draw(), { once: true });
    return () => {
      cancelled = true;
      video.removeAttribute("src");
      video.load();
    };
  }, [duration, source, tiles, width]);
  return <canvas ref={canvas} className="pointer-events-none absolute inset-0 h-full w-full opacity-80" />;
}

/** Peaks of the decoded audio, drawn as bars. */
function Waveform({ itemId, source, width }: { itemId: string; source: string; width: number }) {
  const [peaks, setPeaks] = useState<number[]>([]);
  const bars = Math.max(40, Math.min(320, Math.floor(width / 4)));
  useEffect(() => {
    let cancelled = false;
    const url = source.startsWith("data:") ? source : `/api/library-file/${encodeURIComponent(itemId)}`;
    fetch(url)
      .then((response) => {
        if (!response.ok) throw new Error("unavailable");
        const length = Number(response.headers.get("content-length") ?? 0);
        if (length > 60 * 1024 * 1024) throw new Error("too large");
        return response.arrayBuffer();
      })
      .then((bytes) => new AudioContext().decodeAudioData(bytes))
      .then((buffer) => {
        if (cancelled) return;
        const data = buffer.getChannelData(0);
        const block = Math.floor(data.length / bars) || 1;
        const next: number[] = [];
        for (let index = 0; index < bars; index += 1) {
          let peak = 0;
          for (let offset = 0; offset < block; offset += 32) {
            peak = Math.max(peak, Math.abs(data[index * block + offset] ?? 0));
          }
          next.push(peak);
        }
        const max = Math.max(...next, 0.01);
        setPeaks(next.map((value) => value / max));
      })
      .catch(() => {
        if (!cancelled) setPeaks([]);
      });
    return () => {
      cancelled = true;
    };
  }, [bars, itemId, source]);
  const values = useMemo(
    () => (peaks.length ? peaks : Array.from({ length: bars }, (_, index) => 0.25 + ((index * 37) % 50) / 100)),
    [bars, peaks],
  );
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center gap-px px-1">
      {values.map((value, index) => (
        <span
          key={index}
          className={cn("flex-1 rounded-full", peaks.length ? "bg-white/70" : "bg-white/20")}
          style={{ height: `${Math.max(6, value * 90)}%` }}
        />
      ))}
    </div>
  );
}

/** Spoken segments under the track; click to select, shift-click to extend. */
function TranscriptLane({
  segments,
  duration,
  time,
  onPick,
}: {
  segments: Segment[];
  duration: number;
  time: number;
  onPick: (segment: Segment, extend: boolean) => void;
}) {
  if (!duration) return null;
  return (
    <div className="relative mt-1.5 h-7 overflow-hidden rounded-md bg-stone-100">
      {segments.map((segment, index) => {
        const active = time >= segment.startMs && time <= segment.endMs;
        return (
          <button
            key={`${segment.startMs}-${index}`}
            type="button"
            title={`${timecode(segment.startMs)}  ${segment.text}`}
            onClick={(event) => onPick(segment, event.shiftKey)}
            className={cn(
              "absolute inset-y-0.5 overflow-hidden rounded px-1 text-left text-[10px] leading-6 text-stone-600 hover:bg-white",
              active && "bg-white text-stone-900 shadow-card",
            )}
            style={{
              left: `${(segment.startMs / duration) * 100}%`,
              width: `${Math.max(0.4, ((segment.endMs - segment.startMs) / duration) * 100)}%`,
            }}
          >
            <span className="block truncate">{segment.text}</span>
          </button>
        );
      })}
    </div>
  );
}

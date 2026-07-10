"use client";

import { useEffect, useRef } from "react";
import { Check, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { VoiceRecorderState } from "@/hooks/use-voice-recorder";

/**
 * Composer overlay for voice input. While recording it shows a pulsing dot,
 * a live waveform, the elapsed time, and discard/accept controls; while
 * transcribing it shows a quiet shimmer line. Rendered in place of the
 * textarea + footer inside the chat input container.
 */
export function VoiceRecorderPanel({
  state,
  elapsedMs,
  getLevel,
  onCancel,
  onAccept,
}: {
  state: Exclude<VoiceRecorderState, "idle">;
  elapsedMs: number;
  getLevel: () => number;
  onCancel: () => void;
  onAccept: () => void;
}) {
  if (state === "transcribing") {
    return (
      <div className="flex h-[104px] items-center gap-2.5 px-4">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground/70" />
        <span className="text-shimmer text-sm">Transcribing…</span>
      </div>
    );
  }

  return (
    <div className="flex h-[104px] items-center gap-3 px-4">
      <span className="relative flex h-2 w-2 shrink-0">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-60" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
      </span>
      <WaveformCanvas getLevel={getLevel} className="h-10 min-w-0 flex-1 text-muted-foreground/80" />
      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
        {formatElapsed(elapsedMs)}
      </span>
      <button
        type="button"
        onClick={onCancel}
        title="Discard recording"
        aria-label="Discard recording"
        className="shrink-0 rounded-full p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <X className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={onAccept}
        title="Use recording"
        aria-label="Use recording"
        className="shrink-0 rounded-full bg-foreground p-2 text-background transition-opacity hover:opacity-80"
      >
        <Check className="h-4 w-4" />
      </button>
    </div>
  );
}

/**
 * Scrolling amplitude bars, newest at the right edge, with a dotted baseline
 * filling the unused width — drawn in `currentColor` so it inherits the
 * muted text color from the parent.
 */
function WaveformCanvas({
  getLevel,
  className,
}: {
  getLevel: () => number;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const levelsRef = useRef<number[]>([]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    let frame = 0;
    const BAR_WIDTH = 2;
    const SLOT_WIDTH = 4; // bar + gap

    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      if (width === 0 || height === 0) {
        frame = requestAnimationFrame(draw);
        return;
      }
      if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
        canvas.width = width * dpr;
        canvas.height = height * dpr;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);

      const levels = levelsRef.current;
      levels.push(Math.min(1, getLevel() * 3.5));
      const maxBars = Math.floor(width / SLOT_WIDTH);
      if (levels.length > maxBars) levels.splice(0, levels.length - maxBars);

      ctx.fillStyle = getComputedStyle(canvas).color;
      const centerY = height / 2;

      // Dotted baseline over the width the recording hasn't reached yet.
      const filledWidth = levels.length * SLOT_WIDTH;
      ctx.globalAlpha = 0.3;
      for (let x = 0; x < width - filledWidth; x += SLOT_WIDTH * 2) {
        ctx.fillRect(x, centerY - 0.75, 1.5, 1.5);
      }

      ctx.globalAlpha = 1;
      levels.forEach((level, index) => {
        const x = width - (levels.length - index) * SLOT_WIDTH;
        const barHeight = Math.max(2, level * (height - 4));
        ctx.fillRect(x, centerY - barHeight / 2, BAR_WIDTH, barHeight);
      });

      frame = requestAnimationFrame(draw);
    };

    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [getLevel]);

  return <canvas ref={canvasRef} className={cn("block w-full", className)} />;
}

function formatElapsed(ms: number) {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

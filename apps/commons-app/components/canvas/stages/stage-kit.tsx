"use client";

import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { MessageSquarePlus } from "lucide-react";
import type { CanvasAnnotation } from "@/lib/canvas";
import type { ArtifactPreview } from "@/lib/artifacts";
import type { CanvasViewerState } from "@/stores/canvas-store";
import { cn } from "@/lib/utils";
import {
  clamp01,
  noteGeometry,
  noteTarget,
  type NoteDraft,
  type NoteGeometry,
  type NoteTool,
} from "../canvas-notes";

export type StageProps = {
  preview: ArtifactPreview;
  tool: NoteTool;
  /** Notes on the version on screen, in list order. */
  notes: CanvasAnnotation[];
  numberOf: (annotationId: string) => number;
  focusedNoteId?: string | null;
  zoom: number;
  showPages: boolean;
  canAnnotate: boolean;
  onDraft: (draft: Omit<NoteDraft, "anchor"> & { anchor: { x: number; y: number } }) => void;
  onOpenNote: (note: CanvasAnnotation, anchor: { x: number; y: number }) => void;
  onViewer: (viewer: Partial<CanvasViewerState>) => void;
  /** Lets the toolbar know whether a pages rail makes sense. */
  onPages?: (count: number) => void;
  /** Source view for code and diagrams. */
  view: "preview" | "source";
};

/** Numbered pins and boxes for spatial notes inside a positioned frame. */
export function NoteMarkers({
  notes,
  numberOf,
  focusedNoteId,
  onOpenNote,
  filter,
}: {
  notes: CanvasAnnotation[];
  numberOf: (annotationId: string) => number;
  focusedNoteId?: string | null;
  onOpenNote: StageProps["onOpenNote"];
  filter?: (note: CanvasAnnotation) => boolean;
}) {
  return (
    <>
      {notes.filter((note) => !filter || filter(note)).map((note) => {
        const geometry = noteGeometry(note);
        const target = noteTarget(note);
        if (!geometry || target?.type === "text") return null;
        const focused = note.annotationId === focusedNoteId;
        const resolved = note.status === "resolved";
        const isRegion = typeof geometry.width === "number" && typeof geometry.height === "number";
        const open = (event: React.MouseEvent) => {
          event.stopPropagation();
          const box = (event.currentTarget as HTMLElement).getBoundingClientRect();
          onOpenNote(note, { x: box.right + 8, y: box.top });
        };
        return (
          <span key={note.annotationId} className="pointer-events-none">
            {isRegion && (
              <span
                className={cn(
                  "absolute rounded-[3px] border-[1.5px] transition-colors",
                  resolved
                    ? "border-stone-400/60 bg-stone-300/10"
                    : focused
                      ? "border-amber-500 bg-amber-300/20"
                      : "border-amber-400/90 bg-amber-200/10",
                )}
                style={{
                  left: `${geometry.x * 100}%`,
                  top: `${geometry.y * 100}%`,
                  width: `${(geometry.width ?? 0) * 100}%`,
                  height: `${(geometry.height ?? 0) * 100}%`,
                }}
              />
            )}
            <button
              type="button"
              onClick={open}
              onPointerDown={(event) => event.stopPropagation()}
              aria-label={`Note ${numberOf(note.annotationId)}: ${note.body}`}
              className={cn(
                "pointer-events-auto absolute flex h-6 min-w-6 -translate-y-full items-center justify-center rounded-full rounded-bl-none px-1.5 text-[11px] font-medium shadow-floating ring-2 ring-white transition-transform hover:scale-105",
                resolved ? "bg-stone-400 text-white" : "bg-stone-900 text-white",
                focused && "scale-110 bg-amber-500",
                !isRegion && "-translate-x-0",
              )}
              style={{
                left: `${(isRegion ? geometry.x + (geometry.width ?? 0) : geometry.x) * 100}%`,
                top: `${geometry.y * 100}%`,
              }}
            >
              {numberOf(note.annotationId)}
            </button>
          </span>
        );
      })}
    </>
  );
}

/**
 * Captures a point or a dragged region over a content frame. Coordinates are
 * normalized to the frame so they survive zoom and resizing.
 */
export function SpatialLayer({
  tool,
  disabled,
  onPoint,
  onRegion,
  children,
  className,
}: {
  tool: NoteTool;
  disabled?: boolean;
  onPoint: (point: NoteGeometry, anchor: { x: number; y: number }) => void;
  onRegion: (region: Required<NoteGeometry>, anchor: { x: number; y: number }) => void;
  children?: ReactNode;
  className?: string;
}) {
  const start = useRef<{ x: number; y: number } | null>(null);
  const [draft, setDraft] = useState<Required<NoteGeometry> | null>(null);
  const drawing = !disabled && (tool === "point" || tool === "region");

  const normalized = (event: ReactPointerEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    return {
      x: clamp01((event.clientX - box.left) / box.width),
      y: clamp01((event.clientY - box.top) / box.height),
    };
  };

  return (
    <div
      className={cn(
        "absolute inset-0 z-10 touch-none",
        drawing ? "cursor-crosshair" : "pointer-events-none",
        className,
      )}
      onPointerDown={(event) => {
        if (!drawing || event.button !== 0) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        const point = normalized(event);
        if (tool === "point") {
          onPoint(point, { x: event.clientX + 12, y: event.clientY - 12 });
          return;
        }
        start.current = point;
        setDraft({ ...point, width: 0, height: 0 });
      }}
      onPointerMove={(event) => {
        if (!start.current) return;
        const point = normalized(event);
        setDraft({
          x: Math.min(start.current.x, point.x),
          y: Math.min(start.current.y, point.y),
          width: Math.abs(point.x - start.current.x),
          height: Math.abs(point.y - start.current.y),
        });
      }}
      onPointerUp={(event) => {
        const region = draft;
        start.current = null;
        setDraft(null);
        if (!region || region.width < 0.008 || region.height < 0.008) return;
        onRegion(region, { x: event.clientX + 12, y: event.clientY - 12 });
      }}
      onPointerCancel={() => {
        start.current = null;
        setDraft(null);
      }}
    >
      {children}
      {draft && (
        <span
          className="pointer-events-none absolute rounded-[3px] border-[1.5px] border-dashed border-stone-900 bg-stone-900/5"
          style={{
            left: `${draft.x * 100}%`,
            top: `${draft.y * 100}%`,
            width: `${draft.width * 100}%`,
            height: `${draft.height * 100}%`,
          }}
        />
      )}
    </div>
  );
}

/**
 * Shows an "Add note" bubble when text is selected inside `root`. The caller
 * turns the selection into a note target.
 */
export function useSelectionBubble(
  root: RefObject<HTMLElement | null>,
  enabled: boolean,
) {
  const [selection, setSelection] = useState<{ range: Range; anchor: { x: number; y: number } } | null>(null);

  useEffect(() => {
    if (!enabled) {
      setSelection(null);
      return;
    }
    const update = () => {
      const current = window.getSelection();
      const element = root.current;
      if (!current || current.isCollapsed || !current.rangeCount || !element) {
        setSelection(null);
        return;
      }
      const range = current.getRangeAt(0);
      if (!element.contains(range.commonAncestorContainer) || !range.toString().trim()) {
        setSelection(null);
        return;
      }
      const rects = range.getClientRects();
      const last = rects[rects.length - 1] ?? range.getBoundingClientRect();
      setSelection({ range: range.cloneRange(), anchor: { x: last.right, y: last.bottom + 6 } });
    };
    const onPointerUp = () => window.setTimeout(update, 0);
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.shiftKey || event.key.startsWith("Arrow")) update();
    };
    const onSelectionChange = () => {
      const current = window.getSelection();
      if (!current || current.isCollapsed) setSelection(null);
    };
    document.addEventListener("pointerup", onPointerUp);
    document.addEventListener("keyup", onKeyUp);
    document.addEventListener("selectionchange", onSelectionChange);
    return () => {
      document.removeEventListener("pointerup", onPointerUp);
      document.removeEventListener("keyup", onKeyUp);
      document.removeEventListener("selectionchange", onSelectionChange);
    };
  }, [enabled, root]);

  return {
    selection,
    clear: () => {
      window.getSelection()?.removeAllRanges();
      setSelection(null);
    },
  };
}

export function SelectionBubble({
  anchor,
  onNote,
}: {
  anchor: { x: number; y: number };
  onNote: () => void;
}) {
  return (
    <button
      type="button"
      onPointerDown={(event) => event.preventDefault()}
      onClick={onNote}
      className="fixed z-50 flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-stone-200 bg-white px-3 py-1.5 text-xs font-medium text-stone-800 shadow-floating transition hover:bg-stone-50"
      style={{ left: anchor.x, top: anchor.y }}
    >
      <MessageSquarePlus className="h-3.5 w-3.5" />
      Add note
    </button>
  );
}

/** Centered message for stages that cannot show a file. */
export function StageMessage({ title, detail }: { title: string; detail?: string }) {
  return (
    <div className="flex h-full w-full items-center justify-center p-8">
      <div className="max-w-sm text-center">
        <p className="text-sm font-medium text-stone-800">{title}</p>
        {detail && <p className="mt-1 text-xs leading-5 text-stone-500">{detail}</p>}
      </div>
    </div>
  );
}

/** Fit a content box of `intrinsic` size inside `outer`, centered. */
export function fitBox(
  outer: { width: number; height: number },
  intrinsic: { width: number; height: number } | null,
) {
  if (!intrinsic || !outer.width || !outer.height) return null;
  const scale = Math.min(outer.width / intrinsic.width, outer.height / intrinsic.height);
  const width = intrinsic.width * scale;
  const height = intrinsic.height * scale;
  return { width, height, left: (outer.width - width) / 2, top: (outer.height - height) / 2 };
}

/** Room kept clear for the toolbar above and the tools below the artifact. */
export const STAGE_INSET = { top: 72, bottom: 96, x: 48 };

/** Fit content inside the stage's safe area; `bottom` adds extra room below. */
export function fitInStage(
  outer: { width: number; height: number },
  intrinsic: { width: number; height: number } | null,
  extraBottom = 0,
) {
  const box = fitBox(
    {
      width: Math.max(0, outer.width - STAGE_INSET.x * 2),
      height: Math.max(0, outer.height - STAGE_INSET.top - STAGE_INSET.bottom - extraBottom),
    },
    intrinsic,
  );
  return box ? { ...box, left: box.left + STAGE_INSET.x, top: box.top + STAGE_INSET.top } : null;
}

export function useElementSize(ref: RefObject<HTMLElement | null>) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const update = () => setSize({ width: element.clientWidth, height: element.clientHeight });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return size;
}

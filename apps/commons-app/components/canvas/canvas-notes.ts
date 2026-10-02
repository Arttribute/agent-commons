import type { CanvasAnnotation, CanvasAnnotationKind } from "@/lib/canvas";
import { formatCanvasTime } from "@/lib/canvas";

/** Where a note points. Stored in annotation metadata, read by agents. */
export type NoteTarget =
  | {
      type: "region" | "point";
      /** 1-based page, slide or frame index when the artifact has pages. */
      page?: number;
      pageLabel?: "page" | "slide";
      frameTimeMs?: number;
      /** Text that falls inside the region, when the artifact has a text layer. */
      quote?: string;
    }
  | {
      type: "text";
      page?: number;
      pageLabel?: "page" | "slide";
      quote: string;
      prefix?: string;
      suffix?: string;
      /** Character offsets into the extracted text, when known. */
      start?: number;
      end?: number;
      lineStart?: number;
      lineEnd?: number;
      /** Highlight boxes normalized to the page, for drawing. */
      rects?: Array<{ x: number; y: number; width: number; height: number }>;
    }
  | {
      type: "cells";
      sheet: string;
      range: string;
      values: string[][];
    }
  | {
      type: "source";
      file: string;
      lineStart: number;
      lineEnd: number;
      code: string;
    }
  | {
      type: "element";
      page?: number;
      pageLabel?: "page" | "slide";
      elements: InspectedElement[];
    }
  | { type: "time"; transcript?: string };

export type InspectedElement = {
  selector?: string;
  tag?: string;
  role?: string;
  ariaLabel?: string;
  text?: string;
  src?: string;
  alt?: string;
  href?: string;
  icon?: string;
  html?: string;
  /** The source line that produced this element (diagrams). */
  source?: string;
};

export type NoteGeometry = {
  x: number;
  y: number;
  width?: number;
  height?: number;
};

/** A note being written. `anchor` places the editor on screen. */
export type NoteDraft = {
  kind: CanvasAnnotationKind;
  target: NoteTarget;
  geometry?: NoteGeometry;
  startMs?: number;
  endMs?: number;
  intrinsicSize?: { width: number; height: number } | null;
  anchor: { x: number; y: number };
};

export type NoteTool = "interact" | "point" | "region" | "time";

export function noteTarget(note: CanvasAnnotation): NoteTarget | undefined {
  const target = (note.metadata as { target?: NoteTarget } | undefined)?.target;
  return target && typeof target === "object" ? target : undefined;
}

export function noteGeometry(note: CanvasAnnotation): NoteGeometry | null {
  const geometry = note.geometry as Partial<NoteGeometry> | null | undefined;
  if (typeof geometry?.x !== "number" || typeof geometry?.y !== "number") return null;
  return geometry as NoteGeometry;
}

export function notePage(note: CanvasAnnotation) {
  const target = noteTarget(note);
  return target && "page" in target ? target.page : undefined;
}

/** A short location label for lists and chips, e.g. "Page 3" or "B2:C4". */
export function noteLocationLabel(note: CanvasAnnotation) {
  const target = noteTarget(note);
  const parts: string[] = [];
  if (target && "page" in target && target.page) {
    parts.push(`${target.pageLabel === "slide" ? "Slide" : "Page"} ${target.page}`);
  }
  if (target?.type === "cells") parts.push(`${target.sheet} ${target.range}`);
  if (target?.type === "source") {
    parts.push(
      `${target.file.split("/").pop()} ${target.lineStart}${target.lineEnd !== target.lineStart ? `–${target.lineEnd}` : ""}`,
    );
  }
  if (typeof note.startMs === "number") {
    parts.push(
      typeof note.endMs === "number" && note.endMs > note.startMs + 100
        ? `${formatCanvasTime(note.startMs)}–${formatCanvasTime(note.endMs)}`
        : formatCanvasTime(note.startMs),
    );
  }
  if (target?.type === "element" && target.elements[0]) {
    const element = target.elements[0];
    parts.push(element.ariaLabel || element.text?.slice(0, 30) || `<${element.tag}>`);
  }
  return parts.join(" · ");
}

/** The quoted selection a note refers to, for previews. */
export function noteQuote(note: CanvasAnnotation) {
  const target = noteTarget(note);
  if (target?.type === "text") return target.quote;
  if (target?.type === "source") return target.code.split("\n")[0];
  return undefined;
}

export function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

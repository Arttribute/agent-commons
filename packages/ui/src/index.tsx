"use client";

import {
  useRef,
  useState,
  type ReactNode,
  type PointerEvent,
  type ButtonHTMLAttributes,
} from "react";
import { ResizablePanel } from "./workspace";
import { normalizedContentPoint } from "./geometry";
export {
  fitContentBox,
  normalizedContentPoint,
  COMPILED_VIEWPORT,
} from "./geometry";
export {
  ComposerSurface,
  ComposerTextArea,
  ChatComposer,
  CanvasToolButton,
  ResizablePanel,
  CodeFileBrowser,
  CommonsWindow,
} from "./workspace";
export type { ComposerAttachment, SourceFile } from "./workspace";

export function CommonsButton({
  variant = "secondary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost";
}) {
  return (
    <button
      type="button"
      className={`ac-button ac-button-${variant} ${className}`}
      {...props}
    />
  );
}
export function CanvasShell({
  toolbar,
  left,
  right,
  bottom,
  children,
  className = "",
}: {
  toolbar: ReactNode;
  left?: ReactNode;
  right?: ReactNode;
  bottom?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`ac-canvas ${className}`}>
      <header className="ac-canvas-toolbar">{toolbar}</header>
      <div className="ac-canvas-body">
        {left && (
          <ResizablePanel
            side="left"
            defaultWidth={240}
            label="Project panel"
            className="ac-canvas-left"
          >
            {left}
          </ResizablePanel>
        )}
        <main className="ac-canvas-center">
          {children}
          {bottom && (
            <section className="ac-canvas-bottom" aria-label="Diagnostics">
              {bottom}
            </section>
          )}
        </main>
        {right && (
          <ResizablePanel
            side="right"
            defaultWidth={340}
            label="Assistant panel"
            className="ac-canvas-right"
          >
            {right}
          </ResizablePanel>
        )}
      </div>
    </div>
  );
}
export {
  CompiledArtifactFrame,
  RecordingPlayer,
  downloadRecording,
} from "./compiled-frame";
export type {
  CompiledPreview,
  CompiledFrameHandle,
  CanvasObservation,
  CanvasInteraction,
  CanvasRecording,
  CanvasMoment,
} from "./compiled-frame";
export type AnnotationGeometry = {
  x: number;
  y: number;
  width?: number;
  height?: number;
};
export type CanvasNote = AnnotationGeometry & {
  id: string;
  body: string;
  status?: "open" | "resolved";
};
export function AnnotationLayer({
  tool,
  notes,
  onCreate,
  onSelect,
}: {
  tool: "select" | "point" | "region";
  notes: readonly CanvasNote[];
  onCreate: (geometry: AnnotationGeometry) => void;
  onSelect?: (note: CanvasNote) => void;
}) {
  const origin = useRef<{ x: number; y: number } | null>(null);
  const [draft, setDraft] = useState<AnnotationGeometry | null>(null);
  function point(event: PointerEvent<HTMLDivElement>) {
    return normalizedContentPoint(
      { x: event.clientX, y: event.clientY },
      event.currentTarget.getBoundingClientRect(),
    );
  }
  function rect(end: { x: number; y: number }) {
    const start = origin.current!;
    return {
      x: Math.min(start.x, end.x),
      y: Math.min(start.y, end.y),
      width: Math.abs(end.x - start.x),
      height: Math.abs(end.y - start.y),
    };
  }
  return (
    <div
      className={`ac-annotation-layer ${tool === "select" ? "ac-select" : "ac-draw"}`}
      aria-label={tool === "select" ? "Annotations" : `Draw ${tool} annotation`}
      onPointerDown={(event) => {
        if (tool === "select") return;
        event.currentTarget.setPointerCapture(event.pointerId);
        origin.current = point(event);
        setDraft(origin.current);
      }}
      onPointerMove={(event) => {
        if (origin.current && tool === "region") setDraft(rect(point(event)));
      }}
      onPointerUp={(event) => {
        if (!origin.current) return;
        const geometry: AnnotationGeometry =
          tool === "region" ? rect(point(event)) : origin.current;
        if (tool !== "region" || (geometry.width ?? 0) > 0.005)
          onCreate(geometry);
        origin.current = null;
        setDraft(null);
      }}
      onPointerCancel={() => {
        origin.current = null;
        setDraft(null);
      }}
    >
      {notes.map((note, index) => (
        <button
          key={note.id}
          type="button"
          aria-label={`Annotation ${index + 1}: ${note.body}`}
          title={note.body}
          className={`ac-note ${note.width ? "ac-note-region" : "ac-note-point"} ${note.status === "resolved" ? "ac-note-resolved" : ""}`}
          style={{
            left: `${note.x * 100}%`,
            top: `${note.y * 100}%`,
            ...(note.width
              ? {
                  width: `${note.width * 100}%`,
                  height: `${(note.height ?? 0) * 100}%`,
                }
              : {}),
          }}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => onSelect?.(note)}
        >
          <span>{index + 1}</span>
        </button>
      ))}
      {draft && (
        <span
          className="ac-note ac-note-region"
          style={{
            left: `${draft.x * 100}%`,
            top: `${draft.y * 100}%`,
            width: `${(draft.width ?? 0.015) * 100}%`,
            height: `${(draft.height ?? 0.015) * 100}%`,
            pointerEvents: "none",
          }}
        />
      )}
    </div>
  );
}

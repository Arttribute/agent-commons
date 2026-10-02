"use client";

import { useRef, useState } from "react";
import {
  COMPILED_VIEWPORT,
  CompiledArtifactFrame,
  type CompiledFrameHandle,
} from "@agent-commons/ui";
import "@agent-commons/ui/styles.css";
import type { InspectedElement } from "../canvas-notes";
import { SourceView, type SourceFile } from "./source-view";
import {
  NoteMarkers,
  SpatialLayer,
  StageMessage,
  fitInStage,
  useElementSize,
  type StageProps,
} from "./stage-kit";

export function sourceFilesFor(preview: StageProps["preview"]): SourceFile[] {
  if (preview.codeProject?.files?.length) {
    return preview.codeProject.files.map((file) => ({ path: file.path, content: file.content }));
  }
  return preview.content ? [{ path: preview.name, content: preview.content }] : [];
}

export function CodeStage(props: StageProps) {
  const { preview, view } = props;
  const files = sourceFilesFor(preview);
  if (view === "source") {
    return (
      <div className="h-full w-full px-6 pb-28 pt-16">
        <SourceView
          {...props}
          files={files}
          initialPath={preview.codeProject?.entryFile}
        />
      </div>
    );
  }
  const interactive = preview.interactivePreview;
  if (!interactive || interactive.type === "unavailable") {
    return (
      <StageMessage
        title="The live preview is not available"
        detail={interactive?.type === "unavailable" ? interactive.error : "Open the source to read the code."}
      />
    );
  }
  return <CompiledPreview {...props} preview={preview} />;
}

function CompiledPreview({
  preview,
  tool,
  notes,
  numberOf,
  focusedNoteId,
  zoom,
  canAnnotate,
  onDraft,
  onOpenNote,
}: StageProps) {
  const frame = useRef<CompiledFrameHandle>(null);
  const outer = useRef<HTMLDivElement>(null);
  const size = useElementSize(outer);
  const [inspecting, setInspecting] = useState(false);
  const viewport = COMPILED_VIEWPORT;
  const box = fitInStage(size, viewport);
  const interactive = preview.interactivePreview!;

  const inspect = async (area: { x: number; y: number; width?: number; height?: number }) => {
    setInspecting(true);
    try {
      const result = await frame.current?.inspect({
        x: area.x * viewport.width,
        y: area.y * viewport.height,
        width: area.width ? area.width * viewport.width : undefined,
        height: area.height ? area.height * viewport.height : undefined,
      });
      // The note keeps its own geometry; the element's box is not needed.
      return (result?.elements ?? []).map((element): InspectedElement => {
        const { rect, ...rest } = element;
        void rect;
        return rest;
      });
    } catch {
      return [];
    } finally {
      setInspecting(false);
    }
  };

  return (
    <div ref={outer} className="relative h-full w-full">
      {box && (
        <div
          className="absolute overflow-hidden rounded-xl bg-white shadow-card ring-1 ring-stone-900/5"
          style={{
            left: box.left,
            top: box.top,
            width: box.width,
            height: box.height,
            transform: `scale(${zoom})`,
            transformOrigin: "center",
          }}
        >
          <CompiledArtifactFrame
            ref={frame}
            preview={
              interactive.type === "html"
                ? { type: "html", html: interactive.html }
                : interactive.type === "url"
                  ? { type: "url", url: interactive.url }
                  : { type: "unavailable", error: interactive.error }
            }
            title={preview.name}
            interactive={tool === "interact"}
            recordingControls={false}
            revision={`${preview.itemId}:${preview.updatedAt}`}
            className="!absolute inset-0 h-full w-full"
          />
          <SpatialLayer
            tool={tool}
            disabled={!canAnnotate || inspecting}
            onPoint={async (point, anchor) => {
              const elements = await inspect(point);
              onDraft({
                kind: "point",
                target: elements.length ? { type: "element", elements } : { type: "point" },
                geometry: point,
                intrinsicSize: viewport,
                anchor,
              });
            }}
            onRegion={async (region, anchor) => {
              const elements = await inspect(region);
              onDraft({
                kind: "region",
                target: elements.length ? { type: "element", elements } : { type: "region" },
                geometry: region,
                intrinsicSize: viewport,
                anchor,
              });
            }}
          />
          <div className="pointer-events-none absolute inset-0 z-20">
            <NoteMarkers notes={notes} numberOf={numberOf} focusedNoteId={focusedNoteId} onOpenNote={onOpenNote} />
          </div>
        </div>
      )}
    </div>
  );
}

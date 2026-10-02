"use client";

import { useRef, useState } from "react";
import {
  NoteMarkers,
  SpatialLayer,
  StageMessage,
  fitInStage,
  useElementSize,
  type StageProps,
} from "./stage-kit";

export function ImageStage({
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
  const source = preview.inline?.url || preview.download?.url;
  const outer = useRef<HTMLDivElement>(null);
  const size = useElementSize(outer);
  const [natural, setNatural] = useState<{ width: number; height: number } | null>(null);
  const [failed, setFailed] = useState(false);
  const box = fitInStage(size, natural);

  if (!source || failed) {
    return <StageMessage title="This image could not be shown" detail="Download it to view the original." />;
  }

  return (
    <div ref={outer} className="relative h-full w-full">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={source}
        alt={preview.name}
        draggable={false}
        onLoad={(event) =>
          setNatural({
            width: event.currentTarget.naturalWidth || 1,
            height: event.currentTarget.naturalHeight || 1,
          })
        }
        onError={() => setFailed(true)}
        className="absolute select-none rounded-sm object-contain shadow-card"
        style={
          box
            ? {
                left: box.left,
                top: box.top,
                width: box.width,
                height: box.height,
                transform: `scale(${zoom})`,
                transformOrigin: "center",
              }
            : { opacity: 0 }
        }
      />
      {box && (
        <div
          className="absolute"
          style={{
            left: box.left,
            top: box.top,
            width: box.width,
            height: box.height,
            transform: `scale(${zoom})`,
            transformOrigin: "center",
          }}
        >
          <SpatialLayer
            tool={tool}
            disabled={!canAnnotate}
            onPoint={(point, anchor) =>
              onDraft({
                kind: "point",
                target: { type: "point" },
                geometry: point,
                intrinsicSize: natural,
                anchor,
              })
            }
            onRegion={(region, anchor) =>
              onDraft({
                kind: "region",
                target: { type: "region" },
                geometry: region,
                intrinsicSize: natural,
                anchor,
              })
            }
          />
          <div className="pointer-events-none absolute inset-0 z-20">
            <NoteMarkers
              notes={notes}
              numberOf={numberOf}
              focusedNoteId={focusedNoteId}
              onOpenNote={onOpenNote}
            />
          </div>
        </div>
      )}
    </div>
  );
}

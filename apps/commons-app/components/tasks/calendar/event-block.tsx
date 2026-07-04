"use client";

import { useDraggable } from "@dnd-kit/core";
import { Repeat } from "lucide-react";
import { cn } from "@/lib/utils";
import { statusConfig } from "../status-config";
import type { CalendarEvent } from "./types";

const BLOCK_CLASS: Record<string, string> = {
  pending: "bg-slate-500/10 border-slate-500/30",
  started: "bg-blue-500/10 border-blue-500/30",
  running: "bg-amber-500/10 border-amber-500/30",
  completed: "bg-emerald-500/10 border-emerald-500/30",
  failed: "bg-red-500/10 border-red-500/30",
  cancelled: "bg-muted border-border",
};

export function EventBlock({
  event,
  top,
  height,
  left,
  width,
  onClick,
}: {
  event: CalendarEvent;
  top: number;
  height: number;
  left: number;
  width: number;
  onClick: (taskId: string) => void;
}) {
  const move = useDraggable({ id: event.taskId, disabled: !event.isDraggable });
  const resize = useDraggable({ id: `resize:${event.taskId}`, disabled: !event.isResizable });

  const config = statusConfig[event.status] ?? statusConfig.pending;
  const moveTransform = move.transform
    ? `translate3d(${move.transform.x}px, ${move.transform.y}px, 0)`
    : undefined;

  return (
    <div
      ref={move.setNodeRef}
      {...move.listeners}
      {...move.attributes}
      onClick={(e) => {
        e.stopPropagation();
        onClick(event.taskId);
      }}
      style={{
        position: "absolute",
        top,
        height: Math.max(height, 22),
        left: `${left}%`,
        width: `${width}%`,
        transform: moveTransform,
        zIndex: move.isDragging ? 50 : 10,
      }}
      className={cn(
        "overflow-hidden rounded-md border px-1.5 py-1 text-left text-[11px] leading-4",
        BLOCK_CLASS[event.status] ?? BLOCK_CLASS.pending,
        event.isHistorical && "opacity-60",
        event.isDraggable ? "cursor-grab active:cursor-grabbing" : "cursor-pointer",
        move.isDragging && "shadow-md ring-1 ring-border",
      )}
    >
      <div className="flex items-center gap-1 truncate">
        {event.isRecurring && <Repeat className="h-2.5 w-2.5 shrink-0 text-muted-foreground" />}
        <span className={cn("truncate font-medium", config.className)}>{event.title}</span>
      </div>

      {event.isResizable && (
        <div
          ref={resize.setNodeRef}
          {...resize.listeners}
          {...resize.attributes}
          onClick={(e) => e.stopPropagation()}
          className="absolute inset-x-0 bottom-0 h-1.5 cursor-ns-resize"
        />
      )}
    </div>
  );
}

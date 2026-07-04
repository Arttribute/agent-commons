"use client";

import { useDraggable } from "@dnd-kit/core";
import { Repeat } from "lucide-react";
import { cn } from "@/lib/utils";
import { statusConfig } from "../status-config";
import type { CalendarEvent } from "./types";

const DOT_CLASS: Record<string, string> = {
  pending: "bg-slate-400",
  started: "bg-blue-500",
  running: "bg-amber-500",
  completed: "bg-emerald-500",
  failed: "bg-red-500",
  cancelled: "bg-muted-foreground",
};

export function EventChip({
  event,
  onClick,
}: {
  event: CalendarEvent;
  onClick: (taskId: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: event.taskId,
    disabled: !event.isDraggable,
  });

  const config = statusConfig[event.status] ?? statusConfig.pending;

  return (
    <button
      ref={setNodeRef}
      type="button"
      {...listeners}
      {...attributes}
      onClick={(e) => {
        e.stopPropagation();
        onClick(event.taskId);
      }}
      style={
        transform
          ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, zIndex: isDragging ? 50 : undefined }
          : undefined
      }
      className={cn(
        "flex w-full items-center gap-1.5 truncate rounded px-1.5 py-0.5 text-left text-[11px] leading-4 hover:bg-muted/70",
        event.isHistorical && "opacity-60",
        event.isDraggable ? "cursor-grab active:cursor-grabbing" : "cursor-pointer",
        isDragging && "shadow-md ring-1 ring-border",
      )}
    >
      <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", DOT_CLASS[event.status] ?? DOT_CLASS.pending)} />
      {event.isRecurring && <Repeat className="h-2.5 w-2.5 shrink-0 text-muted-foreground" />}
      <span className={cn("truncate font-medium", config.className)}>{event.title}</span>
    </button>
  );
}

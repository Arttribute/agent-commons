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

/** Soft status-tinted pill so the month grid reads at a glance */
const CHIP_CLASS: Record<string, string> = {
  pending: "bg-slate-500/10 hover:bg-slate-500/20",
  started: "bg-blue-500/10 hover:bg-blue-500/20",
  running: "bg-amber-500/10 hover:bg-amber-500/20",
  completed: "bg-emerald-500/10 hover:bg-emerald-500/20",
  failed: "bg-red-500/10 hover:bg-red-500/20",
  cancelled: "bg-muted hover:bg-muted/80",
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
        "flex w-full items-center gap-1.5 truncate rounded-md px-1.5 py-0.5 text-left text-[11px] leading-4 transition-colors",
        CHIP_CLASS[event.status] ?? CHIP_CLASS.pending,
        event.isHistorical && "opacity-60",
        event.isDraggable ? "cursor-grab active:cursor-grabbing" : "cursor-pointer",
        isDragging && "shadow-md ring-1 ring-border",
      )}
      title={`${event.title} · ${config.label}`}
    >
      <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", DOT_CLASS[event.status] ?? DOT_CLASS.pending)} />
      {event.isRecurring && <Repeat className="h-2.5 w-2.5 shrink-0 text-muted-foreground" />}
      <span className="truncate font-medium text-foreground">{event.title}</span>
    </button>
  );
}

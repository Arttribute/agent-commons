"use client";

import { format } from "date-fns";
import { Loader2, Pencil, Play, Repeat, Trash2, XCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { statusConfig } from "../status-config";
import type { CalendarEvent } from "./types";

function priorityLabel(priority?: number | null) {
  if (!priority || priority <= 0) return "No priority";
  if (priority >= 3) return "High";
  if (priority === 2) return "Medium";
  return "Low";
}

export function TaskEventPopover({
  event,
  agentName,
  isActing,
  onClose,
  onEdit,
  onExecute,
  onCancel,
  onDelete,
  onOpenTask,
}: {
  event: CalendarEvent;
  agentName: string;
  isActing: boolean;
  onClose: () => void;
  onEdit: (taskId: string) => void;
  onExecute: (taskId: string) => void;
  onCancel: (taskId: string) => void;
  onDelete: (taskId: string) => void;
  onOpenTask: (taskId: string) => void;
}) {
  const config = statusConfig[event.status] ?? statusConfig.pending;
  const task = event.task;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 pr-6">
            {event.isRecurring && <Repeat className="h-4 w-4 shrink-0 text-muted-foreground" />}
            <span className="truncate">{task.title}</span>
          </DialogTitle>
          {task.description && <DialogDescription>{task.description}</DialogDescription>}
        </DialogHeader>

        <div className="space-y-2 text-sm">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="outline" className={config.className}>{config.label}</Badge>
            <Badge variant="secondary">{agentName}</Badge>
            <Badge variant="secondary">{priorityLabel(task.priority)}</Badge>
          </div>
          <p className="text-muted-foreground">
            {event.isRecurring ? "Next run: " : "Scheduled: "}
            {format(event.start, "EEE, MMM d 'at' h:mm a")}
            {" – "}
            {format(event.end, "h:mm a")}
          </p>
        </div>

        <DialogFooter className="flex-row flex-wrap items-center gap-2 sm:justify-between">
          <div className="flex flex-wrap gap-1.5">
            {task.status === "pending" && (
              <Button variant="outline" size="sm" disabled={isActing} onClick={() => onExecute(task.taskId)}>
                {isActing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                Execute
              </Button>
            )}
            {task.status === "running" && (
              <Button variant="outline" size="sm" disabled={isActing} onClick={() => onCancel(task.taskId)}>
                <XCircle className="h-3.5 w-3.5" />
                Cancel
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => onEdit(task.taskId)}>
              <Pencil className="h-3.5 w-3.5" />
              Edit
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="text-destructive hover:text-destructive"
              disabled={isActing}
              onClick={() => onDelete(task.taskId)}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete
            </Button>
          </div>
          <Button variant="ghost" size="sm" onClick={() => onOpenTask(task.taskId)}>
            View details
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

import { useMemo } from "react";
import type { Task } from "@agent-commons/sdk";
import { CalendarEvent, DEFAULT_EVENT_DURATION_MS } from "./types";

const TERMINAL_STATUSES: Task["status"][] = ["completed", "failed", "cancelled"];
const LOCKED_STATUSES: Task["status"][] = ["running", "started", "cancelled"];

function toDate(value?: string | null): Date | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

/**
 * Derives calendar events from a task list. A task only appears on the
 * calendar if it has a date to anchor on — otherwise it's list/board only.
 */
export function deriveCalendarEvents(tasks: Task[]): CalendarEvent[] {
  const events: CalendarEvent[] = [];

  for (const task of tasks) {
    const scheduledFor = toDate(task.scheduledFor);
    const nextRunAt = toDate(task.nextRunAt);
    const actualStart = toDate(task.actualStart);
    const actualEnd = toDate(task.actualEnd);
    const durationMs = task.estimatedDuration && task.estimatedDuration > 0
      ? task.estimatedDuration
      : DEFAULT_EVENT_DURATION_MS;

    const isTerminal = TERMINAL_STATUSES.includes(task.status);

    if (task.isRecurring) {
      // Recurring tasks show only their next upcoming run, never a
      // cron-projected series — see plan decision on recurring events.
      const start = nextRunAt;
      if (!start) continue;
      events.push({
        taskId: task.taskId,
        task,
        title: task.title,
        status: task.status,
        start,
        end: new Date(start.getTime() + durationMs),
        isRecurring: true,
        isHistorical: false,
        isDraggable: !LOCKED_STATUSES.includes(task.status),
        isResizable: !LOCKED_STATUSES.includes(task.status),
      });
      continue;
    }

    if (isTerminal) {
      const start = actualStart ?? scheduledFor;
      if (!start) continue;
      const end = actualEnd ?? new Date(start.getTime() + durationMs);
      events.push({
        taskId: task.taskId,
        task,
        title: task.title,
        status: task.status,
        start,
        end,
        isRecurring: false,
        isHistorical: true,
        isDraggable: false,
        isResizable: false,
      });
      continue;
    }

    // Non-recurring, in flight (pending/started/running)
    const start = actualStart ?? scheduledFor;
    if (!start) continue;
    const end = actualEnd ?? new Date(start.getTime() + durationMs);
    events.push({
      taskId: task.taskId,
      task,
      title: task.title,
      status: task.status,
      start,
      end,
      isRecurring: false,
      isHistorical: false,
      isDraggable: task.status === "pending",
      isResizable: task.status === "pending",
    });
  }

  return events;
}

export function useTaskCalendarEvents(tasks: Task[]): CalendarEvent[] {
  return useMemo(() => deriveCalendarEvents(tasks), [tasks]);
}

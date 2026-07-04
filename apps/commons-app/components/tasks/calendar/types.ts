import type { Task } from "@agent-commons/sdk";

export type CalendarViewMode = "month" | "week" | "day";

export interface CalendarEvent {
  taskId: string;
  task: Task;
  title: string;
  status: Task["status"];
  start: Date;
  end: Date;
  isRecurring: boolean;
  /** Terminal (completed/failed/cancelled) one-time task — rendered read-only/muted. */
  isHistorical: boolean;
  isDraggable: boolean;
  isResizable: boolean;
}

export const DEFAULT_EVENT_DURATION_MS = 30 * 60_000;
export const MIN_EVENT_DURATION_MS = 15 * 60_000;

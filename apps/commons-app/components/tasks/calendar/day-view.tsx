"use client";

import { useMemo } from "react";
import { TimeGrid } from "./time-grid";
import type { CalendarEvent } from "./types";

export function DayView({
  anchorDate,
  events,
  onSlotClick,
  onEventClick,
  onReschedule,
  onResize,
}: {
  anchorDate: Date;
  events: CalendarEvent[];
  onSlotClick: (date: Date) => void;
  onEventClick: (taskId: string) => void;
  onReschedule: (taskId: string, newStart: Date) => void;
  onResize: (taskId: string, newDurationMs: number) => void;
}) {
  const days = useMemo(() => [anchorDate], [anchorDate]);

  return (
    <TimeGrid
      days={days}
      events={events}
      onSlotClick={onSlotClick}
      onEventClick={onEventClick}
      onReschedule={onReschedule}
      onResize={onResize}
    />
  );
}

"use client";

import { useMemo } from "react";
import { eachDayOfInterval, endOfWeek, startOfWeek } from "date-fns";
import { TimeGrid } from "./time-grid";
import type { CalendarEvent } from "./types";

export function WeekView({
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
  const days = useMemo(
    () => eachDayOfInterval({ start: startOfWeek(anchorDate), end: endOfWeek(anchorDate) }),
    [anchorDate],
  );

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

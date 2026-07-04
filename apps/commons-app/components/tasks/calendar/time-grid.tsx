"use client";

import { useMemo, useRef } from "react";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { addDays, addMinutes, format, isSameDay, isToday, startOfDay } from "date-fns";
import { cn } from "@/lib/utils";
import { EventBlock } from "./event-block";
import { layoutOverlappingEvents } from "./layout-overlaps";
import { MIN_EVENT_DURATION_MS, type CalendarEvent } from "./types";

const HOUR_HEIGHT = 48; // px per hour
const TOTAL_HEIGHT = HOUR_HEIGHT * 24;
const SNAP_MINUTES = 15;

function minutesSinceMidnight(d: Date) {
  return d.getHours() * 60 + d.getMinutes();
}

function snap(minutes: number) {
  return Math.round(minutes / SNAP_MINUTES) * SNAP_MINUTES;
}

export function TimeGrid({
  days,
  events,
  onSlotClick,
  onEventClick,
  onReschedule,
  onResize,
}: {
  days: Date[];
  events: CalendarEvent[];
  onSlotClick: (date: Date) => void;
  onEventClick: (taskId: string) => void;
  onReschedule: (taskId: string, newStart: Date) => void;
  onResize: (taskId: string, newDurationMs: number) => void;
}) {
  const columnsRef = useRef<HTMLDivElement>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const eventsByDay = useMemo(() => {
    const map = new Map<number, CalendarEvent[]>();
    days.forEach((day, i) => {
      map.set(i, events.filter((e) => isSameDay(e.start, day)));
    });
    return map;
  }, [days, events]);

  const eventsById = useMemo(() => new Map(events.map((e) => [e.taskId, e])), [events]);

  const handleDragEnd = (e: DragEndEvent) => {
    const id = String(e.active.id);
    const container = columnsRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const columnWidth = rect.width / days.length;
    if (!columnWidth) return;

    if (id.startsWith("resize:")) {
      const taskId = id.slice("resize:".length);
      const event = eventsById.get(taskId);
      if (!event) return;
      const deltaMinutes = snap((e.delta.y / HOUR_HEIGHT) * 60);
      const currentDurationMs = event.end.getTime() - event.start.getTime();
      const newDurationMs = Math.max(MIN_EVENT_DURATION_MS, currentDurationMs + deltaMinutes * 60_000);
      if (newDurationMs === currentDurationMs) return;
      onResize(taskId, newDurationMs);
      return;
    }

    const event = eventsById.get(id);
    if (!event) return;
    const dayDelta = days.length > 1 ? Math.round(e.delta.x / columnWidth) : 0;
    const minuteDelta = snap((e.delta.y / HOUR_HEIGHT) * 60);
    if (dayDelta === 0 && minuteDelta === 0) return;
    onReschedule(event.taskId, addMinutes(addDays(event.start, dayDelta), minuteDelta));
  };

  const handleColumnClick = (day: Date, e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const offsetY = e.clientY - rect.top;
    const minutes = snap((offsetY / TOTAL_HEIGHT) * 24 * 60);
    onSlotClick(addMinutes(startOfDay(day), Math.min(Math.max(minutes, 0), 24 * 60 - SNAP_MINUTES)));
  };

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div className="flex border-b border-border/70">
        <div className="w-14 shrink-0" />
        {days.map((day) => (
          <div key={day.toISOString()} className="flex-1 border-l border-border/50 px-2 py-1.5 text-center">
            <div className="text-[11px] font-medium uppercase text-muted-foreground">{format(day, "EEE")}</div>
            <div
              className={cn(
                "mx-auto mt-0.5 flex h-6 w-6 items-center justify-center rounded-full text-sm",
                isToday(day) && "bg-primary font-semibold text-primary-foreground",
              )}
            >
              {format(day, "d")}
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-1 overflow-y-auto">
        <div className="w-14 shrink-0">
          {Array.from({ length: 24 }, (_, hour) => (
            <div key={hour} style={{ height: HOUR_HEIGHT }} className="pr-2 text-right text-[10px] text-muted-foreground">
              <span className="relative -top-1.5">{format(new Date(2000, 0, 1, hour), "h a")}</span>
            </div>
          ))}
        </div>

        <div ref={columnsRef} className="relative flex flex-1" style={{ height: TOTAL_HEIGHT }}>
          {days.map((day, dayIndex) => {
            const dayEvents = eventsByDay.get(dayIndex) ?? [];
            const positioned = layoutOverlappingEvents(dayEvents);
            return (
              <div
                key={day.toISOString()}
                className="relative flex-1 border-l border-border/50"
                onClick={(e) => handleColumnClick(day, e)}
              >
                {Array.from({ length: 24 }, (_, hour) => (
                  <div
                    key={hour}
                    className="border-b border-border/30"
                    style={{ position: "absolute", top: hour * HOUR_HEIGHT, left: 0, right: 0, height: HOUR_HEIGHT }}
                  />
                ))}

                {isToday(day) && (
                  <div
                    className="absolute inset-x-0 z-20 h-px bg-red-500"
                    style={{ top: (minutesSinceMidnight(new Date()) / (24 * 60)) * TOTAL_HEIGHT }}
                  />
                )}

                {positioned.map((event) => {
                  const startMinutes = minutesSinceMidnight(event.start);
                  const durationMinutes = Math.max(
                    (event.end.getTime() - event.start.getTime()) / 60_000,
                    SNAP_MINUTES,
                  );
                  const top = (startMinutes / (24 * 60)) * TOTAL_HEIGHT;
                  const height = (durationMinutes / (24 * 60)) * TOTAL_HEIGHT;
                  const width = 100 / event.columnCount;
                  const left = event.column * width;
                  return (
                    <EventBlock
                      key={event.taskId}
                      event={event}
                      top={top}
                      height={height}
                      left={left}
                      width={width}
                      onClick={onEventClick}
                    />
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </DndContext>
  );
}

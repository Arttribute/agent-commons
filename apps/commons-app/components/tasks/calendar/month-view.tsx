"use client";

import { useMemo, useRef, useState } from "react";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  addDays,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  setHours,
  setMinutes,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { EventChip } from "./event-chip";
import type { CalendarEvent } from "./types";

const MAX_VISIBLE_CHIPS = 3;
const DEFAULT_SLOT_HOUR = 9;

function dayKey(d: Date) {
  return format(d, "yyyy-MM-dd");
}

export function MonthView({
  anchorDate,
  events,
  onSlotClick,
  onEventClick,
  onReschedule,
}: {
  anchorDate: Date;
  events: CalendarEvent[];
  onSlotClick: (date: Date) => void;
  onEventClick: (taskId: string) => void;
  onReschedule: (taskId: string, newStart: Date) => void;
}) {
  const gridRef = useRef<HTMLDivElement>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(anchorDate));
    const end = endOfWeek(endOfMonth(anchorDate));
    return eachDayOfInterval({ start, end });
  }, [anchorDate]);

  const weekCount = days.length / 7;

  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const event of events) {
      const key = dayKey(event.start);
      map.set(key, [...(map.get(key) ?? []), event]);
    }
    return map;
  }, [events]);

  const eventsById = useMemo(() => new Map(events.map((e) => [e.taskId, e])), [events]);

  const handleDragEnd = (e: DragEndEvent) => {
    const taskId = String(e.active.id);
    const event = eventsById.get(taskId);
    const grid = gridRef.current;
    if (!event || !grid) return;

    const rect = grid.getBoundingClientRect();
    const cellWidth = rect.width / 7;
    const cellHeight = rect.height / weekCount;
    if (!cellWidth || !cellHeight) return;

    const dayDeltaX = Math.round(e.delta.x / cellWidth);
    const dayDeltaY = Math.round(e.delta.y / cellHeight);
    const totalDayDelta = dayDeltaX + dayDeltaY * 7;
    if (totalDayDelta === 0) return;

    onReschedule(taskId, addDays(event.start, totalDayDelta));
  };

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div className="grid grid-cols-7 border-b border-border/70 text-[11px] font-medium uppercase text-muted-foreground">
        {days.slice(0, 7).map((d) => (
          <div key={d.toISOString()} className="px-2 py-1.5 text-center">
            {format(d, "EEE")}
          </div>
        ))}
      </div>
      <div
        ref={gridRef}
        className="grid flex-1 grid-cols-7"
        style={{ gridTemplateRows: `repeat(${weekCount}, minmax(0, 1fr))` }}
      >
        {days.map((day) => (
          <DayCell
            key={day.toISOString()}
            day={day}
            isCurrentMonth={isSameMonth(day, anchorDate)}
            events={eventsByDay.get(dayKey(day)) ?? []}
            onSlotClick={onSlotClick}
            onEventClick={onEventClick}
          />
        ))}
      </div>
    </DndContext>
  );
}

function DayCell({
  day,
  isCurrentMonth,
  events,
  onSlotClick,
  onEventClick,
}: {
  day: Date;
  isCurrentMonth: boolean;
  events: CalendarEvent[];
  onSlotClick: (date: Date) => void;
  onEventClick: (taskId: string) => void;
}) {
  const [showMore, setShowMore] = useState(false);
  const visible = events.slice(0, MAX_VISIBLE_CHIPS);
  const overflow = events.length - visible.length;

  return (
    <div
      className={cn(
        "flex h-28 min-h-28 flex-col gap-0.5 overflow-hidden border-b border-r border-border/50 p-1",
        !isCurrentMonth && "bg-muted/20",
      )}
      onClick={() => onSlotClick(setMinutes(setHours(day, DEFAULT_SLOT_HOUR), 0))}
    >
      <div className="flex items-center justify-between">
        <span
          className={cn(
            "flex h-5 w-5 items-center justify-center rounded-full text-xs",
            isToday(day) && "bg-primary font-semibold text-primary-foreground",
            !isCurrentMonth && !isToday(day) && "text-muted-foreground/60",
          )}
        >
          {format(day, "d")}
        </span>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-0.5">
        {visible.map((event) => (
          <EventChip key={event.taskId} event={event} onClick={onEventClick} />
        ))}
        {overflow > 0 && (
          <Popover open={showMore} onOpenChange={setShowMore}>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="truncate rounded px-1.5 text-left text-[11px] text-muted-foreground hover:bg-muted/70"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowMore(true);
                }}
              >
                +{overflow} more
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-64 space-y-1 p-2" onClick={(e) => e.stopPropagation()}>
              <p className="px-1 text-xs font-medium text-muted-foreground">{format(day, "EEEE, MMM d")}</p>
              {events.map((event) => (
                <EventChip
                  key={event.taskId}
                  event={event}
                  onClick={(taskId) => {
                    setShowMore(false);
                    onEventClick(taskId);
                  }}
                />
              ))}
            </PopoverContent>
          </Popover>
        )}
      </div>
    </div>
  );
}

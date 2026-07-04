"use client";

import { useMemo, useState } from "react";
import {
  addDays,
  addMonths,
  endOfWeek,
  format,
  startOfWeek,
} from "date-fns";
import type { Task } from "@agent-commons/sdk";
import { useToast } from "@/hooks/use-toast";
import { CalendarToolbar } from "./calendar-toolbar";
import { MonthView } from "./month-view";
import { WeekView } from "./week-view";
import { DayView } from "./day-view";
import { TaskEventPopover } from "./task-event-popover";
import { EditTaskDialog } from "./edit-task-dialog";
import { useTaskCalendarEvents } from "./use-task-calendar-events";
import type { CalendarViewMode } from "./types";

export function TaskCalendarView({
  tasks,
  agentMap,
  actionLoading,
  onOpenTask,
  onExecute,
  onCancel,
  onDelete,
  onCreateAt,
  rescheduleTask,
  updateTask,
}: {
  tasks: Task[];
  agentMap: Map<string, string>;
  actionLoading: string | null;
  onOpenTask: (taskId: string) => void;
  onExecute: (taskId: string) => void;
  onCancel: (taskId: string) => void;
  onDelete: (taskId: string) => void;
  onCreateAt: (date: Date) => void;
  rescheduleTask: (taskId: string, patch: { scheduledFor?: Date; estimatedDuration?: number }) => Promise<Task | null>;
  updateTask: (taskId: string, patch: { title?: string; description?: string; priority?: number }) => Promise<Task | null>;
}) {
  const { toast } = useToast();
  const [view, setView] = useState<CalendarViewMode>("month");
  const [anchorDate, setAnchorDate] = useState(() => new Date());
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);

  const events = useTaskCalendarEvents(tasks);
  const eventsById = useMemo(() => new Map(events.map((e) => [e.taskId, e])), [events]);
  const selectedEvent = selectedTaskId ? eventsById.get(selectedTaskId) : undefined;
  const editingTask = editingTaskId ? tasks.find((t) => t.taskId === editingTaskId) : undefined;

  const rangeLabel = useMemo(() => {
    if (view === "month") return format(anchorDate, "MMMM yyyy");
    if (view === "day") return format(anchorDate, "EEEE, MMM d, yyyy");
    const start = startOfWeek(anchorDate);
    const end = endOfWeek(anchorDate);
    return `${format(start, "MMM d")} – ${format(end, "MMM d, yyyy")}`;
  }, [view, anchorDate]);

  const goToday = () => setAnchorDate(new Date());
  const goPrev = () =>
    setAnchorDate((d) => (view === "month" ? addMonths(d, -1) : view === "week" ? addDays(d, -7) : addDays(d, -1)));
  const goNext = () =>
    setAnchorDate((d) => (view === "month" ? addMonths(d, 1) : view === "week" ? addDays(d, 7) : addDays(d, 1)));

  const handleReschedule = async (taskId: string, newStart: Date) => {
    if (newStart.getTime() < Date.now()) {
      toast({ title: "Can't schedule a task in the past", variant: "destructive" });
      return;
    }
    const result = await rescheduleTask(taskId, { scheduledFor: newStart });
    if (!result) {
      toast({
        title: "Couldn't reschedule task",
        description: "The task may be running or already finished.",
        variant: "destructive",
      });
    }
  };

  const handleSlotClick = (date: Date) => {
    if (date.getTime() < Date.now()) {
      toast({ title: "Can't schedule a task in the past", variant: "destructive" });
      return;
    }
    onCreateAt(date);
  };

  const handleResize = async (taskId: string, newDurationMs: number) => {
    const result = await rescheduleTask(taskId, { estimatedDuration: newDurationMs });
    if (!result) {
      toast({
        title: "Couldn't resize task",
        variant: "destructive",
      });
    }
  };

  const handleEditSave = async (patch: { title?: string; description?: string; priority?: number }) => {
    if (!editingTaskId) return;
    const result = await updateTask(editingTaskId, patch);
    if (!result) {
      toast({ title: "Couldn't save task changes", variant: "destructive" });
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <CalendarToolbar
        rangeLabel={rangeLabel}
        view={view}
        onViewChange={setView}
        onToday={goToday}
        onPrev={goPrev}
        onNext={goNext}
      />

      <div className="flex min-h-0 flex-1 flex-col">
        {view === "month" && (
          <MonthView
            anchorDate={anchorDate}
            events={events}
            onSlotClick={handleSlotClick}
            onEventClick={setSelectedTaskId}
            onReschedule={handleReschedule}
          />
        )}
        {view === "week" && (
          <WeekView
            anchorDate={anchorDate}
            events={events}
            onSlotClick={handleSlotClick}
            onEventClick={setSelectedTaskId}
            onReschedule={handleReschedule}
            onResize={handleResize}
          />
        )}
        {view === "day" && (
          <DayView
            anchorDate={anchorDate}
            events={events}
            onSlotClick={handleSlotClick}
            onEventClick={setSelectedTaskId}
            onReschedule={handleReschedule}
            onResize={handleResize}
          />
        )}
      </div>

      {selectedEvent && (
        <TaskEventPopover
          event={selectedEvent}
          agentName={agentMap.get(selectedEvent.task.agentId) ?? "Unknown agent"}
          isActing={actionLoading === selectedEvent.taskId}
          onClose={() => setSelectedTaskId(null)}
          onEdit={(taskId) => {
            setSelectedTaskId(null);
            setEditingTaskId(taskId);
          }}
          onExecute={(taskId) => {
            onExecute(taskId);
            setSelectedTaskId(null);
          }}
          onCancel={(taskId) => {
            onCancel(taskId);
            setSelectedTaskId(null);
          }}
          onDelete={(taskId) => {
            onDelete(taskId);
            setSelectedTaskId(null);
          }}
          onOpenTask={onOpenTask}
        />
      )}

      {editingTask && (
        <EditTaskDialog task={editingTask} onClose={() => setEditingTaskId(null)} onSave={handleEditSave} />
      )}
    </div>
  );
}

import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";

type CalendarTask = {
  label: string;
  day: number;
  row: number;
  tone: string;
};

const TASKS: CalendarTask[] = [
  { label: "Morning brief", day: 0, row: 0, tone: "bg-brand-mint/50" },
  { label: "Inbox triage", day: 1, row: 1, tone: "bg-brand-cyan/40" },
  { label: "Publish changelog", day: 2, row: 0, tone: "bg-brand-yellow/50" },
  { label: "Weekly metrics", day: 3, row: 2, tone: "bg-brand-lilac/40" },
  { label: "Backup workspace", day: 4, row: 1, tone: "bg-brand-pink/35" },
  { label: "Friday summary", day: 4, row: 3, tone: "bg-brand-mint/50" },
];

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];

/**
 * A quiet replica of the /studio/tasks calendar week view: scheduled and
 * recurring agent tasks laid out on weekday columns.
 */
export function TasksVisual() {
  return (
    <div className="overflow-hidden rounded-[1.5rem] border border-stone-200 bg-white shadow-[0_28px_80px_-44px_rgba(28,25,23,0.3)]">
      <div className="flex items-center justify-between border-b border-stone-200 px-4 py-3">
        <span className="flex items-center gap-2 text-xs font-medium text-stone-700">
          <CalendarDays className="h-4 w-4 text-stone-500" />
          Scheduled tasks
        </span>
        <span className="flex items-center gap-1 text-stone-400">
          <ChevronLeft className="h-3.5 w-3.5" />
          <span className="text-[11px] text-stone-500">This week</span>
          <ChevronRight className="h-3.5 w-3.5" />
        </span>
      </div>
      <div className="grid grid-cols-5 border-b border-stone-100 text-center">
        {DAYS.map((day, index) => (
          <div
            key={day}
            className={`py-2 text-[10px] uppercase tracking-wide ${
              index === 2 ? "font-medium text-stone-800" : "text-stone-400"
            }`}
          >
            {day}
          </div>
        ))}
      </div>
      <div className="relative grid h-[190px] grid-cols-5 divide-x divide-stone-100">
        {DAYS.map((day, index) => (
          <div key={day} className={index === 2 ? "bg-teal-50/40" : ""} />
        ))}
        {TASKS.map((task) => (
          <span
            key={task.label}
            className={`absolute rounded-md px-2 py-1 text-[10px] leading-4 text-stone-800 ${task.tone}`}
            style={{
              left: `calc(${task.day * 20}% + 6px)`,
              width: "calc(20% - 12px)",
              top: `${10 + task.row * 42}px`,
            }}
          >
            <span className="block truncate">{task.label}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

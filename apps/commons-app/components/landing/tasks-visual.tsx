import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";

type CalendarTask = {
  label: string;
  day: number;
  row: number;
  tone: string;
  accent: string;
};

const TASKS: CalendarTask[] = [
  {
    label: "Morning brief",
    day: 0,
    row: 0,
    tone: "bg-brand-mint/60",
    accent: "border-emerald-500",
  },
  {
    label: "Inbox triage",
    day: 1,
    row: 1,
    tone: "bg-brand-cyan/50",
    accent: "border-cyan-500",
  },
  {
    label: "Changelog",
    day: 2,
    row: 0,
    tone: "bg-brand-yellow/60",
    accent: "border-amber-500",
  },
  {
    label: "Weekly metrics",
    day: 3,
    row: 2,
    tone: "bg-brand-lilac/50",
    accent: "border-violet-500",
  },
  {
    label: "Friday summary",
    day: 4,
    row: 1,
    tone: "bg-brand-pink/50",
    accent: "border-pink-500",
  },
];

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];

/**
 * A quiet replica of the /studio/tasks calendar week view: scheduled and
 * recurring agent tasks laid out on weekday columns.
 */
export function TasksVisual() {
  return (
    <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-[0_24px_60px_-36px_rgba(28,25,23,0.35)]">
      <div className="flex items-center justify-between border-b border-stone-200 px-3.5 py-2.5">
        <span className="flex items-center gap-2 text-[11px] font-medium text-stone-700">
          <CalendarDays className="h-3.5 w-3.5 text-stone-500" />
          Scheduled tasks
        </span>
        <span className="flex items-center gap-1 text-stone-400">
          <ChevronLeft className="h-3 w-3" />
          <span className="text-[10px] text-stone-500">This week</span>
          <ChevronRight className="h-3 w-3" />
        </span>
      </div>
      <div className="grid grid-cols-5 border-b border-stone-100 text-center">
        {DAYS.map((day, index) => (
          <div
            key={day}
            className={`py-1.5 text-[9px] uppercase tracking-wide ${
              index === 2 ? "font-medium text-stone-800" : "text-stone-400"
            }`}
          >
            {day}
          </div>
        ))}
      </div>
      <div className="relative grid h-[132px] grid-cols-5 divide-x divide-stone-100">
        {DAYS.map((day, index) => (
          <div key={day} className={index === 2 ? "bg-teal-50/50" : ""} />
        ))}
        {TASKS.map((task) => (
          <span
            key={task.label}
            className={`absolute rounded-md border-l-2 px-1.5 py-0.5 text-[9px] leading-4 text-stone-800 ${task.tone} ${task.accent}`}
            style={{
              left: `calc(${task.day * 20}% + 5px)`,
              width: "calc(20% - 10px)",
              top: `${8 + task.row * 38}px`,
            }}
          >
            <span className="block truncate">{task.label}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

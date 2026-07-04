"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { CalendarViewMode } from "./types";

const VIEWS: { value: CalendarViewMode; label: string }[] = [
  { value: "month", label: "Month" },
  { value: "week", label: "Week" },
  { value: "day", label: "Day" },
];

export function CalendarToolbar({
  rangeLabel,
  view,
  onViewChange,
  onToday,
  onPrev,
  onNext,
}: {
  rangeLabel: string;
  view: CalendarViewMode;
  onViewChange: (view: CalendarViewMode) => void;
  onToday: () => void;
  onPrev: () => void;
  onNext: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border/70 px-1 py-2">
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" className="h-7 rounded-md" onClick={onToday}>
          Today
        </Button>
        <div className="flex items-center">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onPrev} aria-label="Previous">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onNext} aria-label="Next">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <span className="text-sm font-medium">{rangeLabel}</span>
      </div>

      <div className="flex rounded-md border border-border bg-muted/40 p-0.5">
        {VIEWS.map((v) => (
          <Button
            key={v.value}
            variant={view === v.value ? "secondary" : "ghost"}
            size="sm"
            className={cn("h-6 rounded px-2 text-xs")}
            onClick={() => onViewChange(v.value)}
          >
            {v.label}
          </Button>
        ))}
      </div>
    </div>
  );
}

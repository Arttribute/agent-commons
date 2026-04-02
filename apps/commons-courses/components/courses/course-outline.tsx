"use client";

import { useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Lock,
  PlayCircle,
  CheckCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Lesson {
  title: string;
  duration: string;
  description?: string;
  isFree: boolean;
}

interface Module {
  title: string;
  description?: string;
  lessons: Lesson[];
}

interface CourseOutlineProps {
  modules: Module[];
  enrolled?: boolean;
  completedLessons?: string[];
}

export function CourseOutline({
  modules,
  enrolled,
  completedLessons = [],
}: CourseOutlineProps) {
  const [openModules, setOpenModules] = useState<Set<number>>(new Set([0]));

  const toggle = (i: number) => {
    setOpenModules((prev) => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });
  };

  return (
    <div className="space-y-2">
      {modules.map((module, i) => (
        <div
          key={i}
          className="border border-slate-200 rounded-xl overflow-hidden"
        >
          <button
            onClick={() => toggle(i)}
            className="w-full flex items-center justify-between px-5 py-4 bg-white hover:bg-slate-50 transition-colors text-left"
          >
            <div className="flex items-center gap-3">
              <span className="text-xs font-bold tabular-nums w-6 flex-shrink-0 text-slate-900">
                {String(i + 1).padStart(2, "0")}
              </span>
              <div>
                <p className="text-sm font-semibold text-slate-900">
                  {module.title}
                </p>
                {module.description && (
                  <p className="text-xs text-slate-400 mt-0.5 hidden sm:block">
                    {module.description}
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-3 flex-shrink-0 ml-4">
              <span className="text-xs text-slate-400">
                {module.lessons.length} lessons
              </span>
              {openModules.has(i) ? (
                <ChevronDown className="h-4 w-4 text-slate-400" />
              ) : (
                <ChevronRight className="h-4 w-4 text-slate-400" />
              )}
            </div>
          </button>

          {openModules.has(i) && (
            <div className="border-t border-slate-100">
              {module.lessons.map((lesson, j) => {
                const lessonKey = `${i}-${j}`;
                const isCompleted = completedLessons.includes(lessonKey);
                const canAccess = enrolled || lesson.isFree;

                return (
                  <div
                    key={j}
                    className={cn(
                      "flex items-center gap-3 px-5 py-3.5 border-b border-slate-50 last:border-0",
                      canAccess
                        ? "hover:bg-blue-50/40 cursor-pointer"
                        : "opacity-60"
                    )}
                  >
                    <div className="flex-shrink-0">
                      {isCompleted ? (
                        <CheckCircle className="h-4 w-4 text-emerald-500" />
                      ) : canAccess ? (
                        <PlayCircle className="h-4 w-4 text-slate-700" />
                      ) : (
                        <Lock className="h-4 w-4 text-slate-400" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-slate-700 truncate">
                        {lesson.title}
                      </p>
                      {lesson.description && (
                        <p className="text-xs text-slate-400 truncate hidden sm:block">
                          {lesson.description}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {lesson.isFree && !enrolled && (
                        <span className="text-[10px] font-medium text-emerald-600 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-full">
                          Preview
                        </span>
                      )}
                      <span className="text-xs text-slate-400 tabular-nums">
                        {lesson.duration}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

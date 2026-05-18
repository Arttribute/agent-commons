"use client";

import { ReactNode, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  courseSlug: string;
  children: ReactNode;
  initialEnrolled?: boolean;
  initialProgress?: number;
  hasStarted?: boolean;
  startDateLabel?: string | null;
}

export function EnrollmentAwareActions({
  courseSlug,
  children,
  initialEnrolled = false,
  initialProgress = 0,
  hasStarted = true,
  startDateLabel = null,
}: Props) {
  const [state, setState] = useState<{
    loading: boolean;
    enrolled: boolean;
    progress: number;
    hasStarted: boolean;
    startDateLabel: string | null;
  }>({
    loading: !initialEnrolled,
    enrolled: initialEnrolled,
    progress: initialProgress,
    hasStarted,
    startDateLabel,
  });

  useEffect(() => {
    fetch(`/api/progress?courseSlug=${courseSlug}`)
      .then((response) => {
        if (!response.ok) {
          return { enrolled: false, progress: 0 };
        }
        return response.json();
      })
      .then((data) =>
        setState({
          loading: false,
          enrolled: Boolean(data.enrolled),
          progress: data.progress ?? 0,
          hasStarted: data.hasStarted !== false,
          startDateLabel: data.startDateLabel ?? startDateLabel,
        }),
      )
      .catch(() =>
        setState({
          loading: false,
          enrolled: false,
          progress: 0,
          hasStarted,
          startDateLabel,
        }),
      );
  }, [courseSlug, hasStarted, startDateLabel]);

  if (state.loading) {
    return (
      <div className="w-full flex items-center justify-center gap-2 px-5 py-3 rounded-lg bg-slate-100 text-slate-400 text-sm font-bold">
        <Loader2 className="h-4 w-4 animate-spin" />
        Checking enrolment…
      </div>
    );
  }

  if (!state.enrolled) return <>{children}</>;

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-green-200 bg-green-50 p-3">
        <p className="flex items-center gap-2 text-sm font-bold text-green-900">
          <CheckCircle className="h-4 w-4" />
          You&apos;re enrolled
        </p>
        {state.progress > 0 && (
          <p className="mt-1 text-xs text-green-700">
            {state.progress}% complete
          </p>
        )}
        {!state.hasStarted && (
          <p className="mt-1 text-xs text-green-700">
            Opens{state.startDateLabel ? ` on ${state.startDateLabel}` : " soon"}
          </p>
        )}
      </div>
      <Link
        href={state.hasStarted ? `/courses/${courseSlug}/learn` : `/courses/${courseSlug}`}
        aria-disabled={!state.hasStarted}
        className={cn(
          "w-full flex items-center justify-center gap-2 px-5 py-3 rounded-lg text-sm font-bold transition-opacity hover:opacity-90",
          !state.hasStarted
            ? "bg-slate-100 text-slate-500"
            : state.progress > 0
              ? "bg-green-700 text-white"
              : "bg-slate-900 text-white",
        )}
      >
        {!state.hasStarted
          ? "Course opens soon"
          : state.progress > 0
            ? "Continue learning"
            : "Start learning"}
        <ArrowRight className="h-3.5 w-3.5" />
      </Link>
    </div>
  );
}

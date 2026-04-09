"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BookOpen, CheckCircle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  courseSlug: string;
}

export function EnrolledBanner({ courseSlug }: Props) {
  const [state, setState] = useState<{
    loading: boolean;
    enrolled: boolean;
    progress: number;
  }>({ loading: true, enrolled: false, progress: 0 });

  useEffect(() => {
    fetch(`/api/progress?courseSlug=${courseSlug}`)
      .then((r) => r.json())
      .then((d) =>
        setState({ loading: false, enrolled: d.enrolled, progress: d.progress ?? 0 }),
      )
      .catch(() => setState({ loading: false, enrolled: false, progress: 0 }));
  }, [courseSlug]);

  if (state.loading) {
    return (
      <div className="flex items-center gap-2 text-slate-400 text-sm px-1">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Checking enrolment…
      </div>
    );
  }

  if (!state.enrolled) return null;

  return (
    <div className="rounded-xl bg-green-50 border border-green-200 p-4 flex items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-full bg-green-100">
          <BookOpen className="h-4 w-4 text-green-700" />
        </div>
        <div>
          <p className="text-sm font-bold text-green-900">You&apos;re enrolled</p>
          {state.progress > 0 && (
            <p className="text-xs text-green-700 mt-0.5">
              {state.progress}% complete
            </p>
          )}
        </div>
      </div>
      <Link
        href={`/courses/${courseSlug}/learn`}
        className={cn(
          "inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold transition-opacity",
          state.progress > 0
            ? "bg-green-700 text-white hover:opacity-90"
            : "bg-slate-900 text-white hover:opacity-90",
        )}
      >
        {state.progress > 0 ? (
          <>
            Continue <CheckCircle className="h-3.5 w-3.5" />
          </>
        ) : (
          "Start learning →"
        )}
      </Link>
    </div>
  );
}

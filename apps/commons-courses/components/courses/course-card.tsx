import Link from "next/link";
import { Clock, BookOpen, BarChart2, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CourseCardData } from "@/types";

interface CourseCardProps {
  course: CourseCardData;
  enrolled?: boolean;
}

const levelColors: Record<string, string> = {
  beginner: "text-emerald-700 bg-emerald-50 border-emerald-200",
  intermediate: "text-blue-700 bg-blue-50 border-blue-200",
  advanced: "text-violet-700 bg-violet-50 border-violet-200",
};

export function CourseCard({ course, enrolled }: CourseCardProps) {
  return (
    <Link
      href={`/courses/${course.slug}`}
      className="group flex flex-col rounded-2xl border border-slate-200 bg-white hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 overflow-hidden"
    >
      {/* Top colour bar */}
      <div className="h-1 bg-slate-900" />

      <div className="p-7 flex flex-col flex-1">
        {/* Badges */}
        <div className="flex items-center gap-2 mb-4">
          <span
            className={cn(
              "text-[10px] font-semibold px-2 py-0.5 rounded-full border",
              levelColors[course.level] || levelColors.beginner
            )}
          >
            {course.level}
          </span>
          {course.isFree ? (
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border text-emerald-700 bg-emerald-50 border-emerald-200">
              Free
            </span>
          ) : (
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border text-blue-700 bg-blue-50 border-blue-200">
              Paid
            </span>
          )}
          {enrolled && (
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border text-slate-600 bg-slate-50 border-slate-200">
              Enrolled
            </span>
          )}
        </div>

        <h3 className="text-lg font-bold text-slate-900 leading-tight mb-2 group-hover:text-blue-600 transition-colors">
          {course.title}
        </h3>
        <p className="text-sm text-slate-500 leading-relaxed mb-5 flex-1">
          {course.tagline}
        </p>

        {/* Stats */}
        <div className="flex items-center gap-4 text-xs text-slate-400 mb-5">
          <span className="flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5" />
            {course.duration}
          </span>
          <span className="flex items-center gap-1.5">
            <BookOpen className="h-3.5 w-3.5" />
            {course.lessonsCount} lessons
          </span>
          <span className="flex items-center gap-1.5">
            <BarChart2 className="h-3.5 w-3.5" />
            {course.modulesCount} modules
          </span>
        </div>

        {/* Price + CTA */}
        <div className="flex items-center justify-between pt-4 border-t border-slate-100">
          <span className="text-lg font-bold text-slate-900">
            {course.isFree ? "Free" : `$${course.price}`}
          </span>
          <span
            className="flex items-center gap-1 text-sm font-bold text-slate-900 group-hover:gap-2 transition-all"
          >
            View course <ArrowRight className="h-3.5 w-3.5" />
          </span>
        </div>
      </div>
    </Link>
  );
}

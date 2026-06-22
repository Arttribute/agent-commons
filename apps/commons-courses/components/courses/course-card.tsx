import Link from "next/link";
import {
  ArrowRight,
  BarChart2,
  BookOpen,
  Clock,
  FlaskConical,
  Wifi,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  formatCourseStartDate,
  getLiveScheduleSummary,
} from "@/lib/course-schedule";
import type { CourseCardData } from "@/types";

interface CourseCardProps {
  course: CourseCardData;
  enrolled?: boolean;
}

const levelColors: Record<string, string> = {
  beginner: "text-slate-950 bg-[#B8F56D] border-[#A6E45E]",
  intermediate: "text-slate-950 bg-[#71E0E7] border-[#5DCDD5]",
  advanced: "text-slate-950 bg-[#E5A3DF] border-[#D58DD0]",
};

function formatCoursePrice(course: CourseCardData) {
  if (course.isFree) return "Free";
  if (["kes", "ksh"].includes(course.currency?.toLowerCase() ?? "")) {
    return `Ksh ${course.price.toLocaleString("en-KE")}`;
  }
  return `$${course.price}`;
}

export function CourseCard({ course, enrolled }: CourseCardProps) {
  const imageUrl =
    course.bannerImageUrl || course.imageUrl || course.previewImageUrl || null;
  const isCourseMedia = Boolean(imageUrl?.includes("/api/media/"));
  const startDateLabel = formatCourseStartDate(course.startDate);
  const liveScheduleSummary = getLiveScheduleSummary(course.liveSchedule);
  const courseProgress = course.progress ?? 0;
  const actionLabel =
    enrolled && courseProgress > 0
      ? "Continue"
      : enrolled
        ? "Start learning"
        : "View course";

  return (
    <Link
      href={`/courses/${course.slug}`}
      className="group flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition-colors hover:border-slate-300"
    >
      {imageUrl ? (
        <div
          className={cn(
            "aspect-[16/9] overflow-hidden",
            isCourseMedia ? "bg-white p-2" : "bg-slate-100"
          )}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl}
            alt=""
            className={cn(
              "h-full w-full transition-transform duration-300",
              isCourseMedia
                ? "rounded-lg object-contain"
                : "object-cover group-hover:scale-[1.02]"
            )}
          />
        </div>
      ) : (
        <div className="h-1.5 bg-[#B8F56D]" />
      )}

      <div className="flex flex-1 flex-col p-5 sm:p-6">
        <div className="mb-5 flex flex-wrap items-center gap-2">
          <span
            className={cn(
              "rounded-md border px-2 py-1 text-xs font-semibold capitalize",
              levelColors[course.level] || levelColors.beginner
            )}
          >
            {course.level}
          </span>
          {course.isFree ? (
            <span className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-800">
              Free
            </span>
          ) : (
            <span className="rounded-md border border-slate-200 bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-800">
              Paid
            </span>
          )}
          {course.courseType === "live" && (
            <span className="inline-flex items-center gap-1 rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-xs font-semibold text-rose-800">
              <Wifi className="h-3 w-3" />
              Live
            </span>
          )}
          <span className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700 sm:ml-auto">
            <FlaskConical className="h-3 w-3" />
            Lab-ready
          </span>
          {enrolled && (
            <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-semibold text-slate-700">
              Enrolled
            </span>
          )}
        </div>

        <h3 className="mb-2 text-lg font-semibold leading-tight text-slate-950 group-hover:underline">
          {course.title}
        </h3>
        <p className="mb-5 flex-1 text-[15px] leading-6 text-slate-700">
          {course.tagline}
        </p>
        {startDateLabel && (
          <p className="mb-4 rounded-lg bg-lime-50 px-3 py-2 text-xs font-semibold text-slate-800">
            Starts {startDateLabel}
          </p>
        )}
        {liveScheduleSummary && (
          <p className="mb-4 rounded-lg bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-700">
            {liveScheduleSummary}
          </p>
        )}

        <div className="mb-5 flex flex-wrap items-center gap-4 text-[15px] text-slate-700">
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

        <div className="flex items-center justify-between border-t border-slate-200 pt-4">
          <span className="text-lg font-semibold text-slate-950">
            {formatCoursePrice(course)}
          </span>
          <span className="flex items-center gap-1 text-sm font-semibold text-slate-950">
            {actionLabel} <ArrowRight className="h-3.5 w-3.5" />
          </span>
        </div>
      </div>
    </Link>
  );
}

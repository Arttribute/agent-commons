import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { formatCourseStartDate } from "@/lib/course-schedule";
import type { CourseCardData } from "@/types";

interface CourseCardProps {
  course: CourseCardData;
  enrolled?: boolean;
}

function formatCoursePrice(course: CourseCardData) {
  if (course.isFree) return "Free";
  if (["kes", "ksh"].includes(course.currency?.toLowerCase() ?? "")) {
    return `Ksh ${course.price.toLocaleString("en-KE")}`;
  }
  return `$${course.price}`;
}

export function CourseCard({ course, enrolled }: CourseCardProps) {
  const imageUrl = course.bannerImageUrl || course.imageUrl || course.previewImageUrl || null;
  const startDateLabel = formatCourseStartDate(course.startDate);
  const courseProgress = course.progress ?? 0;
  const actionLabel = enrolled && courseProgress > 0 ? "Continue" : enrolled ? "Start" : "View";
  const meta = [
    course.courseType === "live" ? "Live" : "Self-paced",
    course.level,
    course.lessonsCount ? `${course.lessonsCount} lessons` : null,
    course.duration,
  ].filter(Boolean);

  return (
    <Link
      href={`/courses/${course.slug}`}
      className="group flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-card transition-shadow hover:shadow-floating"
    >
      <div className="aspect-[16/9] overflow-hidden bg-slate-100">
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt=""
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
          />
        ) : null}
      </div>
      <div className="flex flex-1 flex-col p-5">
        <p className="mb-2 truncate text-xs capitalize text-slate-500">{meta.join(" · ")}</p>
        <h3 className="text-base font-medium leading-snug text-slate-950">{course.title}</h3>
        <p className="mt-1.5 line-clamp-2 flex-1 text-sm leading-6 text-slate-600">{course.tagline}</p>
        {startDateLabel ? <p className="mt-3 text-xs text-slate-500">Starts {startDateLabel}</p> : null}
        <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-4">
          <span className="text-sm font-medium text-slate-950">
            {enrolled ? (courseProgress > 0 ? `${courseProgress}% complete` : "Enrolled") : formatCoursePrice(course)}
          </span>
          <span className="flex items-center gap-1 text-sm text-slate-600 transition-colors group-hover:text-slate-950">
            {actionLabel} <ArrowRight className="h-3.5 w-3.5" />
          </span>
        </div>
      </div>
    </Link>
  );
}

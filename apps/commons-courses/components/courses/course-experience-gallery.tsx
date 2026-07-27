import Link from "next/link";
import {
  ArrowRight,
  Clock3,
  Gamepad2,
  LockKeyhole,
  Sparkles,
} from "lucide-react";
import type { ExperienceTheme } from "@/types/experience";

export type CourseExperienceCard = {
  id: string;
  title: string;
  description: string;
  estimatedMinutes: number;
  sceneCount: number;
  isFreePreview: boolean;
  theme: ExperienceTheme;
};

export function CourseExperienceGallery({
  courseSlug,
  courseIsFree,
  isEnrolled,
  experiences,
}: {
  courseSlug: string;
  courseIsFree: boolean;
  isEnrolled: boolean;
  experiences: CourseExperienceCard[];
}) {
  if (!experiences.length) return null;

  return (
    <section
      id="experiences"
      className="scroll-mt-32 border-y border-slate-200 bg-slate-950 text-white"
    >
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
        <div className="mb-9 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
          <div>
            <p className="mb-3 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-lime-300">
              <Sparkles className="h-3.5 w-3.5" />
              Interactive learning
            </p>
            <h2 className="max-w-2xl text-3xl font-semibold">
              Step inside the lesson
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-300">
              Explore character-led scenarios, make decisions, and apply the
              course ideas through guided learning quests.
            </p>
          </div>
          <span className="text-xs font-bold uppercase tracking-[0.14em] text-white/40">
            {experiences.length}{" "}
            {experiences.length === 1 ? "experience" : "experiences"}
          </span>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          {experiences.map((experience) => {
            const accessible =
              courseIsFree || isEnrolled || experience.isFreePreview;
            return (
              <article
                key={experience.id}
                className="group overflow-hidden rounded-2xl border border-white/10 bg-white/[0.06]"
              >
                <div
                  className="relative min-h-44 overflow-hidden p-6"
                  style={{
                    background: `linear-gradient(135deg, ${experience.theme.background}, ${experience.theme.surface})`,
                  }}
                >
                  <div
                    className="absolute -right-14 -top-20 h-56 w-56 rounded-full opacity-25 blur-3xl"
                    style={{ backgroundColor: experience.theme.accent }}
                  />
                  <div className="relative">
                    <span
                      className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-white/15 bg-white/10"
                      style={{ color: experience.theme.accent }}
                    >
                      <Gamepad2 className="h-5 w-5" />
                    </span>
                    <h3 className="mt-6 text-xl font-bold">
                      {experience.title}
                    </h3>
                    <p className="mt-2 line-clamp-2 max-w-xl text-sm leading-6 text-white/55">
                      {experience.description}
                    </p>
                  </div>
                </div>
                <div className="flex flex-col gap-4 border-t border-white/10 p-5 sm:flex-row sm:items-center">
                  <div className="flex flex-1 items-center gap-4 text-xs font-semibold text-white/45">
                    <span className="inline-flex items-center gap-1.5">
                      <Clock3 className="h-3.5 w-3.5" />
                      {experience.estimatedMinutes} min
                    </span>
                    <span>{experience.sceneCount} scenes</span>
                    {experience.isFreePreview && !courseIsFree ? (
                      <span className="rounded-full bg-lime-300 px-2.5 py-1 font-black uppercase tracking-[0.1em] text-slate-950">
                        Free preview
                      </span>
                    ) : null}
                  </div>
                  <Link
                    href={
                      accessible
                        ? `/courses/${courseSlug}/experiences/${experience.id}`
                        : "#enroll"
                    }
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-slate-950 transition hover:bg-lime-300"
                  >
                    {accessible ? (
                      <>
                        Start experience <ArrowRight className="h-4 w-4" />
                      </>
                    ) : (
                      <>
                        <LockKeyhole className="h-4 w-4" /> Enroll to unlock
                      </>
                    )}
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

import Link from "next/link";
import {
  ArrowRight,
  Award,
  CalendarDays,
  Hammer,
  Rocket,
  Sparkles,
  Users,
} from "lucide-react";
import { Nav } from "@/components/nav";
import { builderQuests } from "@/lib/builder-quests";
import { learningFormats } from "@/lib/learning-formats";

export default function BuildersPage() {
  const firstQuest = builderQuests[0];

  return (
    <div className="min-h-screen bg-white text-slate-950">
      <Nav />
      <main className="mx-auto max-w-6xl px-4 pb-16 pt-24 sm:px-6 lg:px-8">
        <section className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div>
            <p className="mb-3 inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-bold text-slate-700">
              <Rocket className="h-3.5 w-3.5 text-sky-500" />
              CommonLab Builders
            </p>
            <h1 className="max-w-3xl text-3xl font-semibold tracking-tight text-slate-950 sm:text-5xl">
              From AI learning to real things people can use.
            </h1>
            <p className="mt-4 max-w-2xl text-[17px] leading-8 text-slate-700">
              Builders is the project and community pathway inside CommonLab:
              practical content, agent-building workshops, vibe coding sessions,
              hackathons, build nights, demo days, and eventually startup
              incubation.
            </p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <Link
                href="#quests"
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-950 px-5 py-3 text-sm font-bold text-white"
              >
                View builder quests <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/skills"
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 px-5 py-3 text-sm font-bold text-slate-800 hover:bg-slate-50"
              >
                Start with skills
              </Link>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-gradient-to-br from-slate-50 via-white to-sky-50 p-5">
            <p className="text-xs font-bold uppercase tracking-widest text-slate-500">
              The CommonLab loop
            </p>
            <div className="mt-4 space-y-3">
              {learningFormats.map(({ id, href, title, description, icon: Icon }, index) => (
                <Link
                  key={id}
                  href={href}
                  className="flex gap-3 rounded-lg border border-slate-200 bg-white p-3 transition-colors hover:bg-slate-50"
                >
                  <div
                    className={[
                      "flex h-9 w-9 shrink-0 items-center justify-center rounded-md",
                      index === 0
                        ? "bg-lime-100 text-slate-950"
                        : index === 1
                          ? "bg-amber-100 text-amber-700"
                          : "bg-sky-100 text-sky-700",
                    ].join(" ")}
                  >
                    <Icon className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-sm font-black text-slate-950">{title}</p>
                    <p className="mt-1 text-xs leading-5 text-slate-600">
                      {description}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>

        <section className="mt-10 grid gap-4 md:grid-cols-3">
          {[
            {
              icon: Hammer,
              title: "Learning by building",
              body: "Learners build small tools, workflows, assistants, and prototypes instead of stopping at tutorials.",
            },
            {
              icon: Users,
              title: "Community as the pipeline",
              body: "Build nights, demo days, mentor conversations, and peer feedback keep people shipping.",
            },
            {
              icon: Sparkles,
              title: "Residency to incubation",
              body: "The strongest builders can later move into focused residencies and early startup support.",
            },
          ].map(({ icon: Icon, title, body }) => (
            <div key={title} className="rounded-xl border border-slate-200 p-5">
              <Icon className="h-5 w-5 text-slate-900" />
              <h2 className="mt-4 text-base font-bold text-slate-950">{title}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">{body}</p>
            </div>
          ))}
        </section>

        <section id="quests" className="mt-10">
          <div className="mb-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-slate-500">
                Builder quests
              </p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
                Bigger than a daily skill, more focused than an open-ended idea.
              </h2>
            </div>
          </div>

          <article className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_340px]">
              <div className="p-5 sm:p-6">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-md bg-sky-100 px-2.5 py-1 text-xs font-black text-sky-800">
                    {firstQuest.status === "open-soon" ? "Opening soon" : firstQuest.status}
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2.5 py-1 text-xs font-bold text-slate-600">
                    <CalendarDays className="h-3.5 w-3.5" />
                    {firstQuest.duration}
                  </span>
                </div>
                <h3 className="mt-4 text-2xl font-semibold tracking-tight text-slate-950">
                  {firstQuest.title}
                </h3>
                <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-700">
                  {firstQuest.promise}
                </p>

                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  {firstQuest.milestones.map((milestone, index) => (
                    <div
                      key={milestone.title}
                      className="rounded-lg border border-slate-200 bg-slate-50 p-4"
                    >
                      <span className="text-xs font-black text-slate-400">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <h4 className="mt-2 text-sm font-black text-slate-950">
                        {milestone.title}
                      </h4>
                      <p className="mt-1 text-sm leading-6 text-slate-600">
                        {milestone.description}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              <aside className="border-t border-slate-200 bg-slate-50 p-5 sm:p-6 lg:border-l lg:border-t-0">
                <p className="text-xs font-bold uppercase tracking-widest text-slate-500">
                  Quest outcomes
                </p>
                <ul className="mt-4 space-y-3">
                  {firstQuest.outcomes.map((outcome) => (
                    <li key={outcome} className="flex gap-2 text-sm leading-6 text-slate-700">
                      <Award className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                      {outcome}
                    </li>
                  ))}
                </ul>
                <div className="mt-6 space-y-2">
                  <Link
                    href="/courses"
                    className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 py-3 text-sm font-bold text-white"
                  >
                    Browse linked courses <ArrowRight className="h-4 w-4" />
                  </Link>
                  <Link
                    href="/skills/ai-fluency-starter"
                    className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-800 hover:bg-slate-50"
                  >
                    Warm up with AI fluency
                  </Link>
                </div>
              </aside>
            </div>
          </article>
        </section>
      </main>
    </div>
  );
}

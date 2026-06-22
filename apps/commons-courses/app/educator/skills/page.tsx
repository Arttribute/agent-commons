import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, Award, BookOpen } from "lucide-react";
import { Nav } from "@/components/nav";
import { auth } from "@/lib/auth";
import { connectDB } from "@/lib/db";
import { buildManagedCoursesFilter } from "@/lib/educator-auth";
import Course from "@/models/Course";

export default async function EducatorSkillsPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/auth/signin?callbackUrl=/educator/skills");
  }

  await connectDB();
  const courses = await Course.find(
    session.user.role === "admin"
      ? {}
      : buildManagedCoursesFilter({
          userId: session.user.id,
          email: session.user.email,
          role: session.user.role,
        })
  )
    .select("title slug published skillPack updatedAt")
    .sort({ updatedAt: -1 })
    .lean();

  return (
    <div className="min-h-screen bg-white">
      <Nav />
      <main className="mx-auto max-w-6xl px-4 pb-16 pt-24 sm:px-6 lg:px-8">
        <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="mb-2 inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-bold text-slate-700">
              <Award className="h-3.5 w-3.5 text-amber-500" />
              Educator skills
            </p>
            <h1 className="text-3xl font-semibold tracking-tight text-slate-950">
              Create daily skill challenges
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              Skill badges are atomic daily learning paths. They can reinforce a
              course, appear on the public Skills page, and count as an earned
              skill when learners complete the full path.
            </p>
          </div>
          <Link
            href="/educator/courses/new"
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 py-2.5 text-sm font-bold text-white"
          >
            Create course <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        {courses.length === 0 ? (
          <section className="rounded-xl border border-dashed border-slate-300 p-10 text-center">
            <BookOpen className="mx-auto mb-4 h-8 w-8 text-slate-300" />
            <h2 className="text-xl font-semibold text-slate-950">
              Start with a course shell
            </h2>
            <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-slate-600">
              Create a course first, then attach standalone daily skill
              challenges from its Skill badges tab.
            </p>
          </section>
        ) : (
          <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            {courses.map((course) => {
              const challengeCount = course.skillPack?.challenges?.length || 0;
              const enabled = Boolean(course.skillPack?.enabled && challengeCount);
              return (
                <Link
                  key={String(course._id)}
                  href={`/educator/courses/${course.slug}/skills`}
                  className="grid gap-3 border-b border-slate-100 p-4 transition-colors last:border-b-0 hover:bg-slate-50 md:grid-cols-[1fr_auto]"
                >
                  <div>
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <h2 className="font-bold text-slate-900">{course.title}</h2>
                      <span className="rounded-md border border-slate-200 px-2 py-0.5 text-xs text-slate-500">
                        {course.published ? "Published course" : "Draft course"}
                      </span>
                      <span
                        className={`rounded-md px-2 py-0.5 text-xs font-bold ${
                          enabled
                            ? "bg-lime-100 text-lime-800"
                            : "bg-slate-100 text-slate-500"
                        }`}
                      >
                        {enabled ? "Skill path live" : "No live skill path"}
                      </span>
                    </div>
                    <p className="text-sm text-slate-500">
                      {challengeCount} daily challenge
                      {challengeCount === 1 ? "" : "s"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 text-sm font-bold text-slate-700">
                    Edit skill badges <ArrowRight className="h-4 w-4 text-slate-400" />
                  </div>
                </Link>
              );
            })}
          </section>
        )}
      </main>
    </div>
  );
}

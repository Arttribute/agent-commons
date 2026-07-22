import { redirect } from "next/navigation";
import Link from "next/link";
import { connectDB } from "@/lib/db";
import { buildManagedCoursesFilter, requireEducator } from "@/lib/educator-auth";
import Course from "@/models/Course";
import { Nav } from "@/components/nav";
import { CopilotMaterialBuilder } from "@/components/educator/copilot-material-builder";
import { BookOpen, FileText, Layers3, Sparkles } from "lucide-react";

export default async function EducatorCopilotPage() {
  const authResult = await requireEducator();
  if (authResult.error || !authResult.session) {
    redirect("/auth/signin?callbackUrl=/educator/copilot");
  }

  await connectDB();
  const courses = await Course.find(
    authResult.session.role === "admin"
      ? {}
      : buildManagedCoursesFilter({
          userId: authResult.session.userId,
          email: authResult.session.email,
          role: authResult.session.role,
        })
  )
    .select("title slug")
    .sort({ updatedAt: -1 })
    .lean<Array<{ title: string; slug: string }>>();

  return (
    <div className="min-h-screen bg-slate-50/60">
      <Nav />
      <main className="mx-auto max-w-6xl px-4 pb-16 pt-24 sm:px-6 lg:px-8">
        <Link href="/educator" className="text-sm font-medium text-slate-500 hover:text-slate-950">
          ← Back to educator console
        </Link>
        <section className="relative mb-8 mt-4 overflow-hidden rounded-2xl bg-slate-950 px-6 py-7 text-white sm:px-8">
          <div className="absolute -right-16 -top-20 h-56 w-56 rounded-full bg-lime-300/15 blur-3xl" />
          <div className="relative max-w-3xl">
            <p className="mb-3 inline-flex items-center gap-2 text-xs font-medium uppercase tracking-[0.2em] text-lime-300">
              <Sparkles className="h-3.5 w-3.5" /> Educator copilot studio
            </p>
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Turn your source material into learning.
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
              Upload PDFs, slides, documents, spreadsheets, or images. Your personal
              copilot extracts the ideas and visuals, then builds an educator-ready
              draft for you to review.
            </p>
            <div className="mt-6 flex flex-wrap gap-2 text-xs text-slate-200">
              <FormatPill icon={BookOpen} label="Courses" />
              <FormatPill icon={FileText} label="Workbooks" />
              <FormatPill icon={Layers3} label="Skill packs" />
            </div>
          </div>
        </section>

        <CopilotMaterialBuilder courses={courses} />
      </main>
    </div>
  );
}

function FormatPill({
  icon: Icon,
  label,
}: {
  icon: typeof BookOpen;
  label: string;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-3 py-1.5">
      <Icon className="h-3.5 w-3.5 text-lime-300" />
      {label}
    </span>
  );
}

import { redirect } from "next/navigation";
import Link from "next/link";
import { connectDB } from "@/lib/db";
import { buildManagedCoursesFilter, requireEducator } from "@/lib/educator-auth";
import Course from "@/models/Course";
import { Nav } from "@/components/nav";
import { CopilotMaterialBuilder } from "@/components/educator/copilot-material-builder";

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
    <div className="min-h-screen bg-white">
      <Nav />
      <main className="mx-auto max-w-6xl px-4 pb-16 pt-24 sm:px-6 lg:px-8">
        <Link href="/educator" className="text-sm font-bold text-slate-500">
          Back to educator console
        </Link>
        <div className="mb-8 mt-4 max-w-3xl">
          <p className="mb-2 text-xs uppercase tracking-[0.2em] text-slate-400">
            Educator copilot
          </p>
          <h1 className="text-3xl font-bold text-slate-950">
            Create course material from uploads
          </h1>
          <p className="mt-3 text-sm leading-6 text-slate-500">
            Upload slides, notes, PDFs, or images. The copilot creates a draft
            course or skill path in your account so you can review and publish.
          </p>
        </div>

        <CopilotMaterialBuilder courses={courses} />
      </main>
    </div>
  );
}

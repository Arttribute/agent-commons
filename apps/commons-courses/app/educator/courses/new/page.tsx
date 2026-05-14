import Link from "next/link";
import { Nav } from "@/components/nav";
import { CourseEditor } from "@/components/educator/course-editor";

export default function NewCoursePage() {
  return (
    <div className="min-h-screen bg-white">
      <Nav />
      <main className="mx-auto max-w-5xl px-4 pb-16 pt-24 sm:px-6 lg:px-8">
        <Link href="/educator" className="text-sm font-bold text-slate-500">
          Back to educator console
        </Link>
        <h1 className="mb-8 mt-4 text-3xl font-bold text-slate-950">
          Create course
        </h1>
        <CourseEditor />
      </main>
    </div>
  );
}

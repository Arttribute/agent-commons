import Link from "next/link";
import { Nav } from "@/components/nav";
import { AssignmentManager } from "@/components/educator/assignment-manager";

export default async function CourseAssignmentsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  return (
    <div className="min-h-screen bg-white">
      <Nav />
      <main className="mx-auto max-w-6xl px-4 pb-16 pt-24 sm:px-6 lg:px-8">
        <Link href="/educator" className="text-sm font-bold text-slate-500">
          Back to educator console
        </Link>
        <h1 className="mb-8 mt-4 text-3xl font-bold text-slate-950">
          Assignments and submissions
        </h1>
        <AssignmentManager slug={slug} />
      </main>
    </div>
  );
}

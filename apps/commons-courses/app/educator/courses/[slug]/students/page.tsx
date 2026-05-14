import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { requireEducatorCourse } from "@/lib/educator-auth";
import Enrollment from "@/models/Enrollment";
import { Nav } from "@/components/nav";

export default async function CourseStudentsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/auth/signin");

  const { slug } = await params;
  const result = await requireEducatorCourse(slug);
  if (result.error) redirect("/educator");

  const enrollments = await Enrollment.find({ courseId: result.course._id })
    .populate("userId", "name email")
    .sort({ enrolledAt: -1 })
    .lean();

  return (
    <div className="min-h-screen bg-white">
      <Nav />
      <main className="mx-auto max-w-6xl px-4 pb-16 pt-24 sm:px-6 lg:px-8">
        <Link href="/educator" className="text-sm font-bold text-slate-500">
          Back to educator console
        </Link>
        <h1 className="mb-2 mt-4 text-3xl font-bold text-slate-950">
          Students
        </h1>
        <p className="mb-8 text-sm text-slate-500">{result.course.title}</p>

        <div className="overflow-hidden rounded-xl border border-slate-200">
          <div className="grid grid-cols-[1.3fr_0.7fr_0.7fr_0.7fr] gap-3 bg-slate-50 px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-500">
            <span>Student</span>
            <span>Progress</span>
            <span>Payment</span>
            <span>Access</span>
          </div>
          {enrollments.map((enrollment) => {
            const user = enrollment.userId as unknown as { name?: string; email?: string };
            return (
              <div
                key={String(enrollment._id)}
                className="grid grid-cols-[1.3fr_0.7fr_0.7fr_0.7fr] gap-3 border-t border-slate-100 px-4 py-3 text-sm"
              >
                <div>
                  <p className="font-bold text-slate-900">{user?.name || "Learner"}</p>
                  <p className="text-xs text-slate-500">{user?.email}</p>
                </div>
                <span>{enrollment.progress}%</span>
                <span>{enrollment.paymentStatus}</span>
                <span>{enrollment.accessLevel}</span>
              </div>
            );
          })}
          {enrollments.length === 0 && (
            <p className="p-6 text-sm text-slate-500">No students enrolled yet.</p>
          )}
        </div>
      </main>
    </div>
  );
}

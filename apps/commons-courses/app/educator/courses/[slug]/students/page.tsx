import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { requireEducatorCourse } from "@/lib/educator-auth";
import Enrollment from "@/models/Enrollment";
import { ScrollableListFrame } from "@/components/educator/scrollable-list-frame";

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
    <div className="space-y-6">
      <div>
        <p className="text-sm font-bold uppercase tracking-[0.16em] text-slate-400">
          Learners
        </p>
        <h2 className="mt-2 text-3xl font-bold text-slate-950">Students</h2>
        <p className="mt-2 text-sm text-slate-500">
          Enrollment, progress, payment state, and access level.
        </p>
      </div>

      <ScrollableListFrame title="Enrolled students" count={enrollments.length}>
        <div className="min-w-[720px]">
          <div className="sticky top-0 grid grid-cols-[1.3fr_0.7fr_0.7fr_0.7fr] gap-3 bg-slate-50 px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-500">
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
      </ScrollableListFrame>
    </div>
  );
}

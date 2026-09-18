import { redirect } from "next/navigation";
import { GraduationCap } from "lucide-react";
import { auth } from "@/lib/auth";
import { requireEducatorCourse } from "@/lib/educator-auth";
import Enrollment from "@/models/Enrollment";
import { CourseSectionHeader } from "@/components/educator/course-section-header";
import { Badge, EmptyState, List, ListRow } from "@/components/ui/surface";

export default async function CourseLearnersPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const session = await auth();
  if (!session?.user?.id) {
    redirect(`/auth/signin?callbackUrl=/educator/courses/${slug}/students`);
  }
  const result = await requireEducatorCourse(slug);
  if (result.error) redirect("/educator");

  const enrollments = await Enrollment.find({ courseId: result.course._id })
    .populate("userId", "name email")
    .sort({ enrolledAt: -1 })
    .lean();

  return (
    <div>
      <CourseSectionHeader
        section="learners"
        meta={`${enrollments.length} enrolled`}
      />
      {enrollments.length ? (
        <List>
          {enrollments.map((enrollment) => {
            const user = enrollment.userId as unknown as { name?: string; email?: string };
            const name = user?.name || user?.email || "Learner";
            return (
              <ListRow
                key={String(enrollment._id)}
                leading={
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-sm font-medium text-stone-600">
                    {name.slice(0, 1).toUpperCase()}
                  </span>
                }
                title={name}
                meta={user?.name ? user.email : undefined}
                trailing={
                  <>
                    <span className="flex items-center gap-2">
                      <span className="hidden h-1.5 w-20 overflow-hidden rounded-full bg-muted sm:block">
                        <span
                          className="block h-full rounded-full bg-stone-800"
                          style={{ width: `${Math.min(100, enrollment.progress || 0)}%` }}
                        />
                      </span>
                      <span className="w-9 text-right text-xs tabular-nums text-muted-foreground">
                        {enrollment.progress || 0}%
                      </span>
                    </span>
                    <Badge tone={enrollment.paymentStatus === "paid" || enrollment.paymentStatus === "free" ? "success" : "neutral"}>
                      {String(enrollment.paymentStatus || "unknown").replace(/_/g, " ")}
                    </Badge>
                    <Badge>{String(enrollment.accessLevel || "full").replace(/_/g, " ")}</Badge>
                  </>
                }
              />
            );
          })}
        </List>
      ) : (
        <EmptyState icon={GraduationCap} title="No learners yet" description="Enrolled learners will appear here." />
      )}
    </div>
  );
}

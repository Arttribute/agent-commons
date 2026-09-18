import { redirect } from "next/navigation";
import { BookOpen, Plus } from "lucide-react";
import { auth } from "@/lib/auth";
import { connectDB } from "@/lib/db";
import { buildManagedCoursesFilter } from "@/lib/educator-auth";
import Course from "@/models/Course";
import Enrollment from "@/models/Enrollment";
import { ConsolePage } from "@/components/educator/console-page";
import { ButtonLink } from "@/components/ui/button";
import { Badge, EmptyState, List, ListRow, PageHeader } from "@/components/ui/surface";

export default async function EducatorCoursesPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/auth/signin?callbackUrl=/educator/courses");

  await connectDB();
  const courses = await Course.find(
    session.user.role === "admin"
      ? {}
      : buildManagedCoursesFilter({ userId: session.user.id, email: session.user.email, role: session.user.role }),
  )
    .select("title slug published courseType tagline imageUrl modules")
    .sort({ updatedAt: -1 })
    .lean();
  const counts = await Enrollment.aggregate<{ _id: unknown; count: number }>([
    { $match: { courseId: { $in: courses.map((course) => course._id) } } },
    { $group: { _id: "$courseId", count: { $sum: 1 } } },
  ]);
  const learnersBy = new Map(counts.map((item) => [String(item._id), item.count]));

  return (
    <ConsolePage>
      <PageHeader
        title="Courses"
        actions={
          <ButtonLink href="/educator/courses/new" variant="primary" icon={Plus}>
            New course
          </ButtonLink>
        }
      />
      {courses.length ? (
        <List>
          {courses.map((course) => {
            const lessons = ((course.modules || []) as Array<{ lessons?: unknown[] }>).reduce(
              (sum: number, module) => sum + (module.lessons?.length || 0),
              0,
            );
            return (
              <ListRow
                key={String(course._id)}
                href={`/educator/courses/${course.slug}`}
                leading={
                  course.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={course.imageUrl} alt="" className="h-10 w-16 rounded-md object-cover" />
                  ) : (
                    <span className="flex h-10 w-16 items-center justify-center rounded-md bg-muted text-muted-foreground">
                      <BookOpen className="h-4 w-4" strokeWidth={1.75} />
                    </span>
                  )
                }
                title={course.title}
                meta={`${course.courseType === "live" ? "Live" : "Self-paced"} · ${lessons} lessons · ${learnersBy.get(String(course._id)) || 0} learners`}
                trailing={
                  <Badge tone={course.published ? "success" : "neutral"} dot>
                    {course.published ? "Published" : "Draft"}
                  </Badge>
                }
              />
            );
          })}
        </List>
      ) : (
        <EmptyState
          icon={BookOpen}
          title="No courses yet"
          action={
            <ButtonLink href="/educator/courses/new" variant="primary" icon={Plus}>
              New course
            </ButtonLink>
          }
        />
      )}
    </ConsolePage>
  );
}

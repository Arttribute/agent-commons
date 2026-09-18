import { redirect } from "next/navigation";
import { Award } from "lucide-react";
import { auth } from "@/lib/auth";
import { connectDB } from "@/lib/db";
import { buildManagedCoursesFilter } from "@/lib/educator-auth";
import Course from "@/models/Course";
import { ConsolePage } from "@/components/educator/console-page";
import { Badge, EmptyState, List, ListRow, PageHeader } from "@/components/ui/surface";

export default async function EducatorSkillsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/auth/signin?callbackUrl=/educator/skills");

  await connectDB();
  const courses = await Course.find(
    session.user.role === "admin"
      ? {}
      : buildManagedCoursesFilter({ userId: session.user.id, email: session.user.email, role: session.user.role }),
  )
    .select("title slug published skillPack skillPacks updatedAt")
    .sort({ updatedAt: -1 })
    .lean();

  const rows = courses.flatMap((course) => {
    const packs = [
      { key: "primary", pack: course.skillPack },
      ...((course.skillPacks || []) as Array<typeof course.skillPack>).map((pack, index: number) => ({
        key: `pack-${index}`,
        pack,
      })),
    ];
    return packs
      .filter(({ pack }) => pack && (pack.challenges?.length || pack.enabled))
      .map(({ key, pack }) => ({
        id: `${course.slug}-${key}`,
        href: `/educator/courses/${course.slug}/skills?path=${key}&item=settings`,
        title: pack!.title || "Untitled skill path",
        course: course.title,
        challenges: pack!.challenges?.length || 0,
        live: Boolean(pack!.enabled && pack!.challenges?.length && course.published),
      }));
  });

  return (
    <ConsolePage>
      <PageHeader
        title="Skill badges"
        info="Short daily challenge paths. Each lives inside a course and can also appear on the public Skills page."
      />
      {rows.length ? (
        <List>
          {rows.map((row) => (
            <ListRow
              key={row.id}
              href={row.href}
              leading={
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                  <Award className="h-4 w-4" strokeWidth={1.75} />
                </span>
              }
              title={row.title}
              meta={`${row.course} · ${row.challenges} challenge${row.challenges === 1 ? "" : "s"}`}
              trailing={<Badge tone={row.live ? "success" : "neutral"}>{row.live ? "Live" : "Draft"}</Badge>}
            />
          ))}
        </List>
      ) : (
        <EmptyState
          icon={Award}
          title="No skill paths yet"
          description="Open a course and add a path from its Skill badges section."
        />
      )}
    </ConsolePage>
  );
}

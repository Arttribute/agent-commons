import { redirect } from "next/navigation";
import { requireEducatorCourse } from "@/lib/educator-auth";

export default async function EducatorCourseLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<unknown>;
}) {
  const { slug } = (await params) as { slug: string };
  const result = await requireEducatorCourse(slug);
  if (result.error) redirect("/educator");

  return <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8">{children}</div>;
}

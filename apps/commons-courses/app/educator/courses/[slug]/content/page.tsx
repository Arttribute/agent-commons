import { CourseEditor } from "@/components/educator/course-editor";

export default async function CourseContentPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-bold uppercase tracking-[0.16em] text-slate-400">
          Course build
        </p>
        <h2 className="mt-2 text-3xl font-bold text-slate-950">Content</h2>
        <p className="mt-2 max-w-2xl text-sm text-slate-500">
          Shape modules, lessons, descriptions, preview access, and content references in one place.
        </p>
      </div>
      <CourseEditor slug={slug} section="content" />
    </div>
  );
}

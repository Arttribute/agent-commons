import { CourseEditor } from "@/components/educator/course-editor";

export default async function CourseAccessPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-bold uppercase tracking-[0.16em] text-slate-400">
          Revenue and access
        </p>
        <h2 className="mt-2 text-3xl font-bold text-slate-950">Access programs</h2>
        <p className="mt-2 max-w-2xl text-sm text-slate-500">
          Manage checkout options alongside promo codes, scholarships, passes, affiliates, and early payment discounts.
        </p>
      </div>
      <CourseEditor slug={slug} section="access" />
    </div>
  );
}

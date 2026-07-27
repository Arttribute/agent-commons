import { ExperienceLibrary } from "@/components/educator/experience-library";

export default async function CourseExperiencesPage({
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
        <h2 className="mt-2 text-3xl font-bold text-slate-950">
          Immersive experiences
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
          Create modular, character-led learning quests that connect story,
          practice, and evidence of understanding.
        </p>
      </div>
      <ExperienceLibrary courseSlug={slug} />
    </div>
  );
}

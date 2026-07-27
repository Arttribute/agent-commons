import { ExperienceStudio } from "@/components/educator/experience-studio";

export default async function ExperienceStudioPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ExperienceStudio experienceId={id} />;
}

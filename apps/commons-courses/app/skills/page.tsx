import { getPublicSkillsOverview } from "@/lib/skills-overview";
import { SkillsClient } from "./skills-client";

export const revalidate = 60;

export default async function SkillsPage() {
  const overview = await getPublicSkillsOverview();

  return <SkillsClient {...overview} />;
}

import { auth } from "@/lib/auth";
import { getSkillsOverview } from "@/lib/skills-overview";
import { SkillsClient } from "./skills-client";

export default async function SkillsPage() {
  const session = await auth();
  const overview = await getSkillsOverview(session?.user);

  return <SkillsClient {...overview} />;
}

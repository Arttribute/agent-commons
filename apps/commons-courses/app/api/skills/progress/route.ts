import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getPublicSkillsOverview } from "@/lib/skills-overview";
import { getProgressBySkillSlug } from "@/lib/skill-progress";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ authenticated: false, progressBySlug: {} });
  }

  const { packs } = await getPublicSkillsOverview();
  const progressBySlug = await getProgressBySkillSlug({
    userId: session.user.id,
    packs,
  });

  return NextResponse.json({ authenticated: true, progressBySlug });
}

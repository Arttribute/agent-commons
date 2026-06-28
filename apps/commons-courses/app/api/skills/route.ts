import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getSkillsOverview } from "@/lib/skills-overview";

export async function GET() {
  const session = await auth();
  const overview = await getSkillsOverview(session?.user);

  return NextResponse.json(overview);
}

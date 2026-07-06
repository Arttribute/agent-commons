import { NextRequest, NextResponse } from "next/server";
import { requireEducator } from "@/lib/educator-auth";
import EducatorCopilotPreference from "@/models/EducatorCopilotPreference";
import EducatorCopilotSession from "@/models/EducatorCopilotSession";
import type {
  EducatorCopilotActionMode,
  EducatorCopilotPageContext,
} from "@/types/educator-copilot";

type CopilotPreferenceDoc = { actionMode?: EducatorCopilotActionMode } | null;

export async function GET() {
  const result = await requireEducator();
  if (result.error || !result.session) return result.error;

  const [sessions, preferenceResult] = await Promise.all([
    EducatorCopilotSession.find({
      userId: result.session.userId,
      archived: { $ne: true },
    })
      .select("_id title actionMode currentPath createdAt updatedAt")
      .sort({ updatedAt: -1 })
      .limit(30)
      .lean(),
    EducatorCopilotPreference.findOneAndUpdate(
      { userId: result.session.userId },
      { $setOnInsert: { actionMode: "manual" } },
      { new: true, upsert: true }
    ).lean(),
  ]);
  const preference = preferenceResult as CopilotPreferenceDoc;

  return NextResponse.json({
    sessions: sessions.map((session) => ({
      id: String(session._id),
      title: session.title,
      actionMode: session.actionMode || preference?.actionMode || "manual",
      currentPath: session.currentPath,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
    })),
    preference: {
      actionMode: preference?.actionMode || "manual",
    },
  });
}

export async function POST(req: NextRequest) {
  const result = await requireEducator();
  if (result.error || !result.session) return result.error;

  const body = (await req.json().catch(() => ({}))) as {
    pageContext?: EducatorCopilotPageContext;
  };
  const preference = (await EducatorCopilotPreference.findOneAndUpdate(
    { userId: result.session.userId },
    { $setOnInsert: { actionMode: "manual" } },
    { new: true, upsert: true }
  ).lean()) as CopilotPreferenceDoc;
  const session = await EducatorCopilotSession.create({
    userId: result.session.userId,
    title: "New copilot session",
    actionMode: preference?.actionMode || "manual",
    currentPath: body.pageContext?.path,
    pageContext: body.pageContext,
    messages: [],
  });

  return NextResponse.json({
    session: {
      id: String(session._id),
      title: session.title,
      actionMode: session.actionMode,
      currentPath: session.currentPath,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      messages: [],
    },
  });
}

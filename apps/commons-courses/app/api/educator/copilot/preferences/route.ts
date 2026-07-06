import { NextRequest, NextResponse } from "next/server";
import { requireEducator } from "@/lib/educator-auth";
import EducatorCopilotPreference from "@/models/EducatorCopilotPreference";
import type { EducatorCopilotActionMode } from "@/types/educator-copilot";

type CopilotPreferenceDoc = { actionMode?: EducatorCopilotActionMode } | null;

export async function GET() {
  const result = await requireEducator();
  if (result.error || !result.session) return result.error;

  const preference = (await EducatorCopilotPreference.findOneAndUpdate(
    { userId: result.session.userId },
    { $setOnInsert: { actionMode: "manual" } },
    { new: true, upsert: true }
  ).lean()) as CopilotPreferenceDoc;

  return NextResponse.json({
    preference: {
      actionMode: preference?.actionMode || "manual",
    },
  });
}

export async function PATCH(req: NextRequest) {
  const result = await requireEducator();
  if (result.error || !result.session) return result.error;

  const body = (await req.json()) as { actionMode?: EducatorCopilotActionMode };
  const actionMode = body.actionMode === "auto" ? "auto" : "manual";
  const preference = (await EducatorCopilotPreference.findOneAndUpdate(
    { userId: result.session.userId },
    { $set: { actionMode } },
    { new: true, upsert: true }
  ).lean()) as CopilotPreferenceDoc;

  return NextResponse.json({
    preference: {
      actionMode: preference?.actionMode || actionMode,
    },
  });
}

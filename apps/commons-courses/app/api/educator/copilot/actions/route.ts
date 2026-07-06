import { NextRequest, NextResponse } from "next/server";
import { requireEducator } from "@/lib/educator-auth";
import { applyEducatorCopilotAction } from "@/lib/educator-copilot-runtime";
import EducatorCopilotPreference from "@/models/EducatorCopilotPreference";
import EducatorCopilotSession from "@/models/EducatorCopilotSession";
import type {
  EducatorCopilotAction,
  EducatorCopilotActionMode,
} from "@/types/educator-copilot";

type CopilotPreferenceDoc = { actionMode?: EducatorCopilotActionMode } | null;

export async function POST(req: NextRequest) {
  const result = await requireEducator();
  if (result.error || !result.session) return result.error;

  const body = (await req.json()) as {
    sessionId?: string;
    actionId?: string;
    decision?: "approve" | "reject";
  };
  if (!body.sessionId || !body.actionId) {
    return NextResponse.json(
      { error: "sessionId and actionId are required." },
      { status: 400 }
    );
  }

  const session = await EducatorCopilotSession.findOne({
    _id: body.sessionId,
    userId: result.session.userId,
    archived: { $ne: true },
  });
  if (!session) {
    return NextResponse.json({ error: "Session not found." }, { status: 404 });
  }

  let found:
    | { messageIndex: number; actionIndex: number; action: EducatorCopilotAction }
    | null = null;
  const sessionMessages = session.messages as Array<{
    actions?: EducatorCopilotAction[];
  }>;
  for (let messageIndex = 0; messageIndex < sessionMessages.length; messageIndex += 1) {
    const actions = sessionMessages[messageIndex].actions || [];
    for (let actionIndex = 0; actionIndex < actions.length; actionIndex += 1) {
      const action = actions[actionIndex];
      if (action.id === body.actionId) {
        found = { messageIndex, actionIndex, action };
        break;
      }
    }
    if (found) break;
  }
  if (!found) {
    return NextResponse.json({ error: "Action not found." }, { status: 404 });
  }

  const preference = (await EducatorCopilotPreference.findOneAndUpdate(
    { userId: result.session.userId },
    { $setOnInsert: { actionMode: "manual" } },
    { new: true, upsert: true }
  ).lean()) as CopilotPreferenceDoc;

  const nextAction =
    body.decision === "reject"
      ? {
          ...found.action,
          status: "rejected" as const,
          result: "Rejected by educator.",
        }
      : await applyEducatorCopilotAction({
          user: {
            id: result.session.userId,
            email: result.session.email,
            role: result.session.role,
          },
          action: found.action,
          actionMode: preference?.actionMode || "manual",
        });

  sessionMessages[found.messageIndex].actions![found.actionIndex] = nextAction;
  session.markModified("messages");
  await session.save();

  return NextResponse.json({
    action: nextAction,
    session: {
      id: String(session._id),
      title: session.title,
      actionMode: session.actionMode,
      currentPath: session.currentPath,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      messages: session.messages || [],
    },
  });
}

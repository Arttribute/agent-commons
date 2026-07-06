import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireEducator } from "@/lib/educator-auth";
import {
  applyEducatorCopilotAction,
  generateEducatorCopilotTurn,
} from "@/lib/educator-copilot-runtime";
import EducatorCopilotPreference from "@/models/EducatorCopilotPreference";
import EducatorCopilotSession from "@/models/EducatorCopilotSession";
import type {
  EducatorCopilotAction,
  EducatorCopilotActionMode,
  EducatorCopilotPageContext,
} from "@/types/educator-copilot";

type CopilotPreferenceDoc = { actionMode?: EducatorCopilotActionMode } | null;

type ChatBody = {
  sessionId?: string;
  message?: string;
  pageContext?: EducatorCopilotPageContext;
};

export async function POST(req: NextRequest) {
  const result = await requireEducator();
  if (result.error || !result.session) return result.error;

  const body = (await req.json()) as ChatBody;
  const content = body.message?.trim();
  if (!content) {
    return NextResponse.json({ error: "message is required." }, { status: 400 });
  }

  const preference = (await EducatorCopilotPreference.findOneAndUpdate(
    { userId: result.session.userId },
    { $setOnInsert: { actionMode: "manual" } },
    { new: true, upsert: true }
  ).lean()) as CopilotPreferenceDoc;
  const actionMode = preference?.actionMode || "manual";
  let session = body.sessionId
    ? await EducatorCopilotSession.findOne({
        _id: body.sessionId,
        userId: result.session.userId,
        archived: { $ne: true },
      })
    : null;
  if (!session) {
    session = await EducatorCopilotSession.create({
      userId: result.session.userId,
      title: "New copilot session",
      actionMode,
      currentPath: body.pageContext?.path,
      pageContext: body.pageContext,
      messages: [],
    });
  }

  const now = new Date();
  const userMessage = {
    id: randomUUID(),
    role: "user" as const,
    content,
    createdAt: now,
    actions: [],
  };
  session.messages.push(userMessage);
  session.actionMode = actionMode;
  session.currentPath = body.pageContext?.path;
  session.pageContext = body.pageContext;
  const runtimeMessages = (
    session.messages as Array<{ role: "user" | "assistant"; content: string }>
  ).map((storedMessage) => ({
    role: storedMessage.role,
    content: storedMessage.content,
  }));

  const assistantTurn = await generateEducatorCopilotTurn({
    user: {
      id: result.session.userId,
      email: result.session.email,
      role: result.session.role,
    },
    message: content,
    messages: runtimeMessages,
    pageContext: body.pageContext,
    actionMode,
  });

  let actions = assistantTurn.actions as EducatorCopilotAction[];
  if (actionMode === "auto") {
    actions = await Promise.all(
      actions.map((action) =>
        action.safety === "content_write"
          ? applyEducatorCopilotAction({
              user: {
                id: result.session.userId,
                email: result.session.email,
                role: result.session.role,
              },
              action,
              actionMode,
            })
          : Promise.resolve(action)
      )
    );
  }

  const assistantMessage = {
    id: randomUUID(),
    role: "assistant" as const,
    content: assistantTurn.reply,
    createdAt: new Date(),
    actions,
  };
  session.messages.push(assistantMessage);
  const userMessageCount = runtimeMessages.filter(
    (storedMessage) => storedMessage.role === "user"
  ).length;
  if (session.title === "New copilot session" || userMessageCount === 1) {
    session.title = assistantTurn.sessionTitle || content.slice(0, 80);
  }
  session.markModified("messages");
  await session.save();

  return NextResponse.json({
    session: serializeSession(session),
    message: assistantMessage,
  });
}

function serializeSession(session: {
  _id: unknown;
  title: string;
  actionMode: string;
  currentPath?: string;
  createdAt: Date;
  updatedAt: Date;
  messages?: unknown[];
}) {
  return {
    id: String(session._id),
    title: session.title,
    actionMode: session.actionMode,
    currentPath: session.currentPath,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    messages: session.messages || [],
  };
}

import { NextRequest, NextResponse } from "next/server";
import { requireEducator } from "@/lib/educator-auth";
import EducatorCopilotSession from "@/models/EducatorCopilotSession";
import type { EducatorCopilotActionMode } from "@/types/educator-copilot";

type CopilotSessionDoc = {
  _id: unknown;
  title: string;
  actionMode: EducatorCopilotActionMode;
  currentPath?: string;
  createdAt: Date;
  updatedAt: Date;
  messages?: unknown[];
};

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requireEducator();
  if (result.error || !result.session) return result.error;

  const { id } = await params;
  const session = (await EducatorCopilotSession.findOne({
    _id: id,
    userId: result.session.userId,
    archived: { $ne: true },
  }).lean()) as CopilotSessionDoc | null;
  if (!session) {
    return NextResponse.json({ error: "Session not found." }, { status: 404 });
  }

  return NextResponse.json({
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

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requireEducator();
  if (result.error || !result.session) return result.error;

  const { id } = await params;
  const body = (await req.json()) as { archived?: boolean; title?: string };
  const update: Record<string, unknown> = {};
  if (typeof body.archived === "boolean") update.archived = body.archived;
  if (typeof body.title === "string" && body.title.trim()) {
    update.title = body.title.trim().slice(0, 80);
  }
  const session = (await EducatorCopilotSession.findOneAndUpdate(
    { _id: id, userId: result.session.userId },
    { $set: update },
    { new: true }
  ).lean()) as CopilotSessionDoc | null;
  if (!session) {
    return NextResponse.json({ error: "Session not found." }, { status: 404 });
  }

  return NextResponse.json({
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

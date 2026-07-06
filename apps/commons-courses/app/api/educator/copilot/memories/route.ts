import { NextRequest, NextResponse } from "next/server";
import { requireEducator } from "@/lib/educator-auth";
import { ensureEducatorCopilotProfile } from "@/lib/educator-copilot-agent";
import User from "@/models/User";

async function copilotContext(sessionUser: {
  userId: string;
  email?: string | null;
  role: "learner" | "educator" | "admin";
}) {
  const userDoc = (await User.findById(sessionUser.userId)
    .select("name")
    .lean()) as { name?: string } | null;
  return ensureEducatorCopilotProfile({
    id: sessionUser.userId,
    email: sessionUser.email,
    name: userDoc?.name,
    role: sessionUser.role,
  });
}

export async function GET() {
  const result = await requireEducator();
  if (result.error || !result.session) return result.error;

  const { profile, client, agentReady } = await copilotContext(result.session);
  if (!client || !agentReady || !profile.agentId) {
    return NextResponse.json({ memories: [], available: false });
  }

  try {
    const memories = await client.memory.list(profile.agentId, { limit: 50 });
    return NextResponse.json({
      available: true,
      memories: (memories.data || []).map((memory) => ({
        id: memory.memoryId,
        type: memory.memoryType,
        content: memory.content,
        importance: memory.importanceScore,
        createdAt: memory.createdAt,
      })),
    });
  } catch {
    return NextResponse.json({ memories: [], available: false });
  }
}

export async function POST(req: NextRequest) {
  const result = await requireEducator();
  if (result.error || !result.session) return result.error;

  const body = (await req.json().catch(() => ({}))) as { content?: string };
  const content = body.content?.trim();
  if (!content) {
    return NextResponse.json({ error: "content is required." }, { status: 400 });
  }

  const { profile, client, agentReady } = await copilotContext(result.session);
  if (!client || !agentReady || !profile.agentId) {
    return NextResponse.json({ error: "Copilot memory is unavailable." }, { status: 503 });
  }

  const created = await client.memory.create({
    agentId: profile.agentId,
    memoryType: "semantic",
    content: content.slice(0, 2000),
    summary: content.slice(0, 180),
    importanceScore: 0.9,
    tags: ["educator-preference", "manual"],
  });
  return NextResponse.json({
    memory: {
      id: created.data.memoryId,
      type: created.data.memoryType,
      content: created.data.content,
      importance: created.data.importanceScore,
      createdAt: created.data.createdAt,
    },
  });
}

export async function DELETE(req: NextRequest) {
  const result = await requireEducator();
  if (result.error || !result.session) return result.error;

  const memoryId = req.nextUrl.searchParams.get("id");
  if (!memoryId) {
    return NextResponse.json({ error: "id is required." }, { status: 400 });
  }

  const { profile, client, agentReady } = await copilotContext(result.session);
  if (!client || !agentReady || !profile.agentId) {
    return NextResponse.json({ error: "Copilot memory is unavailable." }, { status: 503 });
  }

  // Only allow deleting memories that belong to this educator's copilot agent.
  try {
    const memory = await client.memory.get(memoryId);
    if (memory.data.agentId !== profile.agentId) {
      return NextResponse.json({ error: "Memory not found." }, { status: 404 });
    }
    await client.memory.delete(memoryId);
    return NextResponse.json({ deleted: true });
  } catch {
    return NextResponse.json({ error: "Memory not found." }, { status: 404 });
  }
}

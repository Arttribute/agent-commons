import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { extractMaterial } from "@/lib/copilot-materials";
import { requireEducator } from "@/lib/educator-auth";
import {
  ensureAgentSession,
  ensureEducatorCopilotProfile,
  type CopilotUser,
} from "@/lib/educator-copilot-agent";
import {
  streamEducatorCopilotTurn,
  summarizeSessionTitle,
  type CopilotStreamEvent,
} from "@/lib/educator-copilot-runtime";
import EducatorCopilotSession, {
  type IEducatorCopilotSession,
} from "@/models/EducatorCopilotSession";
import User from "@/models/User";
import type {
  EducatorCopilotAttachment,
  EducatorCopilotPageContext,
} from "@/types/educator-copilot";

type ChatBody = {
  sessionId?: string;
  message?: string;
  pageContext?: EducatorCopilotPageContext;
  files?: File[];
};

// Copilot turns can span several tool round-trips; keep the function alive.
export const maxDuration = 300;

const maxFiles = 8;
const maxTotalBytes = 18 * 1024 * 1024;
const maxTextChars = 60000;

export async function POST(req: NextRequest) {
  const result = await requireEducator();
  if (result.error || !result.session) return result.error;

  const body = await parseChatBody(req);
  const files = (body.files || []).slice(0, maxFiles);
  const content =
    body.message?.trim() ||
    (files.length
      ? `Please read the ${files.length} attached file(s) and tell me what they contain.`
      : "");
  if (!content) {
    return NextResponse.json({ error: "message is required." }, { status: 400 });
  }
  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
  if (totalBytes > maxTotalBytes) {
    return NextResponse.json(
      { error: "Uploaded files must be smaller than 18 MB total." },
      { status: 400 }
    );
  }

  const userDoc = (await User.findById(result.session.userId)
    .select("name")
    .lean()) as { name?: string } | null;
  const user: CopilotUser = {
    id: result.session.userId,
    email: result.session.email,
    name: userDoc?.name,
    role: result.session.role,
  };

  const { profile, client, agentReady } = await ensureEducatorCopilotProfile(user);
  const actionMode = profile.actionMode || "manual";

  let session: IEducatorCopilotSession | null = body.sessionId
    ? ((await EducatorCopilotSession.findOne({
        _id: body.sessionId,
        userId: result.session.userId,
        archived: { $ne: true },
      })) as IEducatorCopilotSession | null)
    : null;
  if (!session) {
    session = (await EducatorCopilotSession.create({
      userId: result.session.userId,
      title: "New copilot session",
      actionMode,
      currentPath: body.pageContext?.path,
      pageContext: body.pageContext,
      messages: [],
      materials: [],
    })) as IEducatorCopilotSession;
  }

  // Link this chat to a real Agent Commons session so model-side history persists.
  const hadAgentSession = Boolean(session.agentSessionId);
  if (client && agentReady && profile.agentId && !session.agentSessionId) {
    session.agentSessionId = await ensureAgentSession({
      client,
      agentId: profile.agentId,
      initiator: user.id,
      title: content,
    });
  }

  // Extract text locally (powers the read_attachment tool) and upload the raw
  // files to Agent Commons so the run itself can read them natively.
  const materials = await Promise.all(
    files.map((file) => extractMaterial(file, { maxTextChars, includeImageData: false }))
  );
  const agentFileIds =
    client && agentReady && profile.agentId
      ? await uploadFilesToAgentCommons(files, {
          agentId: profile.agentId,
          sessionId: session.agentSessionId,
          initiator: user.id,
        })
      : [];
  const now = new Date();
  for (const [index, material] of materials.entries()) {
    session.materials.push({
      name: material.name,
      type: material.type,
      size: material.size,
      text: material.text,
      fileId: agentFileIds[index],
      uploadedAt: now,
    });
  }
  if (session.materials.length > 16) {
    session.materials = session.materials.slice(-16);
  }

  const attachmentSummary: EducatorCopilotAttachment[] = materials.map(
    (material, index) => ({
      name: material.name,
      type: material.type,
      size: material.size,
      textPreview: material.text.slice(0, 400),
      fileId: agentFileIds[index],
      status: agentFileIds[index] ? "uploaded" : "extracted",
    })
  );

  const priorConversation = !hadAgentSession
    ? (session.messages as Array<{ role: "user" | "assistant"; content: string }>).map(
        (message) => ({ role: message.role, content: message.content })
      )
    : undefined;

  session.messages.push({
    id: randomUUID(),
    role: "user",
    content,
    createdAt: now,
    attachments: attachmentSummary,
    actions: [],
    activity: [],
  });
  session.actionMode = actionMode;
  session.currentPath = body.pageContext?.path;
  session.pageContext = body.pageContext;
  session.markModified("messages");
  session.markModified("materials");
  await session.save();

  const isFirstTurn =
    session.messages.filter((message) => message.role === "user").length === 1;

  const runTurn = async (onEvent: (event: CopilotStreamEvent) => void | Promise<void>) => {
    if (!client || !agentReady || !profile.agentId) {
      const reply =
        "The educator copilot isn't connected to Agent Commons yet. An administrator needs to set AGENT_COMMONS_API_KEY (and optionally AGENT_COMMONS_API_URL) for this app, then I'll be fully operational.";
      await onEvent({ type: "token", content: reply });
      return {
        reply,
        actions: [],
        activity: [],
        sessionTitle: summarizeSessionTitle(content),
      };
    }
    return streamEducatorCopilotTurn({
      client,
      agentId: profile.agentId,
      agentSessionId: session!.agentSessionId,
      user,
      message: content,
      actionMode,
      pageContext: body.pageContext,
      materials: session!.materials,
      attachmentFileIds: agentFileIds,
      priorConversation,
      onEvent,
    });
  };

  const persistAssistantTurn = async (turn: {
    reply: string;
    actions: unknown[];
    activity: unknown[];
    sessionTitle: string;
  }) => {
    const assistantMessage = {
      id: randomUUID(),
      role: "assistant" as const,
      content: turn.reply,
      createdAt: new Date(),
      actions: turn.actions as never[],
      activity: turn.activity as never[],
    };
    session!.messages.push(assistantMessage);
    if (session!.title === "New copilot session" || isFirstTurn) {
      session!.title = turn.sessionTitle || content.slice(0, 80);
    }
    session!.markModified("messages");
    await session!.save();
    return assistantMessage;
  };

  if (req.headers.get("accept")?.includes("text/event-stream")) {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (event: Record<string, unknown>) => {
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
          } catch {
            // Stream already closed by the client.
          }
        };
        try {
          if (files.length) {
            send({ type: "status", content: `Reading ${files.length} attached file(s)` });
          }
          const turn = await runTurn((event) => {
            send(event as unknown as Record<string, unknown>);
          });
          const assistantMessage = await persistAssistantTurn(turn);
          send({
            type: "final",
            session: serializeSession(session!),
            message: assistantMessage,
          });
        } catch (error) {
          send({
            type: "error",
            message:
              error instanceof Error ? error.message : "The copilot could not respond.",
          });
        } finally {
          try {
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            controller.close();
          } catch {
            // Already closed.
          }
        }
      },
    });
    return new Response(stream, {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  }

  const turn = await runTurn(() => {});
  const assistantMessage = await persistAssistantTurn(turn);
  return NextResponse.json({
    session: serializeSession(session),
    message: assistantMessage,
  });
}

async function parseChatBody(req: NextRequest): Promise<ChatBody> {
  const contentType = req.headers.get("content-type") || "";
  if (contentType.includes("multipart/form-data")) {
    const formData = await req.formData();
    const pageContextRaw = formData.get("pageContext");
    let pageContext: EducatorCopilotPageContext | undefined;
    if (typeof pageContextRaw === "string" && pageContextRaw.trim()) {
      try {
        pageContext = JSON.parse(pageContextRaw) as EducatorCopilotPageContext;
      } catch {
        pageContext = undefined;
      }
    }
    return {
      sessionId: stringFormValue(formData.get("sessionId")),
      message: stringFormValue(formData.get("message")),
      pageContext,
      files: formData
        .getAll("files")
        .filter((item): item is File => item instanceof File)
        .slice(0, maxFiles),
    };
  }
  return ((await req.json().catch(() => ({}))) as ChatBody) || {};
}

async function uploadFilesToAgentCommons(
  files: File[],
  params: { agentId: string; sessionId?: string; initiator: string }
) {
  const apiKey = process.env.AGENT_COMMONS_API_KEY;
  const baseUrl = (
    process.env.AGENT_COMMONS_API_URL ||
    process.env.NEXT_PUBLIC_AGENT_COMMONS_API_URL ||
    "https://api.agentcommons.io"
  ).replace(/\/$/, "");
  if (!apiKey || !files.length) return [];

  try {
    const formData = new FormData();
    for (const file of files) formData.append("files", file, file.name);
    formData.append("agentId", params.agentId);
    if (params.sessionId) formData.append("sessionId", params.sessionId);
    const response = await fetch(`${baseUrl}/v1/files/upload`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "x-initiator": params.initiator,
      },
      body: formData,
    });
    if (!response.ok) return [];
    const payload = (await response.json()) as {
      data?: Array<{ fileId?: string }>;
    };
    return (payload.data || []).map((item) => item.fileId).filter(Boolean) as string[];
  } catch {
    return [];
  }
}

function stringFormValue(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : undefined;
}

function serializeSession(session: IEducatorCopilotSession) {
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

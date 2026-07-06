import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { extractMaterial, materialAttachmentSummary } from "@/lib/copilot-materials";
import { requireEducator } from "@/lib/educator-auth";
import {
  applyEducatorCopilotAction,
  generateEducatorCopilotTurn,
  streamEducatorCopilotTurn,
} from "@/lib/educator-copilot-runtime";
import EducatorCopilotPreference from "@/models/EducatorCopilotPreference";
import EducatorCopilotSession, {
  type IEducatorCopilotSession,
} from "@/models/EducatorCopilotSession";
import type {
  EducatorCopilotAction,
  EducatorCopilotActionMode,
  EducatorCopilotAttachment,
  EducatorCopilotPageContext,
} from "@/types/educator-copilot";

type CopilotPreferenceDoc = { actionMode?: EducatorCopilotActionMode } | null;

type ChatBody = {
  sessionId?: string;
  message?: string;
  pageContext?: EducatorCopilotPageContext;
  files?: File[];
};

const maxFiles = 8;
const maxTotalBytes = 18 * 1024 * 1024;
const maxTextChars = 24000;

export async function POST(req: NextRequest) {
  const result = await requireEducator();
  if (result.error || !result.session) return result.error;

  const body = await parseChatBody(req);
  const files = (body.files || []).slice(0, maxFiles);
  const content =
    body.message?.trim() ||
    (files.length ? `Please read and help me make sense of ${files.length} attached file(s).` : "");
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

  const preference = (await EducatorCopilotPreference.findOneAndUpdate(
    { userId: result.session.userId },
    { $setOnInsert: { actionMode: "manual" } },
    { new: true, upsert: true }
  ).lean()) as CopilotPreferenceDoc;
  const actionMode = preference?.actionMode || "manual";
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
    })) as IEducatorCopilotSession;
  }
  const materials = await Promise.all(
    files.map((file) =>
      extractMaterial(file, {
        maxTextChars,
        includeImageData: true,
      })
    )
  );
  const agentFileIds = await uploadFilesToAgentCommons(files, String(session._id));
  const attachmentSummary: EducatorCopilotAttachment[] = materialAttachmentSummary(materials).map((item, index) => ({
    ...item,
    fileId: agentFileIds[index],
    status: agentFileIds[index] ? "uploaded" : "extracted",
  }));

  const now = new Date();
  const userMessage = {
    id: randomUUID(),
    role: "user" as const,
    content,
    createdAt: now,
    attachments: attachmentSummary,
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

  if (req.headers.get("accept")?.includes("text/event-stream")) {
    return streamChatResponse({
      session,
      resultSession: result.session,
      content,
      runtimeMessages,
      pageContext: body.pageContext,
      actionMode,
      materials,
      agentFileIds,
    });
  }

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
    materials,
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

function streamChatResponse({
  session,
  resultSession,
  content,
  runtimeMessages,
  pageContext,
  actionMode,
  materials,
  agentFileIds,
}: {
  session: IEducatorCopilotSession;
  resultSession: NonNullable<Awaited<ReturnType<typeof requireEducator>>["session"]>;
  content: string;
  runtimeMessages: Array<{ role: "user" | "assistant"; content: string }>;
  pageContext?: EducatorCopilotPageContext;
  actionMode: EducatorCopilotActionMode;
  materials: Awaited<ReturnType<typeof extractMaterial>>[];
  agentFileIds: string[];
}) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };
      let assistantText = "";
      try {
        if (materials.length) {
          send({
            type: "status",
            content: `Reading ${materials.length} attached file(s)`,
          });
        }
        const assistantTurn = await streamEducatorCopilotTurn({
          user: {
            id: resultSession.userId,
            email: resultSession.email,
            role: resultSession.role,
          },
          message: content,
          messages: runtimeMessages,
          pageContext,
          actionMode,
          materials,
          agentFileIds,
          sessionId: String(session._id),
          onEvent: (event) => {
            if (event.type === "token") assistantText += event.content;
            send(event);
          },
        });

        let actions = assistantTurn.actions as EducatorCopilotAction[];
        if (actionMode === "auto") {
          actions = await Promise.all(
            actions.map((action) =>
              action.safety === "content_write"
                ? applyEducatorCopilotAction({
                    user: {
                      id: resultSession.userId,
                      email: resultSession.email,
                      role: resultSession.role,
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
          content: assistantText.trim() || assistantTurn.reply,
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
        send({
          type: "final",
          session: serializeSession(session),
          message: assistantMessage,
        });
      } catch (error) {
        send({
          type: "error",
          message: error instanceof Error ? error.message : "The copilot could not respond.",
        });
      } finally {
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
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

async function parseChatBody(req: NextRequest): Promise<ChatBody> {
  const contentType = req.headers.get("content-type") || "";
  if (contentType.includes("multipart/form-data")) {
    const formData = await req.formData();
    const pageContextRaw = formData.get("pageContext");
    const pageContext =
      typeof pageContextRaw === "string" && pageContextRaw.trim()
        ? (JSON.parse(pageContextRaw) as EducatorCopilotPageContext)
        : undefined;
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
  return ((await req.json()) as ChatBody) || {};
}

async function uploadFilesToAgentCommons(files: File[], sessionId: string) {
  const apiKey = process.env.AGENT_COMMONS_API_KEY;
  const agentId = process.env.EDUCATOR_COPILOT_AGENT_ID;
  const baseUrl =
    process.env.AGENT_COMMONS_API_URL ||
    process.env.NEXT_PUBLIC_AGENT_COMMONS_API_URL ||
    "https://api.agentcommons.io";
  if (!apiKey || !agentId || !files.length) return [];

  try {
    const formData = new FormData();
    for (const file of files) formData.append("files", file, file.name);
    formData.append("agentId", agentId);
    formData.append("sessionId", sessionId);
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/v1/files/upload`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
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

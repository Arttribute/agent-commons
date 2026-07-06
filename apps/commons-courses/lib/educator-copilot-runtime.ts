import type { CommonsClient } from "@agent-commons/sdk";
import { Types } from "mongoose";
import type { CopilotUser } from "@/lib/educator-copilot-agent";
import {
  educatorCopilotToolCatalog,
  executeEducatorCopilotTool,
  type CopilotToolContext,
} from "@/lib/educator-copilot-tools";
import { buildManagedCoursesFilter } from "@/lib/educator-auth";
import Course from "@/models/Course";
import Enrollment from "@/models/Enrollment";
import type { IEducatorCopilotMaterial } from "@/models/EducatorCopilotSession";
import type {
  EducatorCopilotAction,
  EducatorCopilotActionMode,
  EducatorCopilotPageContext,
  EducatorCopilotToolActivity,
} from "@/types/educator-copilot";

export type CopilotStreamEvent =
  | { type: "status"; content: string }
  | { type: "token"; content: string }
  | { type: "activity"; activity: EducatorCopilotToolActivity }
  | { type: "error"; message: string };

export type CopilotTurnResult = {
  reply: string;
  actions: EducatorCopilotAction[];
  activity: EducatorCopilotToolActivity[];
  sessionTitle: string;
};

const TOOL_LABELS: Record<string, string> = {
  list_courses: "Checking your courses",
  get_course: "Reading course structure",
  list_students: "Looking up students",
  get_student: "Looking up a student",
  get_course_analytics: "Crunching analytics",
  read_attachment: "Reading attached file",
  update_lesson: "Drafting a lesson edit",
  add_lesson: "Drafting a new lesson",
  add_module: "Drafting a new module",
  update_module: "Drafting a module edit",
  update_course_overview: "Drafting overview copy",
  update_skill_challenge: "Drafting a challenge edit",
  navigate: "Preparing navigation",
  highlight: "Locating page element",
  remember: "Saving a preference",
  recall_memories: "Recalling preferences",
};

export function toolActivityLabel(tool: string) {
  return TOOL_LABELS[tool] || `Running ${tool.replace(/_/g, " ")}`;
}

/**
 * Compact per-turn workspace snapshot injected into the agent's system prompt
 * via cliContext. Deep data is fetched on demand through the tool catalog.
 */
export async function buildWorkspaceSnapshot({
  user,
  actionMode,
  pageContext,
  materials,
  priorConversation,
}: {
  user: CopilotUser;
  actionMode: EducatorCopilotActionMode;
  pageContext?: EducatorCopilotPageContext;
  materials: IEducatorCopilotMaterial[];
  priorConversation?: Array<{ role: string; content: string }>;
}) {
  const filter =
    user.role === "admin"
      ? {}
      : buildManagedCoursesFilter({
          userId: user.id,
          email: user.email,
          role: user.role,
        });
  const courses = await Course.find(filter)
    .select("_id title slug published courseType modules updatedAt")
    .sort({ updatedAt: -1 })
    .limit(40)
    .lean();
  const enrollmentCounts = await Enrollment.aggregate([
    { $match: { courseId: { $in: courses.map((c) => c._id) } } },
    { $group: { _id: "$courseId", students: { $sum: 1 } } },
  ]);
  const studentsByCourse = new Map<string, number>(
    enrollmentCounts.map((row: { _id: Types.ObjectId; students: number }) => [
      String(row._id),
      row.students,
    ])
  );

  const currentSlug = extractCourseSlug(pageContext?.path || "");
  const lines: string[] = [];

  lines.push("EDUCATOR WORKSPACE SNAPSHOT");
  lines.push(
    `Educator: ${user.name || "Unknown"}${user.email ? ` <${user.email}>` : ""} (role: ${user.role || "educator"})`
  );
  lines.push(
    `Action mode: ${actionMode.toUpperCase()} — ${
      actionMode === "auto"
        ? "safe write tools apply immediately; sensitive operations stay impossible."
        : "write tools queue proposals the educator must approve; say so when you use them."
    }`
  );

  lines.push("");
  lines.push(`Managed courses (${courses.length}):`);
  if (!courses.length) {
    lines.push("- none yet (they can create one at /educator/courses/new)");
  }
  for (const course of courses) {
    const modules = (course.modules as Array<{ lessons?: unknown[] }>) || [];
    const lessonCount = modules.reduce((sum, mod) => sum + (mod.lessons?.length || 0), 0);
    lines.push(
      `- "${course.title}" | slug: ${course.slug} | ${course.published ? "published" : "draft"} | ${
        studentsByCourse.get(String(course._id)) || 0
      } students | ${modules.length} modules / ${lessonCount} lessons${
        course.slug === currentSlug ? " | ← currently open in the UI" : ""
      }`
    );
  }

  lines.push("");
  lines.push("Navigation map (use with the navigate tool):");
  lines.push(
    [
      "- /educator (dashboard)",
      "- /educator/analytics (portfolio analytics)",
      "- /educator/copilot (Create with AI studio)",
      "- /educator/settings",
      "- /educator/skills (skill badges)",
      "- /educator/courses/new (create course)",
    ].join("\n")
  );
  lines.push(
    "- Per course: /educator/courses/<slug> (dashboard), /content (modules & lessons editor), /skills (skill paths), /students, /assignments, /analytics, /edit (course settings), /collaborators, /payments, /access, /notifications"
  );

  if (pageContext) {
    lines.push("");
    lines.push("Current page:");
    lines.push(`- path: ${pageContext.path}`);
    if (pageContext.title) lines.push(`- title: ${pageContext.title}`);
    if (pageContext.selection) {
      lines.push(`- educator's selected text: "${truncate(pageContext.selection, 500)}"`);
    }
    const uiLabels = (pageContext.uiMap || [])
      .slice(0, 40)
      .map((item) => `${item.label} (${item.type})`);
    if (uiLabels.length) {
      lines.push(`- visible UI targets (usable with highlight): ${uiLabels.join("; ")}`);
    }
    if (pageContext.visibleText) {
      lines.push(`- visible text excerpt: ${truncate(pageContext.visibleText, 1200)}`);
    }
  }

  if (materials.length) {
    lines.push("");
    lines.push("Files uploaded in this session (read them with read_attachment):");
    for (const material of materials) {
      lines.push(
        `- ${material.name} (${material.type}, ${Math.round(material.size / 1024)} KB, ${material.text.length} extracted chars)${
          material.text ? ` — starts: "${truncate(material.text, 200)}"` : ""
        }`
      );
    }
  }

  if (priorConversation?.length) {
    lines.push("");
    lines.push("Earlier conversation in this session (before it was linked to you):");
    for (const message of priorConversation.slice(-8)) {
      lines.push(`${message.role === "user" ? "Educator" : "Copilot"}: ${truncate(message.content, 400)}`);
    }
  }

  return lines.join("\n");
}

/**
 * Run one copilot turn as a single streamed Agent Commons run. Tool calls the
 * agent makes come back as cli_tool_request events, get executed locally with
 * the educator's authorization, and their results are posted back so the run
 * continues — all within this one stream.
 */
export async function streamEducatorCopilotTurn({
  client,
  agentId,
  agentSessionId,
  user,
  message,
  actionMode,
  pageContext,
  materials,
  attachmentFileIds,
  priorConversation,
  onEvent,
}: {
  client: CommonsClient;
  agentId: string;
  agentSessionId?: string;
  user: CopilotUser;
  message: string;
  actionMode: EducatorCopilotActionMode;
  pageContext?: EducatorCopilotPageContext;
  materials: IEducatorCopilotMaterial[];
  attachmentFileIds?: string[];
  priorConversation?: Array<{ role: string; content: string }>;
  onEvent: (event: CopilotStreamEvent) => void | Promise<void>;
}): Promise<CopilotTurnResult> {
  const actions: EducatorCopilotAction[] = [];
  const activity: EducatorCopilotToolActivity[] = [];
  const toolCtx: CopilotToolContext = {
    user,
    actionMode,
    pageContext,
    materials,
    client,
    agentId,
    agentSessionId,
    recordAction: (action) => actions.push(action),
  };

  const cliContext = await buildWorkspaceSnapshot({
    user,
    actionMode,
    pageContext,
    materials,
    priorConversation,
  });

  let reply = "";
  let finalText = "";

  const stream = client.agents.stream({
    agentId,
    sessionId: agentSessionId,
    initiatorId: user.id,
    messages: [{ role: "user", content: message }],
    cliContext,
    cliTools: educatorCopilotToolCatalog.map((tool) => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    })),
    attachments: attachmentFileIds?.length
      ? attachmentFileIds.map((fileId) => ({ fileId }))
      : undefined,
  });

  for await (const event of stream) {
    if (event.type === "token" && event.content) {
      // Only surface final-answer tokens; commentary phases stay internal.
      if (!event.phase || event.phase === "final_answer") {
        reply += event.content;
        await onEvent({ type: "token", content: event.content });
      }
    } else if (event.type === "cli_tool_request") {
      const toolName = (event.tool || event.toolName || "tool") as string;
      const requestId = event.requestId as string | undefined;
      const args =
        event.args && typeof event.args === "object"
          ? (event.args as Record<string, unknown>)
          : typeof event.args === "string"
            ? safeParse(event.args)
            : {};
      const entry: EducatorCopilotToolActivity = {
        tool: toolName,
        label: toolActivityLabel(toolName),
        status: "running",
      };
      activity.push(entry);
      await onEvent({ type: "activity", activity: { ...entry } });

      const result = await executeEducatorCopilotTool(toolCtx, toolName, args);
      entry.status = result.includes('"error"') ? "error" : "done";
      await onEvent({ type: "activity", activity: { ...entry } });

      if (requestId) {
        await postCliToolResult(requestId, result);
      }
    } else if (event.type === "toolStart" || event.type === "tool") {
      const toolName = event.toolName || event.tool || event.name;
      if (toolName && event.type === "toolStart") {
        await onEvent({ type: "status", content: toolActivityLabel(String(toolName)) });
      }
    } else if (event.type === "status") {
      const content =
        (typeof event.content === "string" && event.content) ||
        (typeof event.message === "string" && event.message) ||
        "";
      if (content) await onEvent({ type: "status", content });
    } else if (event.type === "final") {
      finalText = extractEventText(event);
    } else if (event.type === "error" || event.type === "failed") {
      const errorMessage =
        (typeof event.message === "string" && event.message) ||
        (typeof event.content === "string" && event.content) ||
        "The copilot run failed.";
      await onEvent({ type: "error", message: errorMessage });
    }
  }

  let text = reply.trim() || finalText.trim();
  if (!text) {
    text = actions.length
      ? "I've prepared the actions below."
      : "I couldn't produce a reply for that — try rephrasing or asking again.";
    await onEvent({ type: "token", content: text });
  }

  return {
    reply: text,
    actions,
    activity,
    sessionTitle: summarizeSessionTitle(message),
  };
}

/** Post a locally-executed tool result back so the waiting agent run continues. */
async function postCliToolResult(requestId: string, result: string) {
  const baseUrl = (
    process.env.AGENT_COMMONS_API_URL ||
    process.env.NEXT_PUBLIC_AGENT_COMMONS_API_URL ||
    "https://api.agentcommons.io"
  ).replace(/\/$/, "");
  const apiKey = process.env.AGENT_COMMONS_API_KEY;
  try {
    await fetch(`${baseUrl}/v1/agents/cli-tool-result`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify({ requestId, result }),
    });
  } catch (error) {
    console.error("[educator-copilot] failed to post tool result:", error);
  }
}

function extractEventText(event: unknown): string {
  const record = event && typeof event === "object" ? (event as Record<string, unknown>) : {};
  const payload =
    record.payload && typeof record.payload === "object"
      ? (record.payload as Record<string, unknown>)
      : {};
  for (const candidate of [record.content, payload.content, payload.text, payload.message]) {
    if (typeof candidate === "string" && candidate.trim()) return candidate;
  }
  return "";
}

function safeParse(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function summarizeSessionTitle(message: string) {
  const cleaned = message.replace(/\s+/g, " ").trim();
  return cleaned.length > 50 ? `${cleaned.slice(0, 50)}…` : cleaned || "Copilot session";
}

export function extractCourseSlug(path: string) {
  const match = path.match(/\/educator\/courses\/([^/?#]+)/);
  return match?.[1] || null;
}

function truncate(value: string, max: number) {
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

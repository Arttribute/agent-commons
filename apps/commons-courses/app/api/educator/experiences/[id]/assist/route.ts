import { NextRequest, NextResponse } from "next/server";
import {
  ensureEducatorCopilotProfile,
  type CopilotUser,
} from "@/lib/educator-copilot-agent";
import { requireEducatorExperience } from "@/lib/experience-access";
import { normalizeExperienceDocument } from "@/lib/experience-schema";
import User from "@/models/User";
import type { ExperienceDocument } from "@/types/experience";

export const maxDuration = 300;

const maxBriefLength = 6000;
const maxDocumentContextLength = 100000;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const access = await requireEducatorExperience(id);
  if (!access.ok) return access.error;

  const body = (await req.json().catch(() => ({}))) as {
    brief?: string;
    document?: unknown;
  };
  const brief = body.brief?.trim().slice(0, maxBriefLength);
  if (!brief) {
    return NextResponse.json(
      { error: "Tell the studio what you want to create or improve." },
      { status: 400 },
    );
  }

  let currentDocument: ExperienceDocument;
  try {
    currentDocument = normalizeExperienceDocument(
      body.document || access.project.draft,
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "The current storyboard is invalid.",
      },
      { status: 400 },
    );
  }

  const userDoc = (await User.findById(access.session.userId)
    .select("name")
    .lean()) as { name?: string } | null;
  const user: CopilotUser = {
    id: access.session.userId,
    email: access.session.email,
    name: userDoc?.name,
    role: access.session.role,
    accessToken: access.session.accessToken,
    accessTokenError: access.session.accessTokenError,
    identityUserId: access.session.identityUserId,
    identityWorkspaceId: access.session.identityWorkspaceId,
  };
  const connection = await ensureEducatorCopilotProfile(user);
  if (
    !connection.client ||
    !connection.agentReady ||
    !connection.profile.agentId
  ) {
    return NextResponse.json(
      {
        error:
          connection.connectionMessage ||
          "Connect your Commons account before using the AI story architect.",
      },
      { status: 409 },
    );
  }

  const currentJson = JSON.stringify(currentDocument).slice(
    0,
    maxDocumentContextLength,
  );
  const instructions = [
    "You are the Story Architect inside CommonLab Experience Studio.",
    "Transform the educator's current experience document into a stronger, complete gamified lesson while preserving their intent.",
    "Return data only by calling propose_experience_document. Never write or propose executable code, HTML, JavaScript, database queries, or remote assets.",
    "The document must stay schemaVersion 1 and use only dialogue, explainer, choice, quiz, hotspot, collect, sort, match, sequence, and completion scene types.",
    "Use richer interactions when they fit the objective: collect uses mediaUrl plus positioned items shaped like {id,label,description,x,y}; sort and match use zones shaped like {id,label,description} plus items shaped like {id,label,description,targetId}; sequence uses items in the correct order shaped like {id,label,description}.",
    "Use concise learner-facing language, meaningful choices, plausible distractors, specific feedback, and a coherent path from startSceneId to completion.",
    "Keep IDs unique and stable where practical. Every referenced scene and character ID must exist.",
    "For hotspot and collect scenes, retain a usable image URL from the current document; otherwise use another activity type because you cannot invent a URL.",
    "Use at most 12 scenes and 6 characters. Do not claim facts that are absent from the educator brief or current document.",
    `Course: ${String(access.course.title || access.project.courseSlug)}`,
    `Educator brief: ${brief}`,
    `Current experience JSON: ${currentJson}`,
  ].join("\n\n");

  let proposed: unknown;
  try {
    const stream = connection.client.agents.stream({
      agentId: connection.profile.agentId,
      initiatorId:
        access.session.identityUserId || access.session.userId,
      messages: [{ role: "user", content: instructions }],
      cliContext:
        "You are operating in a constrained visual authoring studio. The only writable output is a validated JSON experience document returned through the provided CLI tool.",
      cliTools: [
        {
          name: "propose_experience_document",
          description:
            "Return the complete revised CommonLab ExperienceDocument. This creates a reversible proposal in the browser; it does not save or publish it.",
          parameters: {
            type: "object",
            properties: {
              document: {
                type: "object",
                description:
                  "The complete schemaVersion 1 experience document, including theme, characters, and scenes.",
              },
              summary: {
                type: "string",
                description: "A short summary of the pedagogical improvements.",
              },
            },
            required: ["document"],
            additionalProperties: false,
          },
        },
      ],
    });

    for await (const event of stream) {
      if (
        event.type !== "cli_tool_request" ||
        (event.tool || event.toolName) !== "propose_experience_document"
      ) {
        continue;
      }
      const args =
        typeof event.args === "string"
          ? JSON.parse(event.args)
          : event.args;
      if (args && typeof args === "object") {
        proposed = (args as { document?: unknown }).document;
      }
      if (event.requestId) {
        await connection.client.agents.submitCliToolResult(
          event.requestId,
          JSON.stringify({
            accepted: Boolean(proposed),
            message:
              "The proposed document was received for server validation and educator review.",
          }),
        );
      }
    }
  } catch (error) {
    console.error("[experience-assist] agent run failed:", error);
    return NextResponse.json(
      { error: "The story architect could not complete this draft. Please retry." },
      { status: 502 },
    );
  }

  if (!proposed) {
    return NextResponse.json(
      {
        error:
          "The story architect did not return a structured draft. Refine the brief and try again.",
      },
      { status: 422 },
    );
  }

  try {
    return NextResponse.json({
      document: normalizeExperienceDocument(proposed, { publish: true }),
    });
  } catch (error) {
    console.error("[experience-assist] invalid document:", error);
    return NextResponse.json(
      {
        error:
          "The generated storyboard did not pass validation. Try a more focused brief.",
      },
      { status: 422 },
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import type { CommonsClient } from "@agent-commons/sdk";
import {
  ensureEducatorCopilotProfile,
  type CopilotUser,
} from "@/lib/educator-copilot-agent";
import {
  buildExperienceCourseContext,
  describeExperienceCopilotImpact,
  EXPERIENCE_COPILOT_WORLD_GUIDE,
  experienceAiFailure,
} from "@/lib/experience-ai";
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
    focus?: {
      tab?: string;
      sceneId?: string;
      locationId?: string;
      characterId?: string;
      assetId?: string;
    };
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
  const client = connection.client;
  const agentId = connection.profile.agentId;

  const currentJson = JSON.stringify(currentDocument).slice(
    0,
    maxDocumentContextLength,
  );
  const courseContext = await buildExperienceCourseContext({
    course: access.course,
    client,
    agentId,
    query: brief,
  });
  const focus = [
    body.focus?.tab ? `Studio area: ${body.focus.tab.slice(0, 30)}` : "",
    body.focus?.sceneId
      ? `Selected scene ID: ${body.focus.sceneId.slice(0, 80)}`
      : "",
    body.focus?.locationId
      ? `Selected location ID: ${body.focus.locationId.slice(0, 80)}`
      : "",
    body.focus?.characterId
      ? `Selected character ID: ${body.focus.characterId.slice(0, 80)}`
      : "",
    body.focus?.assetId
      ? `Selected asset ID: ${body.focus.assetId.slice(0, 80)}`
      : "",
  ].filter(Boolean);
  const instructions = [
    "You are operating as the educator's existing account-level copilot inside CommonLab Experience Studio. Apply the educator memories, current course, current world state, and studio focus supplied below.",
    "Act as a precise world editor when the educator requests a focused change, and as a world architect only when they request a broad creation or redesign. Preserve everything outside the requested scope.",
    "Return data only by calling propose_experience_document. Never write or propose executable code, HTML, JavaScript, database queries, shaders, or invented remote URLs. The database stores declarative world data, never generated code.",
    EXPERIENCE_COPILOT_WORLD_GUIDE,
    "The document must use schemaVersion 2. Design a coherent world bible, reusable locations, mission arc, cinematic scene composition, and varied interactions when the brief calls for them.",
    "Use shots for multi-beat dialogue and camera changes. Keep learner-facing copy concise enough to feel like a game, not a textbook page.",
    "Use meaningful decisions, plausible distractors, explicit mission feedback, and a coherent route from startSceneId to at least one completion. Narrative loops are allowed only when every reachable scene still has a path to completion.",
    "Keep IDs unique and stable where practical. Every referenced scene and character ID must exist.",
    "For a broad new world use at most 16 scenes, 8 locations, and 8 characters; focused edits should retain the current document size. Do not claim course facts absent from the supplied curriculum or brief.",
    courseContext,
    focus.length
      ? `CURRENT STUDIO FOCUS\n${focus.join("\n")}`
      : "CURRENT STUDIO FOCUS\nNo specific entity is selected.",
    `Educator brief: ${brief}`,
    `Current experience JSON: ${currentJson}`,
  ].join("\n\n");

  let proposal: { document?: unknown; summary?: string };
  try {
    proposal = await requestExperienceProposal({
      client,
      agentId,
      initiatorId: access.session.identityUserId || access.session.userId,
      instructions,
    });
  } catch (error) {
    console.error("[experience-assist] agent run failed:", error);
    const failure = experienceAiFailure(
      error,
      "The story architect could not complete this draft.",
    );
    return NextResponse.json(failure, { status: failure.status });
  }

  if (!proposal.document) {
    return NextResponse.json(
      {
        error:
          "The story architect did not return a structured draft. Refine the brief and try again.",
      },
      { status: 422 },
    );
  }

  let normalized: ExperienceDocument;
  try {
    normalized = normalizeExperienceDocument(proposal.document, {
      publish: true,
    });
  } catch (firstError) {
    console.warn(
      "[experience-assist] first proposal failed validation; requesting one repair:",
      firstError,
    );
    const validationMessage =
      firstError instanceof Error ? firstError.message : "Unknown validation error";
    try {
      const repair = await requestExperienceProposal({
        client,
        agentId,
        initiatorId: access.session.identityUserId || access.session.userId,
        instructions: [
          "Repair the proposed CommonLab ExperienceDocument below. Return the complete repaired document through propose_experience_document.",
          "Change only what is necessary to satisfy the validation error. Preserve the educator's requested edit, all valid content, stable IDs, and all existing asset records.",
          EXPERIENCE_COPILOT_WORLD_GUIDE,
          `Validation error: ${validationMessage}`,
          `Original educator brief: ${brief}`,
          `Invalid proposed document JSON: ${JSON.stringify(proposal.document).slice(0, maxDocumentContextLength)}`,
        ].join("\n\n"),
      });
      if (!repair.document) throw new Error("The repair returned no document.");
      normalized = normalizeExperienceDocument(repair.document, {
        publish: true,
      });
      proposal.summary = repair.summary || proposal.summary;
    } catch (repairError) {
      console.error("[experience-assist] repaired document invalid:", repairError);
      return NextResponse.json(
        {
          error: `The copilot could not produce a safe world edit: ${
            repairError instanceof Error
              ? repairError.message
              : validationMessage
          }`,
          code: "experience_proposal_invalid",
          retryable: false,
        },
        { status: 422 },
      );
    }
  }

  return NextResponse.json({
    document: normalized,
    summary:
      proposal.summary?.trim().slice(0, 800) ||
      "The copilot prepared a validated world update.",
    impact: describeExperienceCopilotImpact(currentDocument, normalized),
  });
}

async function requestExperienceProposal({
  client,
  agentId,
  initiatorId,
  instructions,
}: {
  client: CommonsClient;
  agentId: string;
  initiatorId: string;
  instructions: string;
}) {
  let result: { document?: unknown; summary?: string } = {};
  const stream = client.agents.stream({
    agentId,
    initiatorId,
    messages: [{ role: "user", content: instructions }],
    cliContext:
      "You are operating in a constrained visual authoring studio. The only writable output is a complete, validated JSON experience proposal returned through propose_experience_document. Do not emit code or mutate external state.",
    cliTools: [
      {
        name: "propose_experience_document",
        description:
          "Return the complete revised CommonLab schemaVersion 2 ExperienceDocument. The browser shows it as a reversible proposal; the educator must explicitly apply it before the autosave system persists it.",
        parameters: {
          type: "object",
          properties: {
            document: {
              type: "object",
              required: [
                "schemaVersion",
                "title",
                "subtitle",
                "description",
                "estimatedMinutes",
                "objectives",
                "startSceneId",
                "theme",
                "world",
                "assets",
                "characters",
                "scenes",
              ],
              properties: {
                schemaVersion: { type: "number", const: 2 },
                title: { type: "string" },
                subtitle: { type: "string" },
                description: { type: "string" },
                estimatedMinutes: { type: "number" },
                objectives: {
                  type: "array",
                  items: { type: "string" },
                },
                startSceneId: { type: "string" },
                theme: { type: "object" },
                world: { type: "object" },
                assets: { type: "array", items: { type: "object" } },
                characters: { type: "array", items: { type: "object" } },
                scenes: { type: "array", items: { type: "object" } },
              },
              additionalProperties: false,
              description:
                "The complete experience, including world graph, asset registry, characters, cinematic stages, shots, interaction data, and story routes.",
            },
            summary: {
              type: "string",
              description:
                "In no more than three sentences, explain exactly what changed and why it serves the educator's request.",
            },
          },
          required: ["document", "summary"],
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
      typeof event.args === "string" ? JSON.parse(event.args) : event.args;
    if (args && typeof args === "object") {
      const proposal = args as { document?: unknown; summary?: unknown };
      result = {
        document: proposal.document,
        summary:
          typeof proposal.summary === "string"
            ? proposal.summary
            : undefined,
      };
    }
    if (event.requestId) {
      await client.agents.submitCliToolResult(
        event.requestId,
        JSON.stringify({
          accepted: Boolean(result.document),
          message:
            "The proposal was received for deterministic schema validation and educator review.",
        }),
      );
    }
  }
  return result;
}

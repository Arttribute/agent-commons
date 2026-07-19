import { createHash } from "crypto";
import type { CommonsClient, CreateAgentParams } from "@agent-commons/sdk";
import { getAgentCommonsClient } from "@/lib/agent-commons";
import { platformServiceToken } from "@/lib/platform-service-token";
import {
  EDUCATOR_COPILOT_PEDAGOGY,
  EDUCATOR_COPILOT_SAFETY,
} from "@/lib/educator-copilot-policy";
import EducatorCopilotPreference, {
  type IEducatorCopilotPreference,
} from "@/models/EducatorCopilotPreference";

export type CopilotUser = {
  id: string;
  email?: string | null;
  name?: string | null;
  role?: "learner" | "educator" | "admin";
  accessToken?: string;
  accessTokenError?: string;
  identityUserId?: string;
  identityWorkspaceId?: string;
};

export type CopilotConnectionStatus =
  | "ready"
  | "account_unlinked"
  | "reauthorization_required"
  | "service_unavailable"
  | "provisioning_failed";

export type CopilotProfileResult = {
  profile: IEducatorCopilotPreference;
  client: CommonsClient | null;
  agentReady: boolean;
  connectionStatus: CopilotConnectionStatus;
  connectionMessage?: string;
  principalId?: string;
  platformAccessToken?: string;
};

const DEFAULT_COPILOT_NAME = "Educator Copilot";

function defaultModel() {
  return {
    provider:
      process.env.EDUCATOR_COPILOT_MODEL_PROVIDER ||
      process.env.AGENT_COMMONS_DEFAULT_MODEL_PROVIDER ||
      "openai",
    modelId:
      process.env.EDUCATOR_COPILOT_MODEL_ID ||
      process.env.AGENT_COMMONS_DEFAULT_MODEL_ID ||
      "gpt-5.4-mini",
  };
}

export function resolveCopilotModel(profile: IEducatorCopilotPreference) {
  const fallback = defaultModel();
  return {
    provider: profile.modelProvider || fallback.provider,
    modelId: profile.modelId || fallback.modelId,
  };
}

/**
 * Base identity + operating rules for the per-educator copilot agent.
 * Live data (courses, students, the current page, uploads) arrives per turn
 * through cliContext and the tool catalog — the instructions only teach the
 * agent how to behave and how to use its tools.
 */
export function buildCopilotInstructions({
  user,
  copilotName,
  customInstructions,
}: {
  user: CopilotUser;
  copilotName: string;
  customInstructions?: string;
}) {
  return [
    `You are "${copilotName}", the personal educator copilot for ${user.name || "this educator"}${user.email ? ` (${user.email})` : ""} inside CommonLab Courses. You work only for this educator.`,

    [
      "You are embedded in a side panel across the entire educator console.",
      "Every turn you receive an EDUCATOR WORKSPACE SNAPSHOT (their courses, headline metrics, the page they are on, uploaded files, and available UI targets) plus a set of tools that read and write real workspace data.",
      "The snapshot is a summary. When you need detail — full lesson text, student lists, analytics, uploaded file contents — call the matching tool instead of guessing.",
    ].join("\n"),

    [
      "Core behavior:",
      "- Answer the question that was asked, with real data. Never reply with a generic capability statement ('I can help with...') when the educator asked something concrete.",
      "- If they ask how many students they have, count from list_students or course metrics and give the number.",
      "- If they name a course (with typos or shorthand), match it to their course list and act on it. Ask only when two courses are genuinely ambiguous.",
      "- If they ask to open or see something, call navigate with the right href. If they ask where something is on the page, call highlight.",
      "- If they ask about an uploaded file, call read_attachment and work from its actual content.",
      "- Finish the job in one turn when you can: look up what you need, then answer or act. Do not ask the educator for information a tool can give you.",
      "- Keep replies organized and skimmable: short paragraphs, tight bullet lists, bold key numbers. No filler.",
    ].join("\n"),

    [
      "Editing and creating course content:",
      "- Read the current course structure with get_course before proposing edits so module and lesson indexes are correct.",
      "- Propose real, complete drafts — full lesson descriptions, not placeholders.",
      "- Use update_lesson / update_module / update_course_overview for revisions, add_module / add_lesson to build new content (for example turning an uploaded document into modules and lessons), and update_skill_challenge for skill paths.",
      "- Each write tool returns whether the change was applied immediately (auto mode) or recorded as a proposal awaiting the educator's approval (manual mode). Reflect that honestly in your reply — say 'I've queued this for your approval' when it is proposed, 'Done' when it is applied.",
      "- Break large builds into one action per module so the educator can approve them piece by piece.",
    ].join("\n"),

    [
      "Memory and personalization:",
      "- When the educator states a durable preference (tone, structure, quiz style, pacing, terminology) or an important fact about their teaching, save it with remember so future sessions honor it.",
      "- Notice recurring editing choices and teaching patterns. Once a pattern is clear, save a short, specific procedural memory instead of making the educator repeat it.",
      "- Recall relevant memories before substantial drafting and never treat a one-off request as a permanent preference unless the educator indicates it should persist.",
      "- Apply remembered preferences without being asked again.",
    ].join("\n"),

    "Pedagogy standards for any content you draft:\n" + EDUCATOR_COPILOT_PEDAGOGY,

    "Hard safety rules (these actions are not available to you at all — do not claim you did them):\n" +
      EDUCATOR_COPILOT_SAFETY,

    customInstructions?.trim()
      ? `Educator's personal instructions for you:\n${customInstructions.trim()}`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

function buildAgentConfig(
  profile: IEducatorCopilotPreference,
  user: CopilotUser,
  principalId: string
): CreateAgentParams {
  const copilotName = profile.copilotName?.trim() || DEFAULT_COPILOT_NAME;
  const model = resolveCopilotModel(profile);
  return {
    name: `${user.name || user.email || "Educator"} — ${copilotName}`,
    instructions: buildCopilotInstructions({
      user,
      copilotName,
      customInstructions: profile.customInstructions,
    }),
    persona:
      "A sharp, warm, well-organized teaching operations partner. Concrete, direct, and never generic.",
    owner: principalId,
    ownerUserId: principalId,
    workspaceId: user.identityWorkspaceId,
    metadata: {
      source: "commonlab_educator_copilot",
      commonLabUserId: user.id,
      educatorEmail: user.email || undefined,
    },
    modelProvider: model.provider as never,
    modelId: model.modelId,
    temperature: 0.3,
  };
}

function fingerprintConfig(config: unknown) {
  return createHash("sha256").update(JSON.stringify(config)).digest("hex").slice(0, 32);
}

/**
 * Get (or lazily create) the educator's copilot profile and its dedicated
 * Agent Commons agent. Pushes an agent update only when the derived config
 * changed since the last successful sync.
 */
export async function ensureEducatorCopilotProfile(
  user: CopilotUser
): Promise<CopilotProfileResult> {
  const profile = (await EducatorCopilotPreference.findOneAndUpdate(
    { userId: user.id },
    { $setOnInsert: { actionMode: "manual" } },
    { new: true, upsert: true }
  )) as IEducatorCopilotPreference;

  const principalId = user.identityUserId?.trim();
  if (!principalId) {
    return {
      profile,
      client: null,
      agentReady: false,
      connectionStatus: "account_unlinked",
      connectionMessage:
        "Link your Commons account to give this educator copilot its own agent, memory, and connected tools.",
    };
  }

  const platformAccessToken =
    user.accessToken ||
    (await platformServiceToken(
      "agent_commons",
      "agents:read agents:write agents:run"
    ));
  const client = getAgentCommonsClient(platformAccessToken, principalId);
  if (!client || !platformAccessToken) {
    return {
      profile,
      client: null,
      agentReady: false,
      connectionStatus: user.accessTokenError
        ? "reauthorization_required"
        : "service_unavailable",
      connectionMessage: user.accessTokenError
        ? "Reconnect your Commons account so the copilot can access your agent again."
        : "The Commons agent service is temporarily unavailable for this account.",
      principalId,
    };
  }

  if (profile.agentOwnerId && profile.agentOwnerId !== principalId) {
    profile.agentId = undefined;
    profile.agentConfigFingerprint = undefined;
  }

  const config = buildAgentConfig(profile, user, principalId);
  const fingerprint = fingerprintConfig(config);

  if (
    profile.agentId &&
    profile.agentOwnerId === principalId &&
    profile.agentConfigFingerprint === fingerprint
  ) {
    return {
      profile,
      client,
      agentReady: true,
      connectionStatus: "ready",
      principalId,
      platformAccessToken,
    };
  }

  try {
    if (profile.agentId) {
      try {
        await client.agents.update(profile.agentId, config);
      } catch {
        // Agent may have been deleted platform-side — recreate it.
        const created = await client.agents.create(config);
        profile.agentId = created.data.agentId;
      }
    } else {
      const created = await client.agents.create(config);
      profile.agentId = created.data.agentId;
    }
    profile.agentOwnerId = principalId;
    profile.agentConfigFingerprint = fingerprint;
    await profile.save();
    return {
      profile,
      client,
      agentReady: true,
      connectionStatus: "ready",
      principalId,
      platformAccessToken,
    };
  } catch (error) {
    console.error("[educator-copilot] agent provisioning failed:", error);
    return {
      profile,
      client,
      agentReady: false,
      connectionStatus: "provisioning_failed",
      connectionMessage:
        "Your educator agent could not be prepared just now. Please retry in a moment.",
      principalId,
      platformAccessToken,
    };
  }
}

/**
 * Ensure the copilot chat session is backed by a real Agent Commons session
 * so the model-side conversation history persists across turns.
 */
export async function ensureAgentSession({
  client,
  agentId,
  initiator,
  title,
  existingAgentSessionId,
}: {
  client: CommonsClient;
  agentId: string;
  initiator: string;
  title?: string;
  existingAgentSessionId?: string;
}): Promise<string | undefined> {
  if (existingAgentSessionId) return existingAgentSessionId;
  try {
    const created = await client.sessions.create({
      agentId,
      initiator,
      title: title?.slice(0, 120) || "Educator copilot session",
      source: "web",
    });
    return created.data.sessionId;
  } catch (error) {
    console.error("[educator-copilot] session creation failed:", error);
    return undefined;
  }
}

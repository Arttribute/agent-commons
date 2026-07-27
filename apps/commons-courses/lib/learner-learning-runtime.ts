import { getAgentCommonsClient } from "@/lib/agent-commons";
import { stripRichTextHtml } from "@/lib/rich-text";
import type {
  ContextualLearningView,
  LearnerProfileData,
  MindMapNode,
} from "@/types/learner-profile";

type LearningViewInput = {
  kind: "contextual_example" | "mind_map";
  courseTitle: string;
  contentTitle: string;
  source: string;
  profile: LearnerProfileData;
};

export async function generateLearningView(input: LearningViewInput) {
  const client = getAgentCommonsClient();
  const agentId =
    process.env.AGENT_COMMONS_LEARNER_COPILOT_ID ||
    process.env.AGENT_COMMONS_GENERAL_AGENT_ID;

  if (client && agentId) {
    try {
      const result = await client.run.once({
        agentId,
        messages: [
          { role: "system", content: buildSystemPrompt(input.kind) },
          {
            role: "user",
            content: JSON.stringify({
              task: input.kind,
              courseTitle: input.courseTitle,
              contentTitle: input.contentTitle,
              educatorSource: sourceText(input.source).slice(0, 12000),
              learnerProfile: {
                domain: input.profile.domain,
                roleOrContext: input.profile.roleOrContext,
                interests: input.profile.interests,
                goals: input.profile.goals,
                guidanceStyle: input.profile.guidanceStyle,
                customContext: input.profile.customContext,
                usageSignals: input.profile.allowUsageLearning
                  ? input.profile.usageSignals
                  : undefined,
              },
            }),
          },
        ],
      });
      const parsed = parseGeneratedResult(result);
      if (input.kind === "mind_map" && isMindMap(parsed)) return parsed;
      if (
        input.kind === "contextual_example" &&
        isContextualView(parsed)
      ) {
        return parsed;
      }
    } catch (error) {
      console.error("[learner-learning-view] generation failed:", error);
    }
  }

  return input.kind === "mind_map"
    ? buildFallbackMindMap(input)
    : buildFallbackContext(input);
}

function buildSystemPrompt(kind: LearningViewInput["kind"]) {
  const shared = [
    "You are the CommonLab learner copilot.",
    "Your role is to help a learner understand educator-authored material without changing its claims, scope, intent, warnings, or learning objective.",
    "Treat the educatorSource as canonical. Add a clearly separate learning aid; never rewrite or replace the source.",
    "Do not invent facts, requirements, outcomes, or domain-specific claims. Do not introduce sensitive assumptions about the learner.",
    "Use only the explicitly supplied learner profile. Avoid stereotypes.",
    "Return valid JSON only, with no markdown fences.",
  ];

  if (kind === "mind_map") {
    return [
      ...shared,
      'Return one tree with this shape: {"id":"root","label":"...","detail":"...","children":[{"id":"...","label":"...","detail":"...","children":[]}]}',
      "Use 3–5 main branches and no more than 3 children per branch. Keep labels short. Map relationships present in the source only.",
    ].join("\n");
  }

  return [
    ...shared,
    'Return: {"title":"In your context","bridge":"...","example":"...","connection":"...","tryIt":"...","fidelityNote":"..."}',
    "The example may change the setting and actors, but must preserve the mechanism taught in the source.",
    "The connection must explicitly map the example back to the source idea.",
    "The tryIt prompt should invite retrieval or application; it must not give away graded work.",
    'Use the fidelityNote: "This example adds context; the educator’s original meaning remains the source of truth."',
  ].join("\n");
}

function parseGeneratedResult(result: unknown): unknown {
  if (!result || typeof result !== "object") return null;
  const record = result as Record<string, unknown>;
  const candidates = [
    record.content,
    record.text,
    record.output,
    record.response,
    (record.data as Record<string, unknown> | undefined)?.content,
    (record.data as Record<string, unknown> | undefined)?.text,
    (record.data as Record<string, unknown> | undefined)?.output,
  ];

  for (const candidate of candidates) {
    if (typeof candidate !== "string") continue;
    try {
      return JSON.parse(
        candidate
          .trim()
          .replace(/^```(?:json)?\s*/i, "")
          .replace(/\s*```$/, ""),
      );
    } catch {
      continue;
    }
  }
  return null;
}

function isContextualView(value: unknown): value is ContextualLearningView {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return ["title", "bridge", "example", "connection", "tryIt", "fidelityNote"].every(
    (key) => typeof record[key] === "string" && Boolean(record[key]),
  );
}

function isMindMap(value: unknown): value is MindMapNode {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.id === "string" &&
    typeof record.label === "string" &&
    Array.isArray(record.children)
  );
}

function buildFallbackContext(input: LearningViewInput): ContextualLearningView {
  const context =
    input.profile.roleOrContext ||
    domainLabels[input.profile.domain || ""] ||
    "your day-to-day work";
  const topic = input.contentTitle || input.courseTitle;
  const source = sourceText(input.source);
  const centralIdea = firstUsefulSentence(source) || `the central idea in ${topic}`;
  const domainExample = fallbackExamples[input.profile.domain || ""]?.(
    centralIdea,
  );

  return {
    title: `See ${topic} in ${context}`,
    bridge: `Here is a concrete way to connect this lesson to ${context}.`,
    example:
      domainExample ||
      `Imagine you are using this idea during a real task in ${context}. Start with the same capability described in the lesson, then decide what it may access and what limits should apply before you use it.`,
    connection: `The setting is different, but the mechanism is unchanged: ${centralIdea}`,
    tryIt: `Name one task from ${context} where this idea would help. What access would be necessary, and what would you deliberately keep out of scope?`,
    fidelityNote:
      "This example adds context; the educator’s original meaning remains the source of truth.",
  };
}

function buildFallbackMindMap(input: LearningViewInput): MindMapNode {
  const source = sourceText(input.source);
  const sentences = source
    .split(/(?<=[.!?])\s+|\n+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 28);
  const branches = sentences.slice(0, 5).map((sentence, index) => {
    const [lead, ...rest] = sentence.split(/[:;—]/);
    return {
      id: `idea-${index + 1}`,
      label: shorten(lead, 48),
      detail: shorten(rest.join(" ") || sentence, 120),
      children: [],
    };
  });

  if (branches.length < 3) {
    branches.push(
      {
        id: "idea-purpose",
        label: "Purpose",
        detail: `What ${input.contentTitle} helps you understand or do.`,
        children: [],
      },
      {
        id: "idea-practice",
        label: "In practice",
        detail: "Apply the idea while keeping the stated boundaries in view.",
        children: [],
      },
    );
  }

  return {
    id: "root",
    label: input.contentTitle,
    detail: `A map of the educator’s key ideas in ${input.courseTitle}.`,
    children: branches.slice(0, 5),
  };
}

function firstUsefulSentence(value: string) {
  return value
    .split(/(?<=[.!?])\s+|\n+/)
    .map((sentence) => sentence.trim())
    .find((sentence) => sentence.length >= 35);
}

function shorten(value: string, max: number) {
  const clean = value.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1).trim()}…`;
}

function sourceText(value: string) {
  return stripRichTextHtml(value)
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/(^|\s)[#>*_`~-]+(?=\S)/g, "$1")
    .replace(/[*_`~]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const domainLabels: Record<string, string> = {
  marketing: "marketing work",
  healthcare: "healthcare work",
  education: "teaching and learning",
  technology: "technology work",
  finance: "financial services",
  creative: "creative work",
  operations: "operations",
};

const fallbackExamples: Record<
  string,
  ((centralIdea: string) => string) | undefined
> = {
  marketing: (idea) =>
    `A campaign agent could read an approved brief, check the content calendar, and prepare channel-specific suggestions. It should not gain access to every customer record or publish automatically unless those permissions are intentionally granted. This puts the lesson’s idea into a marketing workflow: ${idea}`,
  healthcare: (idea) =>
    `A healthcare operations agent could check an approved staff rota before suggesting training times. It should not access clinical records because that information is unnecessary for the task. This keeps the example administrative and preserves the lesson’s mechanism: ${idea}`,
  education: (idea) =>
    `A teaching assistant agent could read the current lesson plan and approved class calendar before proposing a revision session. Its access can stay limited to those resources rather than all learner records. The same lesson idea still applies: ${idea}`,
  technology: (idea) =>
    `An engineering support agent could read a selected repository and issue queue to summarize a bug, while deployment credentials remain out of scope. The concrete setting changes, but the taught mechanism stays the same: ${idea}`,
  finance: (idea) =>
    `A finance operations agent could read an approved reporting sheet and calendar to prepare a review checklist, without access to unrelated customer accounts. The example preserves the source idea: ${idea}`,
  creative: (idea) =>
    `A creative production agent could read an approved brief and asset folder to prepare concepts, while publishing and client archives remain outside its scope. The example preserves the source idea: ${idea}`,
  operations: (idea) =>
    `An operations agent could check an approved schedule and inventory view before proposing the next action, without gaining access to unrelated systems. The example preserves the source idea: ${idea}`,
};

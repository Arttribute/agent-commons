import { z } from "zod";
import type {
  ExperienceDocument,
  ExperienceScene,
  ExperienceSceneType,
} from "@/types/experience";

const color = z.string().regex(/^#[0-9a-f]{6}$/i);
const optionalUrl = z.string().trim().max(2048).optional().or(z.literal(""));

const choiceSchema = z.object({
  id: z.string().trim().min(1).max(80),
  label: z.string().trim().min(1).max(240),
  description: z.string().trim().max(500).optional(),
  nextSceneId: z.string().trim().max(80).optional(),
});

const optionSchema = z.object({
  id: z.string().trim().min(1).max(80),
  label: z.string().trim().min(1).max(500),
  correct: z.boolean().optional(),
});

const hotspotSchema = z.object({
  id: z.string().trim().min(1).max(80),
  label: z.string().trim().min(1).max(240),
  x: z.number().min(0).max(100),
  y: z.number().min(0).max(100),
  radius: z.number().min(2).max(30),
  correct: z.boolean().optional(),
});

const activityItemSchema = z.object({
  id: z.string().trim().min(1).max(80),
  label: z.string().trim().min(1).max(240),
  description: z.string().trim().max(800).optional(),
  imageUrl: optionalUrl,
  x: z.number().min(0).max(100).optional(),
  y: z.number().min(0).max(100).optional(),
  targetId: z.string().trim().max(80).optional(),
});

const dropZoneSchema = z.object({
  id: z.string().trim().min(1).max(80),
  label: z.string().trim().min(1).max(240),
  description: z.string().trim().max(800).optional(),
});

export const experienceSceneTypes = [
  "dialogue",
  "explainer",
  "choice",
  "quiz",
  "hotspot",
  "collect",
  "sort",
  "match",
  "sequence",
  "completion",
] as const satisfies readonly ExperienceSceneType[];

export const experienceSceneSchema = z.object({
  id: z.string().trim().min(1).max(80),
  type: z.enum(experienceSceneTypes),
  title: z.string().trim().min(1).max(160),
  eyebrow: z.string().trim().max(80).optional(),
  body: z.string().trim().max(6000),
  characterId: z.string().trim().max(80).optional(),
  backgroundUrl: optionalUrl,
  mediaUrl: optionalUrl,
  mediaAlt: z.string().trim().max(500).optional(),
  nextSceneId: z.string().trim().max(80).optional(),
  choices: z.array(choiceSchema).max(8).optional(),
  options: z.array(optionSchema).max(10).optional(),
  hotspots: z.array(hotspotSchema).max(12).optional(),
  items: z.array(activityItemSchema).max(20).optional(),
  zones: z.array(dropZoneSchema).max(10).optional(),
  prompt: z.string().trim().max(1000).optional(),
  successFeedback: z.string().trim().max(1000).optional(),
  retryFeedback: z.string().trim().max(1000).optional(),
  points: z.number().int().min(0).max(1000).optional(),
});

export const experienceDocumentSchema = z.object({
  schemaVersion: z.literal(1),
  title: z.string().trim().min(1).max(160),
  subtitle: z.string().trim().max(240),
  description: z.string().trim().max(1200),
  estimatedMinutes: z.number().int().min(1).max(240),
  objectives: z.array(z.string().trim().min(1).max(500)).min(1).max(12),
  startSceneId: z.string().trim().min(1).max(80),
  theme: z.object({
    name: z.string().trim().min(1).max(80),
    background: color,
    surface: color,
    accent: color,
    accentSoft: color,
    text: color,
    atmosphere: z.enum(["aurora", "dunes", "forest", "studio"]),
  }),
  characters: z
    .array(
      z.object({
        id: z.string().trim().min(1).max(80),
        name: z.string().trim().min(1).max(100),
        role: z.string().trim().min(1).max(120),
        description: z.string().trim().max(800).optional(),
        imageUrl: optionalUrl,
        accent: color,
      }),
    )
    .max(16),
  scenes: z.array(experienceSceneSchema).min(1).max(80),
});

export function normalizeExperienceDocument(
  input: unknown,
  options: { publish?: boolean } = {},
): ExperienceDocument {
  const parsed = experienceDocumentSchema.parse(input);
  const sceneIds = new Set(parsed.scenes.map((scene) => scene.id));
  const characterIds = new Set(parsed.characters.map((character) => character.id));

  if (sceneIds.size !== parsed.scenes.length) {
    throw new Error("Every scene needs a unique ID.");
  }
  if (!sceneIds.has(parsed.startSceneId)) {
    throw new Error("The starting scene does not exist.");
  }
  if (characterIds.size !== parsed.characters.length) {
    throw new Error("Every character needs a unique ID.");
  }

  for (const scene of parsed.scenes) {
    if (scene.characterId && !characterIds.has(scene.characterId)) {
      throw new Error(`Scene "${scene.title}" references a missing character.`);
    }
    for (const target of [
      scene.nextSceneId,
      ...(scene.choices || []).map((choice) => choice.nextSceneId),
    ]) {
      if (target && !sceneIds.has(target)) {
        throw new Error(`Scene "${scene.title}" links to a missing scene.`);
      }
    }
    if (
      options.publish &&
      scene.type === "choice" &&
      (scene.choices?.length || 0) < 2
    ) {
      throw new Error(`Choice scene "${scene.title}" needs at least two choices.`);
    }
    if (
      options.publish &&
      scene.type === "quiz" &&
      ((scene.options?.length || 0) < 2 ||
        !scene.options?.some((option) => option.correct))
    ) {
      throw new Error(`Quiz scene "${scene.title}" needs options and a correct answer.`);
    }
    if (
      options.publish &&
      scene.type === "hotspot" &&
      (!scene.mediaUrl || !scene.hotspots?.some((hotspot) => hotspot.correct))
    ) {
      throw new Error(
        `Hotspot scene "${scene.title}" needs an image and a correct target.`,
      );
    }
    if (
      options.publish &&
      scene.type === "collect" &&
      (!scene.mediaUrl ||
        (scene.items?.length || 0) < 1 ||
        scene.items?.some(
          (item) => item.x === undefined || item.y === undefined,
        ))
    ) {
      throw new Error(
        `Collect scene "${scene.title}" needs an image and positioned items.`,
      );
    }
    if (
      options.publish &&
      (scene.type === "sort" || scene.type === "match")
    ) {
      const zoneIds = new Set((scene.zones || []).map((zone) => zone.id));
      if ((scene.zones?.length || 0) < 2 || (scene.items?.length || 0) < 2) {
        throw new Error(
          `${sceneTypeLabel(scene.type)} "${scene.title}" needs at least two items and two destinations.`,
        );
      }
      if (scene.items?.some((item) => !item.targetId || !zoneIds.has(item.targetId))) {
        throw new Error(
          `Every item in "${scene.title}" needs a valid destination.`,
        );
      }
    }
    if (
      options.publish &&
      scene.type === "sequence" &&
      (scene.items?.length || 0) < 2
    ) {
      throw new Error(
        `Sequence scene "${scene.title}" needs at least two steps.`,
      );
    }
    if (options.publish && scene.items) {
      const itemIds = new Set(scene.items.map((item) => item.id));
      if (itemIds.size !== scene.items.length) {
        throw new Error(`Every item in "${scene.title}" needs a unique ID.`);
      }
    }
    if (options.publish && scene.zones) {
      const zoneIds = new Set(scene.zones.map((zone) => zone.id));
      if (zoneIds.size !== scene.zones.length) {
        throw new Error(
          `Every destination in "${scene.title}" needs a unique ID.`,
        );
      }
    }
    if (options.publish && !scene.body.trim()) {
      throw new Error(`Scene "${scene.title}" needs learner-facing content.`);
    }
    if (
      options.publish &&
      scene.type !== "completion" &&
      scene.type !== "choice" &&
      !scene.nextSceneId
    ) {
      throw new Error(`Scene "${scene.title}" needs a next scene.`);
    }
    if (
      options.publish &&
      scene.type === "choice" &&
      scene.choices?.some((choice) => !choice.nextSceneId)
    ) {
      throw new Error(`Every choice in "${scene.title}" needs a destination.`);
    }
  }

  if (options.publish) validatePublishedFlow(parsed);
  return parsed as ExperienceDocument;
}

function validatePublishedFlow(
  document: z.infer<typeof experienceDocumentSchema>,
) {
  if (!document.scenes.some((scene) => scene.type === "completion")) {
    throw new Error("Add a completion scene before publishing.");
  }
  const byId = new Map(document.scenes.map((scene) => [scene.id, scene]));
  const visiting = new Set<string>();
  const visited = new Set<string>();

  function walk(sceneId: string) {
    if (visiting.has(sceneId)) {
      throw new Error(
        "Published experiences need a clear, loop-free path to completion.",
      );
    }
    if (visited.has(sceneId)) return;
    visiting.add(sceneId);
    const scene = byId.get(sceneId);
    if (!scene) return;
    const targets =
      scene.type === "choice"
        ? (scene.choices || []).flatMap((choice) =>
            choice.nextSceneId ? [choice.nextSceneId] : [],
          )
        : scene.nextSceneId
          ? [scene.nextSceneId]
          : [];
    if (scene.type !== "completion" && !targets.length) {
      throw new Error(`Scene "${scene.title}" does not reach a completion.`);
    }
    for (const target of targets) walk(target);
    visiting.delete(sceneId);
    visited.add(sceneId);
  }

  walk(document.startSceneId);
  const unreachable = document.scenes.filter((scene) => !visited.has(scene.id));
  if (unreachable.length) {
    throw new Error(
      `Connect or remove unreachable scene "${unreachable[0].title}" before publishing.`,
    );
  }
}

export function createStarterExperience(title = "New immersive experience"): ExperienceDocument {
  return {
    schemaVersion: 1,
    title,
    subtitle: "A guided learning quest",
    description:
      "Guide learners through a concise story, a meaningful decision, and a knowledge check.",
    estimatedMinutes: 8,
    objectives: ["Apply the lesson concept in a realistic situation."],
    startSceneId: "welcome",
    theme: {
      name: "Midnight aurora",
      background: "#091421",
      surface: "#132536",
      accent: "#71E0E7",
      accentSoft: "#DDF8FA",
      text: "#F8FAFC",
      atmosphere: "aurora",
    },
    characters: [
      {
        id: "guide",
        name: "Nova",
        role: "Learning guide",
        description: "A warm, precise guide who keeps the mission moving.",
        accent: "#B8F56D",
      },
    ],
    scenes: [
      {
        id: "welcome",
        type: "dialogue",
        eyebrow: "Mission briefing",
        title: "A new challenge has arrived",
        body:
          "A community needs your help. We will examine the situation, make one important decision, and test what you have learned.",
        characterId: "guide",
        nextSceneId: "concept",
      },
      {
        id: "concept",
        type: "explainer",
        eyebrow: "Key idea",
        title: "Start with the evidence",
        body:
          "Strong decisions begin by separating what we know, what we assume, and what we still need to discover.",
        characterId: "guide",
        nextSceneId: "decision",
      },
      {
        id: "decision",
        type: "choice",
        eyebrow: "Your move",
        title: "What should we do first?",
        body: "Choose the approach that gives us the clearest next step.",
        characterId: "guide",
        choices: [
          {
            id: "inspect",
            label: "Inspect the available evidence",
            description: "Understand the situation before acting.",
            nextSceneId: "check",
          },
          {
            id: "guess",
            label: "Make a quick assumption",
            description: "Move immediately with limited information.",
            nextSceneId: "check",
          },
        ],
      },
      {
        id: "check",
        type: "quiz",
        eyebrow: "Knowledge check",
        title: "Which approach is most reliable?",
        body: "Select the response that best reflects the lesson.",
        prompt: "Before making a consequential decision, we should…",
        options: [
          { id: "a", label: "Review relevant evidence and identify gaps.", correct: true },
          { id: "b", label: "Choose the fastest answer and justify it later." },
          { id: "c", label: "Avoid making the decision altogether." },
        ],
        successFeedback: "Exactly. Evidence makes the next action defensible.",
        retryFeedback: "Not quite. Look for the response that reduces unsupported assumptions.",
        points: 100,
        nextSceneId: "complete",
      },
      {
        id: "complete",
        type: "completion",
        eyebrow: "Quest complete",
        title: "You found the signal",
        body:
          "You used evidence to move from uncertainty to a clear, supportable decision.",
        characterId: "guide",
      },
    ],
  };
}

export function createScene(type: ExperienceSceneType, index: number): ExperienceScene {
  const id = `${type}-${crypto.randomUUID().slice(0, 8)}`;
  const common = {
    id,
    type,
    eyebrow: `Scene ${index}`,
    title: sceneTypeLabel(type),
    body: "",
  } satisfies ExperienceScene;
  if (type === "choice") {
    return {
      ...common,
      body: "Invite the learner to make a meaningful decision.",
      choices: [
        { id: crypto.randomUUID(), label: "First choice" },
        { id: crypto.randomUUID(), label: "Second choice" },
      ],
    };
  }
  if (type === "quiz") {
    return {
      ...common,
      body: "Check the learner’s understanding.",
      prompt: "What is the best answer?",
      options: [
        { id: crypto.randomUUID(), label: "Correct answer", correct: true },
        { id: crypto.randomUUID(), label: "Plausible distractor" },
      ],
      successFeedback: "Correct.",
      retryFeedback: "Try again.",
      points: 100,
    };
  }
  if (type === "hotspot") {
    return {
      ...common,
      body: "Ask the learner to identify the important area.",
      prompt: "Select the correct region.",
      mediaUrl: "",
      mediaAlt: "",
      hotspots: [
        {
          id: crypto.randomUUID(),
          label: "Correct region",
          x: 50,
          y: 50,
          radius: 10,
          correct: true,
        },
      ],
      successFeedback: "You found it.",
      retryFeedback: "Look more closely and try again.",
      points: 100,
    };
  }
  if (type === "collect") {
    return {
      ...common,
      body: "Search the scene, discover each clue, and move it into your field kit.",
      prompt: "Find and collect the evidence.",
      mediaUrl: "",
      mediaAlt: "",
      items: [
        {
          id: crypto.randomUUID(),
          label: "Evidence sample",
          description: "An important clue from the scene.",
          x: 50,
          y: 50,
        },
      ],
      successFeedback: "You collected every required clue.",
      retryFeedback: "Keep searching the scene.",
      points: 150,
    };
  }
  if (type === "sort" || type === "match") {
    const firstZone = crypto.randomUUID();
    const secondZone = crypto.randomUUID();
    return {
      ...common,
      body:
        type === "match"
          ? "Match each concept to its corresponding example."
          : "Sort each item into the correct destination.",
      prompt:
        type === "match"
          ? "Build the correct matches."
          : "Drag each card to the right category.",
      zones: [
        { id: firstZone, label: type === "match" ? "Concept A" : "Category A" },
        { id: secondZone, label: type === "match" ? "Concept B" : "Category B" },
      ],
      items: [
        {
          id: crypto.randomUUID(),
          label: "First item",
          targetId: firstZone,
        },
        {
          id: crypto.randomUUID(),
          label: "Second item",
          targetId: secondZone,
        },
      ],
      successFeedback: "Everything is in the right place.",
      retryFeedback: "Some items are misplaced. Review the relationships.",
      points: 150,
    };
  }
  if (type === "sequence") {
    return {
      ...common,
      body: "Arrange the steps into the order they should happen.",
      prompt: "Build the correct sequence.",
      items: [
        { id: crypto.randomUUID(), label: "First step" },
        { id: crypto.randomUUID(), label: "Second step" },
        { id: crypto.randomUUID(), label: "Third step" },
      ],
      successFeedback: "That sequence works.",
      retryFeedback: "The order is not quite right yet.",
      points: 150,
    };
  }
  if (type === "completion") {
    return { ...common, body: "Summarize what the learner accomplished." };
  }
  return {
    ...common,
    body:
      type === "dialogue"
        ? "Write the character’s dialogue here."
        : "Explain one important idea with a clear example.",
  };
}

export function sceneTypeLabel(type: ExperienceSceneType) {
  return {
    dialogue: "Character dialogue",
    explainer: "Visual explainer",
    choice: "Learner choice",
    quiz: "Knowledge check",
    hotspot: "Inspect an image",
    collect: "Find and collect",
    sort: "Sort into groups",
    match: "Match pairs",
    sequence: "Arrange a sequence",
    completion: "Completion",
  }[type];
}

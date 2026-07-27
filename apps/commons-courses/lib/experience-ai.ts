import "server-only";

import { CommonsError, type CommonsClient } from "@agent-commons/sdk";
import type { ICourse } from "@/models/Course";
import { uploadCourseMediaToS3 } from "@/lib/media-storage";
import type { ExperienceDocument } from "@/types/experience";

export const EXPERIENCE_COPILOT_WORLD_GUIDE = `
EXPERIENCE WORLD AUTHORING CONTRACT

Treat the experience as four connected systems:
1. WORLD GRAPH — world.locations is the semantic geography. Location IDs are stable keys. connections describe visible travel relationships; startLocationId is the learner's entry point. A scene locationId and stage.locationId place that scene in the world. A world-map choice can move the learner to a location by setting both locationId and nextSceneId.
2. ASSET LIBRARY — assets is the only registry for uploaded or generated image, video, audio, and model3d files. Never invent an asset ID or URL. Preserve existing asset records and URLs unless the educator explicitly asks to remove them. Locations can reference background, ambient-audio, and 3D-environment assets.
3. CINEMATIC STAGE — each scene stage is a declarative composition, not code. Layers are ordered 2D image/video/color/gradient/particle planes with depth, parallax, blend, fit, and animation. Actors place existing characters. The camera controls framing and transitions. Effects control weather, grain, and vignette. The optional three block contains safe primitives and existing GLB model assets. Use hybrid mode to combine 2D art direction with interactive 3D objects.
4. STORY AND INTERACTION GRAPH — startSceneId begins the mission. nextSceneId and choice destinations form the route. Every reachable route must eventually reach a completion scene. Supported interactions are choice, quiz, hotspot, collect, sort, match, sequence, world-map, and evidence, alongside dialogue/explainer/completion. interactionLayout chooses overlay, panel, or a diegetic in-world device.

Manipulation rules:
- Interpret edit verbs literally: add, remove, rename, connect, move, restyle, reframe, populate, reorder, branch, simplify, or replace only the requested parts.
- Preserve stable IDs and untouched data during an edit. Create short unique kebab-case IDs only for genuinely new entities.
- When moving or deleting something, update every reference to it so the document remains valid.
- Do not silently discard educator-authored assets, scenes, locations, characters, learning objectives, or factual content.
- For requests about a selected scene/location/character/asset, edit that focused entity unless the educator clearly asks for a broader transformation.
- A location is reusable world state; a stage is the scene-specific visual arrangement at that location.
- Actor placements and storyboard shots can change pose, framing, speaker, and camera without creating duplicate characters.
- For requested art that does not yet exist, preserve the request in the world art direction and compose an honest color/gradient/particle placeholder. Do not fabricate media. The studio's dedicated asset generator can create and register the final artwork.
- Keep curriculum claims grounded in COURSE CONTEXT. Improve presentation and interaction without changing the taught facts.
- Return the complete revised document, including every untouched entity, because the server validates the proposal atomically.
`.trim();

export type ExperienceCopilotImpact = {
  scenes: ExperienceCopilotEntityImpact;
  locations: ExperienceCopilotEntityImpact;
  characters: ExperienceCopilotEntityImpact;
  assets: ExperienceCopilotEntityImpact;
};

type ExperienceCopilotEntityImpact = {
  added: string[];
  removed: string[];
  modified: string[];
};

export function describeExperienceCopilotImpact(
  before: ExperienceDocument,
  after: ExperienceDocument,
): ExperienceCopilotImpact {
  return {
    scenes: changedEntities(before.scenes, after.scenes),
    locations: changedEntities(
      before.world.locations,
      after.world.locations,
    ),
    characters: changedEntities(before.characters, after.characters),
    assets: changedEntities(before.assets, after.assets),
  };
}

export async function buildExperienceCourseContext({
  course,
  client,
  agentId,
  query,
}: {
  course: ICourse;
  client: CommonsClient;
  agentId: string;
  query: string;
}) {
  const lines = [
    "COURSE CONTEXT",
    `Title: ${course.title}`,
    course.tagline ? `Tagline: ${course.tagline}` : "",
    `Level: ${course.level}`,
    `Format: ${course.courseType}`,
    course.duration ? `Duration: ${course.duration}` : "",
    course.tags?.length ? `Topics: ${course.tags.join(", ")}` : "",
    course.description ? `Description: ${course.description}` : "",
    course.longDescription
      ? `Course narrative: ${truncate(course.longDescription, 5000)}`
      : "",
    "",
    `Curriculum (${course.modules?.length || 0} modules):`,
  ].filter(Boolean);

  for (const [moduleIndex, module] of (course.modules || []).entries()) {
    lines.push(
      `${moduleIndex + 1}. ${module.title}${
        module.description ? ` — ${truncate(module.description, 1000)}` : ""
      }`,
    );
    for (const [lessonIndex, lesson] of (module.lessons || []).entries()) {
      lines.push(
        `   ${moduleIndex + 1}.${lessonIndex + 1} ${lesson.title}${
          lesson.duration ? ` (${lesson.duration})` : ""
        }${lesson.description ? ` — ${truncate(lesson.description, 1600)}` : ""}${
          lesson.assetUrl ? ` [source material: ${lesson.assetUrl}]` : ""
        }`,
      );
    }
    if (module.assignment) {
      lines.push(`   Assignment: ${truncate(module.assignment, 1200)}`);
    }
  }

  try {
    const memories = await client.memory.retrieve(
      agentId,
      query.trim() || `teaching preferences for ${course.title}`,
      12,
    );
    if (memories.data?.length) {
      lines.push("", "EDUCATOR PREFERENCES AND MEMORY");
      for (const memory of memories.data) {
        lines.push(`- ${truncate(memory.content, 700)}`);
      }
    }
  } catch {
    // Memory makes the result more personal, but its absence must not block
    // an otherwise valid world or storyboard draft.
  }

  return truncate(lines.join("\n"), 32_000);
}

export async function generateAndPersistExperienceImage({
  client,
  agentId,
  prompt,
  name,
  keyPrefix,
  size,
  quality = "high",
  operationId,
}: {
  client: CommonsClient;
  agentId: string;
  prompt: string;
  name: string;
  keyPrefix: string;
  size: "1024x1024" | "1024x1536" | "1536x1024" | "auto";
  quality?: "low" | "medium" | "high" | "auto";
  operationId: string;
}) {
  const generated = await client.agents.generateImage(agentId, {
    prompt,
    n: 1,
    size,
    quality,
    operationId,
  });
  const artifact = generated.data[0];
  if (!artifact?.fileId) {
    throw new Error("The image service completed without an artwork file.");
  }

  const content = await client.files.content(artifact.fileId, {
    agentId,
    includeImageUrls: true,
    includeDownloadUrl: true,
    maxChars: 1,
  });
  const sourceUrl =
    content.data.downloadUrl || content.data.imageUrls?.[0] || artifact.url;
  if (!sourceUrl) {
    throw new Error("The generated artwork has no downloadable source.");
  }

  const source = await fetch(sourceUrl);
  if (!source.ok) {
    throw new Error(`Generated artwork download failed (${source.status}).`);
  }
  const mimeType = source.headers.get("content-type") || "image/png";
  if (!mimeType.startsWith("image/")) {
    throw new Error("The generated artifact is not an image.");
  }
  const data = Buffer.from(await source.arrayBuffer());
  if (!data.length || data.length > 20 * 1024 * 1024) {
    throw new Error("The generated artwork has an unsupported file size.");
  }
  const filename = `${safeName(name)}.${extensionFor(mimeType)}`;
  const url = await uploadCourseMediaToS3({
    file: { name: filename, type: mimeType },
    data,
    keyPrefix,
  });
  return {
    url,
    sourceFileId: artifact.fileId,
    model: artifact.model,
    prompt: artifact.prompt || prompt,
  };
}

export function experienceAiFailure(
  error: unknown,
  fallback: string,
): {
  error: string;
  code: string;
  retryable: boolean;
  status: number;
} {
  if (error instanceof CommonsError) {
    if (error.status === 401 || error.status === 403) {
      return {
        error:
          "Your Commons connection needs attention. Reconnect the educator account, then try again.",
        code: "commons_reauthorization_required",
        retryable: false,
        status: 409,
      };
    }
    if (error.status === 402) {
      return {
        error:
          "Image generation credits are unavailable for this account. Add credits in Agent Commons and try again.",
        code: "commons_credits_required",
        retryable: false,
        status: 402,
      };
    }
    if (error.status === 429 || error.status >= 500) {
      return {
        error: "The generation service is busy. Your draft is safe; retry in a moment.",
        code: "commons_temporarily_unavailable",
        retryable: true,
        status: 503,
      };
    }
    return {
      error: error.message || fallback,
      code: "commons_request_rejected",
      retryable: false,
      status: 422,
    };
  }
  return {
    error: error instanceof Error && error.message ? error.message : fallback,
    code: "generation_failed",
    retryable: true,
    status: 502,
  };
}

function truncate(value: string, max: number) {
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

function safeName(value: string) {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 100) || "generated-artwork"
  );
}

function extensionFor(mimeType: string) {
  if (mimeType.includes("webp")) return "webp";
  if (mimeType.includes("jpeg")) return "jpg";
  return "png";
}

function changedEntities<T extends { id: string }>(
  before: T[],
  after: T[],
): ExperienceCopilotEntityImpact {
  const beforeById = new Map(before.map((item) => [item.id, item]));
  const afterById = new Map(after.map((item) => [item.id, item]));
  return {
    added: after
      .filter((item) => !beforeById.has(item.id))
      .map((item) => item.id),
    removed: before
      .filter((item) => !afterById.has(item.id))
      .map((item) => item.id),
    modified: after
      .filter((item) => {
        const previous = beforeById.get(item.id);
        return previous && JSON.stringify(previous) !== JSON.stringify(item);
      })
      .map((item) => item.id),
  };
}

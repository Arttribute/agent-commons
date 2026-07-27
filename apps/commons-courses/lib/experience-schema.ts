import { z } from "zod";
import type {
  ExperienceDocument,
  ExperienceScene,
  ExperienceSceneType,
  ExperienceStage,
} from "@/types/experience";

const color = z.string().regex(/^#[0-9a-f]{6}$/i);
const optionalUrl = z.string().trim().max(2048).optional().or(z.literal(""));
const id = z.string().trim().min(1).max(80);

const choiceSchema = z.object({
  id,
  label: z.string().trim().min(1).max(240),
  description: z.string().trim().max(500).optional(),
  nextSceneId: id.optional(),
  locationId: id.optional(),
});

const optionSchema = z.object({
  id,
  label: z.string().trim().min(1).max(500),
  correct: z.boolean().optional(),
});

const hotspotSchema = z.object({
  id,
  label: z.string().trim().min(1).max(240),
  x: z.number().min(0).max(100),
  y: z.number().min(0).max(100),
  radius: z.number().min(2).max(30),
  correct: z.boolean().optional(),
});

const activityItemSchema = z.object({
  id,
  label: z.string().trim().min(1).max(240),
  description: z.string().trim().max(800).optional(),
  imageUrl: optionalUrl,
  assetId: id.optional(),
  x: z.number().min(0).max(100).optional(),
  y: z.number().min(0).max(100).optional(),
  targetId: id.optional(),
});

const dropZoneSchema = z.object({
  id,
  label: z.string().trim().min(1).max(240),
  description: z.string().trim().max(800).optional(),
});

const evidenceSchema = z.object({
  id,
  title: z.string().trim().min(1).max(200),
  summary: z.string().trim().min(1).max(1200),
  details: z.string().trim().max(4000).optional(),
  imageUrl: optionalUrl,
  assetId: id.optional(),
  correctDecision: z.enum(["approve", "reject"]),
  explanation: z.string().trim().max(1200).optional(),
});

const cameraSchema = z.object({
  x: z.number().min(-200).max(200),
  y: z.number().min(-200).max(200),
  zoom: z.number().min(0.25).max(4),
  rotation: z.number().min(-180).max(180),
  transition: z.enum(["cut", "fade", "pan", "zoom", "portal"]),
});

const actorSchema = z.object({
  characterId: id,
  x: z.number().min(-25).max(125),
  y: z.number().min(-25).max(125),
  scale: z.number().min(0.1).max(4),
  depth: z.number().int().min(-100).max(100),
  flip: z.boolean().optional(),
  pose: z.string().trim().max(120).optional(),
  entrance: z
    .enum(["none", "fade", "slide-left", "slide-right", "rise"])
    .optional(),
});

const stageLayerSchema = z.object({
  id,
  name: z.string().trim().min(1).max(120),
  kind: z.enum(["image", "video", "color", "gradient", "particles"]),
  assetId: id.optional(),
  url: optionalUrl,
  color: color.optional(),
  x: z.number().min(-200).max(200),
  y: z.number().min(-200).max(200),
  width: z.number().min(1).max(500),
  height: z.number().min(1).max(500),
  depth: z.number().int().min(-100).max(100),
  opacity: z.number().min(0).max(1),
  parallax: z.number().min(-2).max(2),
  fit: z.enum(["cover", "contain", "fill"]),
  blendMode: z.enum([
    "normal",
    "multiply",
    "screen",
    "overlay",
    "soft-light",
  ]),
  animation: z.enum(["none", "drift", "float", "pulse", "ken-burns"]),
});

const node3dSchema = z.object({
  id,
  name: z.string().trim().min(1).max(120),
  kind: z.enum(["model", "box", "sphere", "cylinder", "cone", "plane"]),
  assetId: id.optional(),
  position: z.tuple([z.number(), z.number(), z.number()]),
  rotation: z.tuple([z.number(), z.number(), z.number()]),
  scale: z.tuple([
    z.number().min(0.01).max(100),
    z.number().min(0.01).max(100),
    z.number().min(0.01).max(100),
  ]),
  color: color.optional(),
  metallic: z.number().min(0).max(1).optional(),
  roughness: z.number().min(0).max(1).optional(),
  animation: z.enum(["none", "rotate", "float"]).optional(),
});

export const experienceStageSchema = z.object({
  mode: z.enum(["2d", "3d", "hybrid"]),
  locationId: id.optional(),
  camera: cameraSchema,
  layers: z.array(stageLayerSchema).max(32),
  actors: z.array(actorSchema).max(16),
  three: z
    .object({
      background: color,
      environmentAssetId: id.optional(),
      cameraPosition: z.tuple([z.number(), z.number(), z.number()]),
      cameraTarget: z.tuple([z.number(), z.number(), z.number()]),
      nodes: z.array(node3dSchema).max(80),
    })
    .optional(),
  effects: z.object({
    vignette: z.number().min(0).max(1),
    grain: z.number().min(0).max(1),
    weather: z.enum(["none", "rain", "snow", "dust", "fireflies"]),
    intensity: z.number().min(0).max(1),
  }),
});

const shotSchema = z.object({
  id,
  title: z.string().trim().max(200).optional(),
  body: z.string().trim().min(1).max(4000),
  speakerCharacterId: id.optional(),
  camera: cameraSchema.partial().optional(),
  actors: z.array(actorSchema).max(16).optional(),
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
  "world-map",
  "evidence",
  "completion",
] as const satisfies readonly ExperienceSceneType[];

export const experienceSceneSchema = z.object({
  id,
  type: z.enum(experienceSceneTypes),
  title: z.string().trim().min(1).max(160),
  eyebrow: z.string().trim().max(80).optional(),
  body: z.string().trim().max(6000),
  characterId: id.optional(),
  locationId: id.optional(),
  backgroundUrl: optionalUrl,
  mediaUrl: optionalUrl,
  mediaAlt: z.string().trim().max(500).optional(),
  nextSceneId: id.optional(),
  choices: z.array(choiceSchema).max(12).optional(),
  options: z.array(optionSchema).max(12).optional(),
  hotspots: z.array(hotspotSchema).max(24).optional(),
  items: z.array(activityItemSchema).max(30).optional(),
  zones: z.array(dropZoneSchema).max(12).optional(),
  evidence: z.array(evidenceSchema).max(16).optional(),
  prompt: z.string().trim().max(1000).optional(),
  successFeedback: z.string().trim().max(1200).optional(),
  retryFeedback: z.string().trim().max(1200).optional(),
  points: z.number().int().min(0).max(1000).optional(),
  stage: experienceStageSchema.optional(),
  shots: z.array(shotSchema).max(24).optional(),
  interactionLayout: z.enum(["overlay", "panel", "diegetic"]).optional(),
  missionLabel: z.string().trim().max(100).optional(),
  objective: z.string().trim().max(400).optional(),
});

const themeSchema = z.object({
  name: z.string().trim().min(1).max(80),
  background: color,
  surface: color,
  accent: color,
  accentSoft: color,
  text: color,
  atmosphere: z.enum(["aurora", "dunes", "forest", "studio"]),
});

const characterSchema = z.object({
  id,
  name: z.string().trim().min(1).max(100),
  role: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1200).optional(),
  imageUrl: optionalUrl,
  portraitAssetId: id.optional(),
  accent: color,
  voice: z.string().trim().max(120).optional(),
});

export const experienceDocumentSchema = z.object({
  schemaVersion: z.literal(2),
  title: z.string().trim().min(1).max(160),
  subtitle: z.string().trim().max(240),
  description: z.string().trim().max(1200),
  estimatedMinutes: z.number().int().min(1).max(240),
  objectives: z.array(z.string().trim().min(1).max(500)).min(1).max(12),
  startSceneId: id,
  theme: themeSchema,
  world: z.object({
    title: z.string().trim().min(1).max(160),
    logline: z.string().trim().max(800),
    artDirection: z.string().trim().max(3000),
    mapStyle: z.enum(["orbital", "atlas", "none"]),
    startLocationId: id.optional(),
    locations: z
      .array(
        z.object({
          id,
          name: z.string().trim().min(1).max(160),
          description: z.string().trim().max(1200),
          x: z.number().min(0).max(100),
          y: z.number().min(0).max(100),
          accent: color.optional(),
          backgroundAssetId: id.optional(),
          ambientAudioAssetId: id.optional(),
          environmentModelAssetId: id.optional(),
          connections: z.array(id).max(16),
        }),
      )
      .max(40),
  }),
  assets: z
    .array(
      z.object({
        id,
        name: z.string().trim().min(1).max(160),
        kind: z.enum(["image", "video", "audio", "model3d"]),
        url: z.string().trim().min(1).max(2048),
        alt: z.string().trim().max(500).optional(),
        mimeType: z.string().trim().max(120).optional(),
        source: z.enum(["upload", "generated", "external"]).optional(),
        prompt: z.string().trim().max(3000).optional(),
        thumbnailUrl: optionalUrl,
      }),
    )
    .max(240),
  characters: z.array(characterSchema).max(24),
  scenes: z.array(experienceSceneSchema).min(1).max(120),
});

const legacyDocumentSchema = z.object({
  schemaVersion: z.literal(1),
  title: z.string(),
  subtitle: z.string(),
  description: z.string(),
  estimatedMinutes: z.number(),
  objectives: z.array(z.string()),
  startSceneId: z.string(),
  theme: themeSchema,
  characters: z.array(
    characterSchema.omit({ portraitAssetId: true, voice: true }),
  ),
  scenes: z.array(
    experienceSceneSchema.omit({
      locationId: true,
      evidence: true,
      stage: true,
      shots: true,
      interactionLayout: true,
      missionLabel: true,
      objective: true,
    }),
  ),
});

export function createDefaultStage(
  locationId?: string,
  backgroundUrl?: string,
): ExperienceStage {
  return {
    mode: "2d",
    locationId,
    camera: {
      x: 0,
      y: 0,
      zoom: 1,
      rotation: 0,
      transition: "fade",
    },
    layers: backgroundUrl
      ? [
          {
            id: "legacy-background",
            name: "Scene background",
            kind: "image",
            url: backgroundUrl,
            x: 0,
            y: 0,
            width: 100,
            height: 100,
            depth: -10,
            opacity: 1,
            parallax: 0.08,
            fit: "cover",
            blendMode: "normal",
            animation: "ken-burns",
          },
        ]
      : [],
    actors: [],
    effects: {
      vignette: 0.35,
      grain: 0.08,
      weather: "none",
      intensity: 0.5,
    },
  };
}

function migrateLegacyDocument(input: unknown): unknown {
  if (
    !input ||
    typeof input !== "object" ||
    (input as { schemaVersion?: unknown }).schemaVersion !== 1
  ) {
    return input;
  }
  const legacy = legacyDocumentSchema.parse(input);
  const locationId = "primary-world";
  return {
    ...legacy,
    schemaVersion: 2,
    world: {
      title: legacy.theme.name,
      logline: legacy.description,
      artDirection: `${legacy.theme.name}; ${legacy.theme.atmosphere} atmosphere; cohesive premium educational game illustration.`,
      mapStyle: "none",
      startLocationId: locationId,
      locations: [
        {
          id: locationId,
          name: legacy.theme.name,
          description: legacy.description,
          x: 50,
          y: 50,
          accent: legacy.theme.accent,
          connections: [],
        },
      ],
    },
    assets: [],
    scenes: legacy.scenes.map((scene) => ({
      ...scene,
      locationId,
      interactionLayout:
        scene.type === "dialogue" ? "overlay" : "panel",
      stage: createDefaultStage(locationId, scene.backgroundUrl),
    })),
  };
}

export function normalizeExperienceDocument(
  input: unknown,
  options: { publish?: boolean } = {},
): ExperienceDocument {
  const parsed = experienceDocumentSchema.parse(migrateLegacyDocument(input));
  validateDocumentReferences(parsed, options);
  if (options.publish) validatePublishedFlow(parsed);
  return parsed as ExperienceDocument;
}

function validateDocumentReferences(
  document: z.infer<typeof experienceDocumentSchema>,
  options: { publish?: boolean },
) {
  const sceneIds = uniqueIds(document.scenes, "scene");
  const characterIds = uniqueIds(document.characters, "character");
  const assetIds = uniqueIds(document.assets, "asset");
  const locationIds = uniqueIds(document.world.locations, "location");

  if (!sceneIds.has(document.startSceneId)) {
    throw new Error("The starting scene does not exist.");
  }
  if (
    document.world.startLocationId &&
    !locationIds.has(document.world.startLocationId)
  ) {
    throw new Error("The starting world location does not exist.");
  }

  for (const location of document.world.locations) {
    for (const target of location.connections) {
      if (!locationIds.has(target)) {
        throw new Error(`Location "${location.name}" has a missing connection.`);
      }
    }
    for (const assetId of [
      location.backgroundAssetId,
      location.ambientAudioAssetId,
      location.environmentModelAssetId,
    ]) {
      if (assetId && !assetIds.has(assetId)) {
        throw new Error(`Location "${location.name}" references a missing asset.`);
      }
    }
  }

  for (const character of document.characters) {
    if (character.portraitAssetId && !assetIds.has(character.portraitAssetId)) {
      throw new Error(`Character "${character.name}" references a missing asset.`);
    }
  }

  for (const scene of document.scenes) {
    if (scene.characterId && !characterIds.has(scene.characterId)) {
      throw new Error(`Scene "${scene.title}" references a missing character.`);
    }
    if (scene.locationId && !locationIds.has(scene.locationId)) {
      throw new Error(`Scene "${scene.title}" references a missing location.`);
    }
    for (const target of [
      scene.nextSceneId,
      ...(scene.choices || []).map((choice) => choice.nextSceneId),
    ]) {
      if (target && !sceneIds.has(target)) {
        throw new Error(`Scene "${scene.title}" links to a missing scene.`);
      }
    }
    for (const choice of scene.choices || []) {
      if (choice.locationId && !locationIds.has(choice.locationId)) {
        throw new Error(`Scene "${scene.title}" links to a missing location.`);
      }
    }
    validateStage(scene, characterIds, assetIds, locationIds);
    validateActivity(scene, options.publish === true);
  }
}

function validateStage(
  scene: z.infer<typeof experienceSceneSchema>,
  characterIds: Set<string>,
  assetIds: Set<string>,
  locationIds: Set<string>,
) {
  if (!scene.stage) return;
  if (scene.stage.locationId && !locationIds.has(scene.stage.locationId)) {
    throw new Error(`Scene "${scene.title}" stage references a missing location.`);
  }
  for (const actor of [
    ...scene.stage.actors,
    ...(scene.shots || []).flatMap((shot) => shot.actors || []),
  ]) {
    if (!characterIds.has(actor.characterId)) {
      throw new Error(`Scene "${scene.title}" stage has a missing actor.`);
    }
  }
  for (const layer of scene.stage.layers) {
    if (layer.assetId && !assetIds.has(layer.assetId)) {
      throw new Error(`Layer "${layer.name}" references a missing asset.`);
    }
  }
  if (
    scene.stage.three?.environmentAssetId &&
    !assetIds.has(scene.stage.three.environmentAssetId)
  ) {
    throw new Error(`Scene "${scene.title}" has a missing 3D environment.`);
  }
  for (const node of scene.stage.three?.nodes || []) {
    if (node.kind === "model" && (!node.assetId || !assetIds.has(node.assetId))) {
      throw new Error(`3D model "${node.name}" needs a valid GLB asset.`);
    }
  }
}

function validateActivity(
  scene: z.infer<typeof experienceSceneSchema>,
  publish: boolean,
) {
  if (!publish) return;
  if (
    (scene.type === "choice" || scene.type === "world-map") &&
    (scene.choices?.length || 0) < 2
  ) {
    throw new Error(`${sceneTypeLabel(scene.type)} "${scene.title}" needs at least two destinations.`);
  }
  if (
    scene.type === "quiz" &&
    ((scene.options?.length || 0) < 2 ||
      !scene.options?.some((option) => option.correct))
  ) {
    throw new Error(`Quiz scene "${scene.title}" needs options and a correct answer.`);
  }
  if (
    scene.type === "hotspot" &&
    (!scene.mediaUrl && !scene.stage?.layers.length ||
      !scene.hotspots?.some((hotspot) => hotspot.correct))
  ) {
    throw new Error(`Hotspot scene "${scene.title}" needs visual media and a correct target.`);
  }
  if (
    scene.type === "collect" &&
    ((scene.items?.length || 0) < 1 ||
      scene.items?.some((item) => item.x === undefined || item.y === undefined))
  ) {
    throw new Error(`Collect scene "${scene.title}" needs positioned items.`);
  }
  if (scene.type === "sort" || scene.type === "match") {
    const zoneIds = new Set((scene.zones || []).map((zone) => zone.id));
    if ((scene.zones?.length || 0) < 2 || (scene.items?.length || 0) < 2) {
      throw new Error(`${sceneTypeLabel(scene.type)} "${scene.title}" needs at least two items and destinations.`);
    }
    if (scene.items?.some((item) => !item.targetId || !zoneIds.has(item.targetId))) {
      throw new Error(`Every item in "${scene.title}" needs a valid destination.`);
    }
  }
  if (scene.type === "sequence" && (scene.items?.length || 0) < 2) {
    throw new Error(`Sequence scene "${scene.title}" needs at least two steps.`);
  }
  if (scene.type === "evidence" && (scene.evidence?.length || 0) < 1) {
    throw new Error(`Evidence scene "${scene.title}" needs at least one dossier.`);
  }
  if (!scene.body.trim()) {
    throw new Error(`Scene "${scene.title}" needs learner-facing content.`);
  }
  if (
    scene.type !== "completion" &&
    scene.type !== "choice" &&
    scene.type !== "world-map" &&
    !scene.nextSceneId
  ) {
    throw new Error(`Scene "${scene.title}" needs a next scene.`);
  }
  if (
    (scene.type === "choice" || scene.type === "world-map") &&
    scene.choices?.some((choice) => !choice.nextSceneId)
  ) {
    throw new Error(`Every destination in "${scene.title}" needs a next scene.`);
  }
}

function uniqueIds(items: Array<{ id: string }>, label: string) {
  const values = new Set(items.map((item) => item.id));
  if (values.size !== items.length) {
    throw new Error(`Every ${label} needs a unique ID.`);
  }
  return values;
}

function validatePublishedFlow(
  document: z.infer<typeof experienceDocumentSchema>,
) {
  const completions = document.scenes
    .filter((scene) => scene.type === "completion")
    .map((scene) => scene.id);
  if (!completions.length) {
    throw new Error("Add a completion scene before publishing.");
  }
  const targets = new Map(
    document.scenes.map((scene) => [
      scene.id,
      scene.type === "choice" || scene.type === "world-map"
        ? (scene.choices || []).flatMap((choice) =>
            choice.nextSceneId ? [choice.nextSceneId] : [],
          )
        : scene.nextSceneId
          ? [scene.nextSceneId]
          : [],
    ]),
  );

  const reachable = new Set<string>();
  const queue = [document.startSceneId];
  while (queue.length) {
    const current = queue.shift()!;
    if (reachable.has(current)) continue;
    reachable.add(current);
    queue.push(...(targets.get(current) || []));
  }
  const unreachable = document.scenes.find((scene) => !reachable.has(scene.id));
  if (unreachable) {
    throw new Error(`Connect or remove unreachable scene "${unreachable.title}" before publishing.`);
  }

  const reverse = new Map<string, string[]>();
  for (const [from, next] of targets) {
    for (const to of next) reverse.set(to, [...(reverse.get(to) || []), from]);
  }
  const reachesCompletion = new Set<string>();
  const reverseQueue = [...completions];
  while (reverseQueue.length) {
    const current = reverseQueue.shift()!;
    if (reachesCompletion.has(current)) continue;
    reachesCompletion.add(current);
    reverseQueue.push(...(reverse.get(current) || []));
  }
  const stranded = document.scenes.find(
    (scene) => reachable.has(scene.id) && !reachesCompletion.has(scene.id),
  );
  if (stranded) {
    throw new Error(`Scene "${stranded.title}" has no path to a completion.`);
  }
}

export function createStarterExperience(
  title = "New immersive experience",
): ExperienceDocument {
  const locationId = "field-station";
  return {
    schemaVersion: 2,
    title,
    subtitle: "A cinematic learning mission",
    description:
      "Guide learners through a story world, a meaningful decision, and an evidence-based challenge.",
    estimatedMinutes: 10,
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
    world: {
      title: "The Signal Frontier",
      logline: "A remote community needs the learner to turn uncertain evidence into a defensible decision.",
      artDirection:
        "Painterly cinematic educational adventure; layered environments; strong silhouettes; luminous practical technology; cohesive teal and moss palette; no text embedded in artwork.",
      mapStyle: "orbital",
      startLocationId: locationId,
      locations: [
        {
          id: locationId,
          name: "Aurora Field Station",
          description: "A remote research outpost at the edge of the known map.",
          x: 50,
          y: 50,
          accent: "#71E0E7",
          connections: [],
        },
      ],
    },
    assets: [],
    characters: [
      {
        id: "guide",
        name: "Nova",
        role: "Mission guide",
        description: "A warm, precise field expert who keeps the mission moving.",
        accent: "#B8F56D",
      },
    ],
    scenes: [
      {
        id: "welcome",
        type: "dialogue",
        eyebrow: "Mission briefing",
        title: "A signal has arrived",
        body:
          "A community needs your help. Examine the situation, make one important decision, and prove what you have learned.",
        characterId: "guide",
        locationId,
        missionLabel: "Mission 01",
        objective: "Find the strongest signal in the available evidence.",
        interactionLayout: "overlay",
        stage: {
          ...createDefaultStage(locationId),
          effects: {
            vignette: 0.45,
            grain: 0.08,
            weather: "fireflies",
            intensity: 0.5,
          },
          actors: [
            {
              characterId: "guide",
              x: 23,
              y: 101,
              scale: 1,
              depth: 5,
              entrance: "rise",
            },
          ],
        },
        shots: [
          {
            id: "signal",
            title: "Incoming transmission",
            body: "A signal has arrived from the frontier.",
            speakerCharacterId: "guide",
            camera: { zoom: 1.08 },
          },
          {
            id: "brief",
            body:
              "A community needs your help. Examine the situation, make one important decision, and prove what you have learned.",
            speakerCharacterId: "guide",
            camera: { zoom: 1 },
          },
        ],
        nextSceneId: "concept",
      },
      {
        id: "concept",
        type: "explainer",
        eyebrow: "Field note",
        title: "Start with the evidence",
        body:
          "Strong decisions begin by separating what we know, what we assume, and what we still need to discover.",
        characterId: "guide",
        locationId,
        interactionLayout: "diegetic",
        stage: createDefaultStage(locationId),
        nextSceneId: "decision",
      },
      {
        id: "decision",
        type: "choice",
        eyebrow: "Your move",
        title: "What should we do first?",
        body: "Choose the approach that gives us the clearest next step.",
        characterId: "guide",
        locationId,
        interactionLayout: "panel",
        stage: createDefaultStage(locationId),
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
        locationId,
        interactionLayout: "panel",
        stage: createDefaultStage(locationId),
        options: [
          { id: "a", label: "Review relevant evidence and identify gaps.", correct: true },
          { id: "b", label: "Choose the fastest answer and justify it later." },
          { id: "c", label: "Avoid making the decision altogether." },
        ],
        successFeedback: "Exactly. Evidence makes the next action defensible.",
        retryFeedback: "Look for the response that reduces unsupported assumptions.",
        points: 100,
        nextSceneId: "complete",
      },
      {
        id: "complete",
        type: "completion",
        eyebrow: "Mission complete",
        title: "You found the signal",
        body:
          "You used evidence to move from uncertainty to a clear, supportable decision.",
        characterId: "guide",
        locationId,
        interactionLayout: "overlay",
        stage: createDefaultStage(locationId),
      },
    ],
  };
}

export function createScene(
  type: ExperienceSceneType,
  index: number,
): ExperienceScene {
  const common: ExperienceScene = {
    id: `${type}-${crypto.randomUUID().slice(0, 8)}`,
    type,
    eyebrow: `Scene ${index}`,
    title: sceneTypeLabel(type),
    body: "",
    interactionLayout:
      type === "dialogue" || type === "completion" ? "overlay" : "panel",
    stage: createDefaultStage(),
  };
  if (type === "choice" || type === "world-map") {
    return {
      ...common,
      body:
        type === "world-map"
          ? "Choose the next destination in the learning world."
          : "Invite the learner to make a meaningful decision.",
      choices: [
        { id: crypto.randomUUID(), label: "First destination" },
        { id: crypto.randomUUID(), label: "Second destination" },
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
        { id: crypto.randomUUID(), label: "First item", targetId: firstZone },
        { id: crypto.randomUUID(), label: "Second item", targetId: secondZone },
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
  if (type === "evidence") {
    return {
      ...common,
      body: "Review each dossier and decide whether the evidence supports approval.",
      prompt: "Verify each record.",
      evidence: [
        {
          id: crypto.randomUUID(),
          title: "Evidence record",
          summary: "Review the facts in this record.",
          correctDecision: "approve",
          explanation: "This record meets the stated criteria.",
        },
      ],
      successFeedback: "Every record was verified correctly.",
      retryFeedback: "Review the evidence and criteria again.",
      points: 200,
    };
  }
  if (type === "completion") {
    return { ...common, body: "Summarize what the learner accomplished." };
  }
  return {
    ...common,
    body:
      type === "dialogue"
        ? "Write the character’s line."
        : "Explain the idea in clear learner-facing language.",
  };
}

export function sceneTypeLabel(type: ExperienceSceneType) {
  return (
    {
      dialogue: "Dialogue",
      explainer: "Explainer",
      choice: "Branching choice",
      quiz: "Knowledge check",
      hotspot: "Hotspot inspection",
      collect: "Collect & discover",
      sort: "Sort into groups",
      match: "Match pairs",
      sequence: "Sequence builder",
      "world-map": "World map",
      evidence: "Evidence verifier",
      completion: "Completion",
    } satisfies Record<ExperienceSceneType, string>
  )[type];
}

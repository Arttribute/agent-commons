export type ExperienceSceneType =
  | "dialogue"
  | "explainer"
  | "choice"
  | "quiz"
  | "hotspot"
  | "collect"
  | "sort"
  | "match"
  | "sequence"
  | "world-map"
  | "evidence"
  | "completion";

export type ExperienceTheme = {
  name: string;
  background: string;
  surface: string;
  accent: string;
  accentSoft: string;
  text: string;
  atmosphere: "aurora" | "dunes" | "forest" | "studio";
};

export type ExperienceAssetKind =
  | "image"
  | "video"
  | "audio"
  | "model3d";

export type ExperienceAsset = {
  id: string;
  name: string;
  kind: ExperienceAssetKind;
  url: string;
  alt?: string;
  mimeType?: string;
  source?: "upload" | "generated" | "external";
  prompt?: string;
  thumbnailUrl?: string;
};

export type ExperienceCharacter = {
  id: string;
  name: string;
  role: string;
  description?: string;
  imageUrl?: string;
  portraitAssetId?: string;
  accent: string;
  voice?: string;
};

export type ExperienceWorldLocation = {
  id: string;
  name: string;
  description: string;
  x: number;
  y: number;
  accent?: string;
  backgroundAssetId?: string;
  ambientAudioAssetId?: string;
  environmentModelAssetId?: string;
  connections: string[];
};

export type ExperienceWorld = {
  title: string;
  logline: string;
  artDirection: string;
  mapStyle: "orbital" | "atlas" | "none";
  startLocationId?: string;
  locations: ExperienceWorldLocation[];
};

export type ExperienceStageLayer = {
  id: string;
  name: string;
  kind: "image" | "video" | "color" | "gradient" | "particles";
  assetId?: string;
  url?: string;
  color?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  depth: number;
  opacity: number;
  parallax: number;
  fit: "cover" | "contain" | "fill";
  blendMode:
    | "normal"
    | "multiply"
    | "screen"
    | "overlay"
    | "soft-light";
  animation: "none" | "drift" | "float" | "pulse" | "ken-burns";
};

export type ExperienceStageActor = {
  characterId: string;
  x: number;
  y: number;
  scale: number;
  depth: number;
  flip?: boolean;
  pose?: string;
  entrance?: "none" | "fade" | "slide-left" | "slide-right" | "rise";
};

export type ExperienceStageNode3D = {
  id: string;
  name: string;
  kind: "model" | "box" | "sphere" | "cylinder" | "cone" | "plane";
  assetId?: string;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  color?: string;
  metallic?: number;
  roughness?: number;
  animation?: "none" | "rotate" | "float";
};

export type ExperienceStage = {
  mode: "2d" | "3d" | "hybrid";
  locationId?: string;
  camera: {
    x: number;
    y: number;
    zoom: number;
    rotation: number;
    transition: "cut" | "fade" | "pan" | "zoom" | "portal";
  };
  layers: ExperienceStageLayer[];
  actors: ExperienceStageActor[];
  three?: {
    background: string;
    environmentAssetId?: string;
    cameraPosition: [number, number, number];
    cameraTarget: [number, number, number];
    nodes: ExperienceStageNode3D[];
  };
  effects: {
    vignette: number;
    grain: number;
    weather: "none" | "rain" | "snow" | "dust" | "fireflies";
    intensity: number;
  };
};

export type ExperienceShot = {
  id: string;
  title?: string;
  body: string;
  speakerCharacterId?: string;
  camera?: Partial<ExperienceStage["camera"]>;
  actors?: ExperienceStageActor[];
};

export type ExperienceChoice = {
  id: string;
  label: string;
  description?: string;
  nextSceneId?: string;
  locationId?: string;
};

export type ExperienceOption = {
  id: string;
  label: string;
  correct?: boolean;
};

export type ExperienceHotspot = {
  id: string;
  label: string;
  x: number;
  y: number;
  radius: number;
  correct?: boolean;
};

export type ExperienceActivityItem = {
  id: string;
  label: string;
  description?: string;
  imageUrl?: string;
  assetId?: string;
  x?: number;
  y?: number;
  targetId?: string;
};

export type ExperienceDropZone = {
  id: string;
  label: string;
  description?: string;
};

export type ExperienceEvidence = {
  id: string;
  title: string;
  summary: string;
  details?: string;
  imageUrl?: string;
  assetId?: string;
  correctDecision: "approve" | "reject";
  explanation?: string;
};

export type ExperienceScene = {
  id: string;
  type: ExperienceSceneType;
  title: string;
  eyebrow?: string;
  body: string;
  characterId?: string;
  locationId?: string;
  backgroundUrl?: string;
  mediaUrl?: string;
  mediaAlt?: string;
  nextSceneId?: string;
  choices?: ExperienceChoice[];
  options?: ExperienceOption[];
  hotspots?: ExperienceHotspot[];
  items?: ExperienceActivityItem[];
  zones?: ExperienceDropZone[];
  evidence?: ExperienceEvidence[];
  prompt?: string;
  successFeedback?: string;
  retryFeedback?: string;
  points?: number;
  stage?: ExperienceStage;
  shots?: ExperienceShot[];
  interactionLayout?: "overlay" | "panel" | "diegetic";
  missionLabel?: string;
  objective?: string;
};

export type ExperienceDocument = {
  schemaVersion: 2;
  title: string;
  subtitle: string;
  description: string;
  estimatedMinutes: number;
  objectives: string[];
  startSceneId: string;
  theme: ExperienceTheme;
  world: ExperienceWorld;
  assets: ExperienceAsset[];
  characters: ExperienceCharacter[];
  scenes: ExperienceScene[];
};

export type ExperienceProjectDTO = {
  id: string;
  courseId: string;
  courseSlug: string;
  title: string;
  description: string;
  status: "draft" | "published";
  draftVersion: number;
  publishedVersion?: number;
  publishedAt?: string;
  isFreePreview: boolean;
  draft: ExperienceDocument;
  updatedAt: string;
  createdAt: string;
};

export type ExperienceSummaryDTO = Omit<ExperienceProjectDTO, "draft"> & {
  sceneCount: number;
  characterCount: number;
};

export type ExperienceProgressDTO = {
  authenticated: boolean;
  currentSceneId: string;
  completedSceneIds: string[];
  score: number;
  attempts: Record<string, number>;
  completed: boolean;
  feedback?: string;
  correct?: boolean;
};

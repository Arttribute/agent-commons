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

export type ExperienceCharacter = {
  id: string;
  name: string;
  role: string;
  description?: string;
  imageUrl?: string;
  accent: string;
};

export type ExperienceChoice = {
  id: string;
  label: string;
  description?: string;
  nextSceneId?: string;
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
  x?: number;
  y?: number;
  targetId?: string;
};

export type ExperienceDropZone = {
  id: string;
  label: string;
  description?: string;
};

export type ExperienceScene = {
  id: string;
  type: ExperienceSceneType;
  title: string;
  eyebrow?: string;
  body: string;
  characterId?: string;
  backgroundUrl?: string;
  mediaUrl?: string;
  mediaAlt?: string;
  nextSceneId?: string;
  choices?: ExperienceChoice[];
  options?: ExperienceOption[];
  hotspots?: ExperienceHotspot[];
  items?: ExperienceActivityItem[];
  zones?: ExperienceDropZone[];
  prompt?: string;
  successFeedback?: string;
  retryFeedback?: string;
  points?: number;
};

export type ExperienceDocument = {
  schemaVersion: 1;
  title: string;
  subtitle: string;
  description: string;
  estimatedMinutes: number;
  objectives: string[];
  startSceneId: string;
  theme: ExperienceTheme;
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

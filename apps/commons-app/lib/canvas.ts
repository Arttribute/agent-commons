import type { ArtifactPreview } from "@/lib/artifacts";

export type MediaKind = "image" | "video" | "audio" | "music";
export type MediaOperation = "generate" | "transform";

export type MediaSetting = {
  key: string;
  label: string;
  type: "select" | "number" | "boolean" | "text";
  default?: string | number | boolean;
  options?: Array<{ label: string; value: string }>;
  min?: number;
  max?: number;
  step?: number;
  help?: string;
};

export type MediaModel = {
  modelKey: string;
  provider: string;
  modelId: string;
  displayName: string;
  description: string;
  kind: MediaKind;
  operations: MediaOperation[];
  inputKinds: MediaKind[];
  maxInputs: number;
  tier: "fast" | "standard" | "frontier";
  async: boolean;
  settings: MediaSetting[];
  pricing: {
    unit: string;
    usd: number;
    note: string;
    sourceUrl: string;
    settlement: "catalog" | "provider_usage";
    variants?: Record<string, number>;
    requiresOverride?: boolean;
  };
  badges?: string[];
  available: boolean;
  unavailableReason?: "provider_not_configured" | "price_not_configured";
};

export type MediaCatalog = {
  models: MediaModel[];
  providers: Array<{
    id: string;
    displayName: string;
    configured: boolean;
    capabilities: MediaKind[];
  }>;
  billing?: { estimate: string; settlement: string };
};

export type MediaQuote = {
  capability: string;
  estimatedCostUsd: number;
  estimatedCredits: number;
  currency: "credits";
  pricingPolicy: string;
  modelKey: string;
  provider: string;
  modelId: string;
  pricing: MediaModel["pricing"];
  settlement: "catalog" | "provider_usage";
};

export type CanvasArtifact = {
  itemId: string;
  name: string;
  description?: string | null;
  kind: string;
  mimeType: string;
  sizeBytes: number;
  source: string;
  status: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
};

export type CanvasRevision = {
  revisionId: string;
  projectId: string;
  itemId: string;
  parentRevisionId?: string | null;
  operation: string;
  provider?: string | null;
  modelId?: string | null;
  promptHash?: string | null;
  inputs?: Array<{ itemId: string }>;
  settings?: Record<string, unknown>;
  traceId?: string | null;
  createdByType: "human" | "agent" | "service";
  createdById?: string | null;
  createdAt: string;
  artifact?: CanvasArtifact;
};

export type CanvasAnnotationKind =
  | "comment"
  | "point"
  | "region"
  | "time_range"
  | "transcript"
  | "freehand";

export type CanvasAnnotation = {
  annotationId: string;
  projectId: string;
  revisionId: string;
  parentAnnotationId?: string | null;
  kind: CanvasAnnotationKind;
  body: string;
  geometry?: Record<string, unknown> | null;
  startMs?: number | null;
  endMs?: number | null;
  status: "open" | "resolved";
  authorType: "human" | "agent" | "service";
  authorId?: string | null;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type MediaJob = {
  jobId: string;
  projectId?: string | null;
  provider: string;
  modelId: string;
  mediaKind: MediaKind;
  operation: MediaOperation;
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
  progress: number;
  inputItemIds?: string[];
  outputItemId?: string | null;
  estimatedCostUsd?: number | null;
  actualCostUsd?: number | null;
  billing?: Record<string, unknown>;
  errorCode?: string | null;
  errorMessage?: string | null;
  createdAt: string;
  startedAt?: string | null;
  completedAt?: string | null;
};

export type CanvasProject = {
  projectId: string;
  ownerUserId: string;
  workspaceId?: string | null;
  name: string;
  description?: string | null;
  rootItemId: string;
  activeItemId: string;
  settings?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type CanvasProjectBundle = {
  project: CanvasProject;
  revisions: CanvasRevision[];
  annotations: CanvasAnnotation[];
  jobs: MediaJob[];
  assets: CanvasArtifact[];
};

export type CanvasTimelineClip = {
  clipId: string;
  itemId: string;
  name: string;
  startMs: number;
  sourceInMs: number;
  sourceOutMs: number;
  durationMs: number;
};

export type CanvasTimeline = {
  version: 1;
  tracks: Array<{
    trackId: string;
    kind: "video" | "audio";
    name: string;
    clips: CanvasTimelineClip[];
  }>;
};

export type CanvasPreview = ArtifactPreview;

export function unwrapCanvasPayload<T>(payload: unknown): T {
  const record = payload as { data?: T } | null;
  return (record?.data ?? payload) as T;
}

export function formatCanvasTime(ms: number) {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes}:${String(remainder).padStart(2, "0")}`;
}

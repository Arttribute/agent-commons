type MediaKind = "image" | "video" | "audio" | "music";
type MediaOperation = "generate" | "transform";

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


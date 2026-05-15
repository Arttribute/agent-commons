export type SearchActorRole = "learner" | "educator" | "agent";

export type SearchSourceKind =
  | "course"
  | "module"
  | "lesson"
  | "assignment"
  | "submission"
  | "feedback"
  | "resource";

export type SearchMediaType =
  | "text"
  | "image"
  | "audio"
  | "video"
  | "pdf"
  | "document"
  | "url";

export type SearchVisibility =
  | "course_public"
  | "course_enrolled"
  | "educator_private"
  | "learner_private";

export interface ScopedSearchResult {
  id: string;
  courseId: string;
  sourceKind: SearchSourceKind;
  mediaType: SearchMediaType;
  title: string;
  text: string;
  url?: string;
  score?: number;
  metadata?: Record<string, unknown>;
}

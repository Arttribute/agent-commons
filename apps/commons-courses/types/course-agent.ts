export type CourseAgentAudience = "learners" | "educators" | "both";

export type CourseAgentDataScope =
  | "course_overview"
  | "course_content"
  | "course_content_and_progress"
  | "educator_operations";

export type CourseAgentAction = "suggest" | "draft" | "fill_view" | "navigate";

export type CourseAgentLearningMode =
  | "socratic"
  | "guided"
  | "direct_support";

export interface CourseAgentConfig {
  id: string;
  name: string;
  agentCommonsAgentId?: string;
  audience: CourseAgentAudience;
  enabled: boolean;
  dataScope: CourseAgentDataScope;
  learningMode: CourseAgentLearningMode;
  actions: CourseAgentAction[];
  instructions: string;
}

export interface CourseAgentViewContext {
  page: string;
  title?: string;
  moduleIndex?: number;
  lessonIndex?: number;
  selection?: string;
  visibleText?: string;
  formFields?: Record<string, string>;
}

export interface CourseAgentMessage {
  role: "user" | "assistant";
  content: string;
}

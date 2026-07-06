export type EducatorCopilotActionMode = "manual" | "auto";

export type EducatorCopilotActionStatus =
  | "proposed"
  | "applied"
  | "rejected"
  | "blocked"
  | "failed";

export type EducatorCopilotActionSafety =
  | "client_safe"
  | "content_write"
  | "sensitive_blocked";

type ActionBase = {
  id: string;
  label: string;
  reason?: string;
  preview?: string;
  status: EducatorCopilotActionStatus;
  safety: EducatorCopilotActionSafety;
  result?: string;
};

export type EducatorCopilotLessonDraft = {
  title: string;
  duration?: string;
  description?: string;
  assetUrl?: string;
  assetAlt?: string;
  isFree?: boolean;
};

export type EducatorCopilotAction =
  | (ActionBase & {
      type: "navigate";
      href: string;
    })
  | (ActionBase & {
      type: "highlight";
      selector: string;
    })
  | (ActionBase & {
      type: "update_course_lesson";
      courseSlug: string;
      moduleIndex: number;
      lessonIndex: number;
      patch: Partial<EducatorCopilotLessonDraft>;
    })
  | (ActionBase & {
      type: "add_lesson";
      courseSlug: string;
      moduleIndex: number;
      lesson: EducatorCopilotLessonDraft;
    })
  | (ActionBase & {
      type: "add_module";
      courseSlug: string;
      module: {
        title: string;
        description?: string;
        assignment?: string;
        lessons: EducatorCopilotLessonDraft[];
      };
      position?: number;
    })
  | (ActionBase & {
      type: "update_module";
      courseSlug: string;
      moduleIndex: number;
      patch: {
        title?: string;
        description?: string;
        assignment?: string;
      };
    })
  | (ActionBase & {
      type: "update_course_overview";
      courseSlug: string;
      patch: {
        tagline?: string;
        description?: string;
        longDescription?: string;
        level?: "beginner" | "intermediate" | "advanced";
        duration?: string;
        tags?: string[];
      };
    })
  | (ActionBase & {
      type: "update_skill_challenge";
      courseSlug: string;
      skillPackSlug?: string;
      challengeId: string;
      patch: {
        title?: string;
        shortTitle?: string;
        hook?: string;
        lesson?: string;
        keyIdeas?: string[];
        microTask?: string;
      };
    });

export type EducatorCopilotToolActivity = {
  tool: string;
  label: string;
  status: "running" | "done" | "error";
};

export type EducatorCopilotMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  attachments?: EducatorCopilotAttachment[];
  actions?: EducatorCopilotAction[];
  activity?: EducatorCopilotToolActivity[];
};

export type EducatorCopilotAttachment = {
  name: string;
  type: string;
  size: number;
  textPreview?: string;
  fileId?: string;
  status?: "uploaded" | "extracted" | "failed";
};

export type EducatorCopilotPageContext = {
  path: string;
  page: string;
  title?: string;
  visibleText?: string;
  selection?: string;
  formFields?: Record<string, string>;
  uiMap?: Array<{
    label: string;
    type: string;
    selector: string;
    href?: string;
  }>;
};

export type EducatorCopilotSessionSummary = {
  id: string;
  title: string;
  actionMode: EducatorCopilotActionMode;
  currentPath?: string;
  updatedAt: string;
  createdAt: string;
};

export type EducatorCopilotProfile = {
  actionMode: EducatorCopilotActionMode;
  agentId?: string;
  agentReady: boolean;
  copilotName: string;
  customInstructions?: string;
  modelProvider?: string;
  modelId?: string;
  effectiveModel?: string;
};

export type EducatorCopilotMemory = {
  id: string;
  type?: string;
  content: string;
  importance?: number;
  createdAt?: string;
};

export type EducatorCopilotConnector = {
  id: string;
  name: string;
  description?: string;
  connectionType: string;
  status?: string;
  toolsDiscovered?: number;
  lastError?: string | null;
};

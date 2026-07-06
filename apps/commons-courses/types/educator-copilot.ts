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

export type EducatorCopilotAction =
  | {
      id: string;
      type: "navigate";
      label: string;
      href: string;
      reason?: string;
      preview?: string;
      status: EducatorCopilotActionStatus;
      safety: EducatorCopilotActionSafety;
      result?: string;
    }
  | {
      id: string;
      type: "highlight";
      label: string;
      selector: string;
      reason?: string;
      preview?: string;
      status: EducatorCopilotActionStatus;
      safety: EducatorCopilotActionSafety;
      result?: string;
    }
  | {
      id: string;
      type: "update_course_lesson";
      label: string;
      courseSlug: string;
      moduleIndex: number;
      lessonIndex: number;
      patch: {
        title?: string;
        duration?: string;
        description?: string;
        assetUrl?: string;
        assetAlt?: string;
        isFree?: boolean;
      };
      preview?: string;
      reason?: string;
      status: EducatorCopilotActionStatus;
      safety: EducatorCopilotActionSafety;
      result?: string;
    }
  | {
      id: string;
      type: "update_skill_challenge";
      label: string;
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
      preview?: string;
      reason?: string;
      status: EducatorCopilotActionStatus;
      safety: EducatorCopilotActionSafety;
      result?: string;
    };

export type EducatorCopilotMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  actions?: EducatorCopilotAction[];
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

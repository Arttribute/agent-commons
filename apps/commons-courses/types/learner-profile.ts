export const learnerDomains = [
  "marketing",
  "healthcare",
  "education",
  "technology",
  "finance",
  "creative",
  "operations",
  "other",
] as const;

export const learnerFormats = [
  "examples",
  "mind_maps",
  "step_by_step",
  "reflection",
  "audio",
] as const;

export const learnerGuidanceStyles = [
  "coach_me",
  "show_then_practice",
  "concise",
] as const;

export type LearnerDomain = (typeof learnerDomains)[number];
export type LearnerFormat = (typeof learnerFormats)[number];
export type LearnerGuidanceStyle = (typeof learnerGuidanceStyles)[number];

export type LearnerProfileData = {
  personalizationEnabled: boolean;
  onboardingCompleted: boolean;
  roleOrContext: string;
  domain: LearnerDomain | "";
  interests: string[];
  goals: string[];
  preferredFormats: LearnerFormat[];
  guidanceStyle: LearnerGuidanceStyle;
  customContext: string;
  allowUsageLearning: boolean;
  usageSignals?: {
    contextualExampleViews: number;
    mindMapViews: number;
    audioStarts: number;
    helpfulMarks: number;
  };
  updatedAt?: string;
};

export const defaultLearnerProfile: LearnerProfileData = {
  personalizationEnabled: false,
  onboardingCompleted: false,
  roleOrContext: "",
  domain: "",
  interests: [],
  goals: [],
  preferredFormats: ["examples", "mind_maps"],
  guidanceStyle: "coach_me",
  customContext: "",
  allowUsageLearning: true,
};

export type MindMapNode = {
  id: string;
  label: string;
  detail?: string;
  children?: MindMapNode[];
};

export type ContextualLearningView = {
  title: string;
  bridge: string;
  example: string;
  connection: string;
  tryIt: string;
  fidelityNote: string;
};

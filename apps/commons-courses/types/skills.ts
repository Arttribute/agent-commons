export type SkillQuestion = {
  id: string;
  prompt: string;
  options: string[];
  answerIndex: number;
  explanation?: string;
};

export type SkillPlatform = "agent_commons" | "common_os" | "external";

export type SkillActivityRequirement = {
  id: string;
  platform: SkillPlatform;
  eventType: string;
  label: string;
  description?: string;
  points?: number;
};

export type AgentSandboxCapability =
  | "identity"
  | "system_prompt"
  | "skills"
  | "tools"
  | "connectors"
  | "tasks"
  | "workflows"
  | "memory"
  | "computer"
  | "chat"
  | "logs"
  | "credits";

export type AgentSandboxStepTarget =
  | "identity"
  | "system_prompt"
  | "skills"
  | "tools"
  | "connectors"
  | "tasks"
  | "workflows"
  | "memory"
  | "computer"
  | "chat"
  | "logs"
  | "publish";

export type AgentSandboxGuideStep = {
  id: string;
  target: AgentSandboxStepTarget;
  title: string;
  body: string;
  targetSelector?: string;
  placement?: "top" | "right" | "bottom" | "left" | "auto";
};

export type AgentSandboxReviewTarget = "system_prompt" | "skills";

export type AgentSandboxReviewConfig = {
  enabled: boolean;
  targets: AgentSandboxReviewTarget[];
  required?: boolean;
  minScore?: number;
  rubric?: string;
  model?: string;
};

export type AgentSandboxIntroConfig = {
  enabled?: boolean;
  eyebrow?: string;
  title?: string;
  body?: string;
  expectations?: string[];
  infoTitle?: string;
  infoBody?: string;
  startLabel?: string;
};

export type AgentSandboxCompletionConfig = {
  title?: string;
  body?: string;
  primaryActionLabel?: string;
};

export type AgentSandboxToolTemplate = {
  id: string;
  name: string;
  description?: string;
  connectorKind?:
    | "google_calendar"
    | "gmail"
    | "google_drive"
    | "google_sheets"
    | "github"
    | "custom";
  simulated?: boolean;
};

export type AgentSandboxSkillTemplate = {
  id: string;
  name: string;
  instructions: string;
};

export type AgentSandboxTaskTemplate = {
  id: string;
  title: string;
  schedule: string;
  description?: string;
};

export type AgentSandboxWorkflowTemplate = {
  id: string;
  name: string;
  trigger: string;
  nodes: string[];
  edges: string[];
  description?: string;
};

export type AgentSandboxMemoryType =
  | "working"
  | "semantic"
  | "episodic"
  | "procedural";

export type AgentSandboxMemoryTemplate = {
  id: string;
  type: AgentSandboxMemoryType;
  label: string;
  content: string;
};

export type AgentSandboxComputerFile = {
  path: string;
  content: string;
};

export type AgentSandboxComputerTemplate = {
  workspaceName?: string;
  isolationMode?: string;
  files?: AgentSandboxComputerFile[];
  starterCommand?: string;
};

export type AgentSandboxConfig = {
  enabled: boolean;
  mode: "simple" | "builder" | "full";
  title?: string;
  brief?: string;
  intro?: AgentSandboxIntroConfig;
  completion?: AgentSandboxCompletionConfig;
  capabilities: AgentSandboxCapability[];
  requiredCapabilities?: AgentSandboxCapability[];
  guideSteps: AgentSandboxGuideStep[];
  starterAgent?: {
    name?: string;
    persona?: string;
    systemPrompt?: string;
  };
  placeholders?: {
    agentName?: string;
    persona?: string;
    systemPrompt?: string;
    skillInstructions?: string;
    chatInput?: string;
  };
  starterSkillIds?: string[];
  starterToolIds?: string[];
  starterTaskIds?: string[];
  skillTemplates?: AgentSandboxSkillTemplate[];
  toolTemplates?: AgentSandboxToolTemplate[];
  taskTemplates?: AgentSandboxTaskTemplate[];
  workflowTemplates?: AgentSandboxWorkflowTemplate[];
  memoryTemplates?: AgentSandboxMemoryTemplate[];
  computerTemplate?: AgentSandboxComputerTemplate;
  review?: AgentSandboxReviewConfig;
  creditReward?: number;
  completionEventType?: string;
};

export type SkillChallenge = {
  id: string;
  day: number;
  title: string;
  shortTitle?: string;
  minutes: number;
  points: number;
  streakBoost?: number;
  assetUrl?: string;
  assetAlt?: string;
  accentColor?: string;
  audioCue?: "spark" | "focus" | "complete";
  hook?: string;
  lesson: string;
  keyIdeas: string[];
  microTask?: string;
  practicalSignal?: SkillActivityRequirement;
  sandbox?: AgentSandboxConfig;
  questions: SkillQuestion[];
};

export type SkillPack = {
  slug?: string;
  enabled: boolean;
  title: string;
  subtitle?: string;
  coverUrl?: string;
  learnerPromise?: string;
  challenges: SkillChallenge[];
};

export type CourseSkillPack = SkillPack & {
  courseId: string;
  courseSlug: string;
  skillSlug: string;
  courseTitle: string;
};

export type SkillLeaderboardEntry = {
  userId: string;
  name: string;
  avatarUrl?: string;
  points: number;
  streak: number;
  longestStreak: number;
  completedSkills: number;
  skillPathsInProgress?: number;
  skillPathsStarted: number;
  isCurrentUser?: boolean;
};

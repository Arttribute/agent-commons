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
  | "chat"
  | "logs"
  | "publish";

export type AgentSandboxGuideStep = {
  id: string;
  target: AgentSandboxStepTarget;
  title: string;
  body: string;
};

export type AgentSandboxToolTemplate = {
  id: string;
  name: string;
  description?: string;
  connectorKind?: "google_calendar" | "gmail" | "google_drive" | "github" | "custom";
  simulated?: boolean;
};

export type AgentSandboxSkillTemplate = {
  id: string;
  name: string;
  instructions: string;
};

export type AgentSandboxConfig = {
  enabled: boolean;
  mode: "simple" | "builder" | "full";
  title?: string;
  brief?: string;
  capabilities: AgentSandboxCapability[];
  requiredCapabilities?: AgentSandboxCapability[];
  guideSteps: AgentSandboxGuideStep[];
  starterAgent?: {
    name?: string;
    persona?: string;
    systemPrompt?: string;
  };
  skillTemplates?: AgentSandboxSkillTemplate[];
  toolTemplates?: AgentSandboxToolTemplate[];
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
  enabled: boolean;
  title: string;
  subtitle?: string;
  learnerPromise?: string;
  challenges: SkillChallenge[];
};

export type CourseSkillPack = SkillPack & {
  courseId: string;
  courseSlug: string;
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

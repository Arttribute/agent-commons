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

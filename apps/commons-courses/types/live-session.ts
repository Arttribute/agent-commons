export type LiveSessionStatus = "draft" | "lobby" | "live" | "ended";

export type LiveSessionPace = "facilitator" | "learner";

export type LiveSessionAccess = "enrolled" | "invited" | "open";

export type LiveActivityType =
  | "content"
  | "setup_check"
  | "poll"
  | "quiz"
  | "reflection"
  | "task"
  | "break";

export type LiveActivityStatus = "draft" | "open" | "closed";

export type LiveActivityOption = {
  id: string;
  label: string;
  isCorrect?: boolean;
};

export type LiveActivity = {
  id: string;
  type: LiveActivityType;
  title: string;
  prompt?: string;
  instructions?: string;
  successCriteria?: string;
  facilitatorNotes?: string;
  resourceUrl?: string;
  materialId?: string;
  labWorkspaceId?: string;
  labEntryPath?: string;
  estimatedMinutes?: number;
  status: LiveActivityStatus;
  required: boolean;
  randomizeOptions: boolean;
  showResults: boolean;
  points: number;
  options: LiveActivityOption[];
};

export type LiveSessionSettings = {
  allowLateJoin: boolean;
  showParticipantNames: boolean;
  showLeaderboard: boolean;
  learnerCopilot: LiveLearnerCopilotPolicy;
};

export type LiveLearnerCopilotPolicy = {
  enabled: boolean;
  explainCurrentActivity: boolean;
  coachResponses: boolean;
  useCourseMaterials: boolean;
  giveDirectExplanations: boolean;
};

export type LiveSessionRecord = {
  id: string;
  courseId: string;
  courseSlug: string;
  courseTitle: string;
  courseTheme: import("@/lib/course-theme").CourseTheme;
  title: string;
  description?: string;
  joinCode: string;
  status: LiveSessionStatus;
  pace: LiveSessionPace;
  access: LiveSessionAccess;
  invitedEmails: string[];
  scheduledStart?: string;
  currentActivityId?: string;
  stateVersion: number;
  activities: LiveActivity[];
  settings: LiveSessionSettings;
  participantCount: number;
  responseCounts: Record<string, number>;
  createdAt: string;
  updatedAt: string;
};

export type LiveSessionState = {
  status: LiveSessionStatus;
  pace: LiveSessionPace;
  currentActivityId?: string;
  currentActivity?: LiveActivity;
  learnerCopilot: LiveLearnerCopilotPolicy;
  stateVersion: number;
  activityStatuses: Record<string, LiveActivityStatus>;
  serverTime: string;
};

export type LiveParticipantRecord = {
  id: string;
  displayName: string;
  status: "joined" | "active" | "completed";
  joinedAt: string;
  lastSeenAt: string;
};

export type LiveResponseRecord = {
  activityId: string;
  value: string | string[];
  correct?: boolean;
  pointsAwarded?: number;
  submittedAt: string;
};

export type LiveActivityResults = {
  total: number;
  correct?: number;
  options?: Array<{ id: string; label: string; count: number }>;
  textResponses?: Array<{
    id: string;
    participantName?: string;
    value: string;
  }>;
};

export type LearnerLiveSession = Omit<
  LiveSessionRecord,
  "invitedEmails" | "responseCounts" | "participantCount"
> & {
  participantCount: number;
  participant: LiveParticipantRecord;
  responses: Record<string, LiveResponseRecord>;
  results: Record<string, LiveActivityResults>;
};

export type EngagementActivity = {
  id: string;
  index: number;
  title: string;
  type: string;
  responseCount: number;
  responseRate: number;
  correctRate?: number;
  options: Array<{ label: string; count: number; percent: number }>;
  responses: Array<{
    participantName: string;
    userId: string;
    value: string;
    submittedAt: string;
  }>;
};

export type EngagementLearner = {
  participantId: string;
  userId: string;
  name: string;
  email: string;
  status: string;
  joinedAt: string;
  lastSeenAt: string;
  responseCount: number;
  responseRate: number;
  quizCorrect: number;
  quizTotal: number;
};

export type EngagementSummary = {
  attendees: number;
  engagedLearners: number;
  participationRate: number;
  responseCount: number;
  quizAccuracy?: number;
};

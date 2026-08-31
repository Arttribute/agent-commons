import type { LiveLearnerCopilotPolicy } from "@/types/live-session";

export const defaultLiveLearnerCopilotPolicy: LiveLearnerCopilotPolicy = {
  enabled: true,
  explainCurrentActivity: true,
  coachResponses: true,
  useCourseMaterials: true,
  giveDirectExplanations: false,
};

export function normalizeLiveLearnerCopilotPolicy(
  input?: Partial<LiveLearnerCopilotPolicy> | null,
): LiveLearnerCopilotPolicy {
  return {
    enabled: input?.enabled !== false,
    explainCurrentActivity: input?.explainCurrentActivity !== false,
    coachResponses: input?.coachResponses !== false,
    useCourseMaterials: input?.useCourseMaterials !== false,
    giveDirectExplanations: Boolean(input?.giveDirectExplanations),
  };
}

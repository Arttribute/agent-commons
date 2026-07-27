import type {
  LearnerDomain,
  LearnerFormat,
  LearnerGuidanceStyle,
  LearnerProfileData,
} from "@/types/learner-profile";
import {
  defaultLearnerProfile,
  learnerDomains,
  learnerFormats,
  learnerGuidanceStyles,
} from "@/types/learner-profile";

const domainSet = new Set<string>(learnerDomains);
const formatSet = new Set<string>(learnerFormats);
const guidanceSet = new Set<string>(learnerGuidanceStyles);

export function sanitizeLearnerProfile(
  input: unknown,
): Partial<LearnerProfileData> {
  if (!input || typeof input !== "object") return {};
  const value = input as Record<string, unknown>;
  const output: Partial<LearnerProfileData> = {};

  if (typeof value.personalizationEnabled === "boolean") {
    output.personalizationEnabled = value.personalizationEnabled;
  }
  if (typeof value.onboardingCompleted === "boolean") {
    output.onboardingCompleted = value.onboardingCompleted;
  }
  if (typeof value.allowUsageLearning === "boolean") {
    output.allowUsageLearning = value.allowUsageLearning;
  }

  if (typeof value.roleOrContext === "string") {
    output.roleOrContext = cleanText(value.roleOrContext, 120);
  }
  if (typeof value.customContext === "string") {
    output.customContext = cleanText(value.customContext, 500);
  }
  if (typeof value.domain === "string" && domainSet.has(value.domain)) {
    output.domain = value.domain as LearnerDomain;
  }
  if (
    typeof value.guidanceStyle === "string" &&
    guidanceSet.has(value.guidanceStyle)
  ) {
    output.guidanceStyle = value.guidanceStyle as LearnerGuidanceStyle;
  }

  if (Array.isArray(value.interests)) {
    output.interests = cleanList(value.interests, 6, 80);
  }
  if (Array.isArray(value.goals)) {
    output.goals = cleanList(value.goals, 4, 120);
  }
  if (Array.isArray(value.preferredFormats)) {
    output.preferredFormats = Array.from(
      new Set(
        value.preferredFormats.filter(
          (item): item is LearnerFormat =>
            typeof item === "string" && formatSet.has(item),
        ),
      ),
    ).slice(0, learnerFormats.length);
  }

  return output;
}

export function serializeLearnerProfile(
  profile?: Partial<LearnerProfileData> | null,
): LearnerProfileData {
  return {
    personalizationEnabled:
      profile?.personalizationEnabled ??
      defaultLearnerProfile.personalizationEnabled,
    onboardingCompleted:
      profile?.onboardingCompleted ?? defaultLearnerProfile.onboardingCompleted,
    roleOrContext:
      profile?.roleOrContext ?? defaultLearnerProfile.roleOrContext,
    domain: profile?.domain ?? defaultLearnerProfile.domain,
    interests: profile?.interests || [],
    goals: profile?.goals || [],
    preferredFormats:
      profile?.preferredFormats || defaultLearnerProfile.preferredFormats,
    guidanceStyle:
      profile?.guidanceStyle ?? defaultLearnerProfile.guidanceStyle,
    customContext:
      profile?.customContext ?? defaultLearnerProfile.customContext,
    allowUsageLearning:
      profile?.allowUsageLearning ?? defaultLearnerProfile.allowUsageLearning,
    usageSignals: profile?.usageSignals,
    updatedAt: profile?.updatedAt,
  };
}

function cleanText(value: string, maxLength: number) {
  return value.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function cleanList(value: unknown[], limit: number, maxLength: number) {
  return Array.from(
    new Set(
      value
        .filter((item): item is string => typeof item === "string")
        .map((item) => cleanText(item, maxLength))
        .filter(Boolean),
    ),
  ).slice(0, limit);
}

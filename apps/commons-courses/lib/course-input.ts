import { normalizeCourseAgents } from "@/lib/course-agent-defaults";
import {
  getLiveScheduleSummary,
  normalizeCourseStartDate,
  type LiveSchedule,
} from "@/lib/course-schedule";
import { sanitizeRichTextHtml } from "@/lib/rich-text";
import type { CourseAgentConfig } from "@/types/course-agent";
import type {
  AgentSandboxCapability,
  AgentSandboxConfig,
  AgentSandboxStepTarget,
  SkillPack,
} from "@/types/skills";

export type AccessCodeInput = {
  id?: string;
  code?: string;
  label?: string;
  active?: boolean;
  amountType?: "percent" | "fixed";
  amount?: number;
  maxRedemptions?: number;
  redeemedCount?: number;
  expiresAt?: string | Date;
};

export type AffiliateInput = {
  id?: string;
  code?: string;
  name?: string;
  active?: boolean;
  commissionType?: "percent" | "fixed";
  commissionAmount?: number;
  conversions?: number;
};

export type EarlyPaymentDiscountInput = {
  id?: string;
  label?: string;
  active?: boolean;
  amountType?: "percent" | "fixed";
  amount?: number;
  deadline?: string | Date;
  maxRedemptions?: number;
  redeemedCount?: number;
};

export type CourseInput = {
  title?: string;
  slug?: string;
  tagline?: string;
  description?: string;
  longDescription?: string;
  price?: number;
  currency?: string;
  isFree?: boolean;
  courseType?: "self-paced" | "live";
  startDate?: string | Date | null;
  nextSessionDate?: string | Date | null;
  sessionDates?: Array<string | Date>;
  liveSchedule?: LiveSchedule;
  maxEnrollments?: number;
  liveSessionUrl?: string;
  level?: "beginner" | "intermediate" | "advanced";
  duration?: string;
  instructor?: string;
  tags?: string[];
  imageUrl?: string;
  bannerImageUrl?: string;
  previewImageUrl?: string;
  modules?: Array<{
    title: string;
    description?: string;
    assignment?: string;
    lessons: Array<{
      title: string;
      duration: string;
      description?: string;
      assetUrl?: string;
      assetAlt?: string;
      isFree?: boolean;
    }>;
  }>;
  skillPack?: SkillPack;
  skillPacks?: SkillPack[];
  agents?: CourseAgentConfig[];
  published?: boolean;
  isMainFeatured?: boolean;
  isFeatured?: boolean;
  paymentProviders?: ("stripe" | "paystack")[];
  installmentPlan?: {
    enabled?: boolean;
    label?: string;
    installmentAmount?: number;
    installmentCount?: number;
    releaseAccess?:
      | "full_after_first_payment"
      | "module_by_module"
      | "full_after_completion";
  };
  accessProgram?: {
    discounts?: AccessCodeInput[];
    earlyPaymentDiscounts?: EarlyPaymentDiscountInput[];
    scholarships?: AccessCodeInput[];
    passes?: AccessCodeInput[];
    affiliates?: AffiliateInput[];
  };
  emailSettings?: {
    welcomeEnabled?: boolean;
    enrollmentEnabled?: boolean;
    assignmentCreatedEnabled?: boolean;
    assignmentUpdatedEnabled?: boolean;
    courseUpdateEnabled?: boolean;
    agentManaged?: boolean;
    replyTo?: string;
    customIntro?: string;
  };
};

function makeId(prefix: string, code?: string) {
  const base = (code || Math.random().toString(36).slice(2, 8))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `${prefix}-${base || Date.now()}`;
}

function normalizeCode(code?: string) {
  return (code || "").trim().toUpperCase();
}

function normalizeImageUrl(value?: string) {
  const url = value?.trim();
  if (!url) return undefined;
  return url;
}

const sandboxCapabilities: AgentSandboxCapability[] = [
  "identity",
  "system_prompt",
  "skills",
  "tools",
  "connectors",
  "tasks",
  "workflows",
  "chat",
  "logs",
  "credits",
];

const sandboxTargets: AgentSandboxStepTarget[] = [
  "identity",
  "system_prompt",
  "skills",
  "tools",
  "connectors",
  "tasks",
  "workflows",
  "chat",
  "logs",
  "publish",
];

function normalizeSandboxConfig(input?: AgentSandboxConfig) {
  if (!input?.enabled) return undefined;
  const capabilities = Array.isArray(input.capabilities)
    ? input.capabilities.filter((capability): capability is AgentSandboxCapability =>
        sandboxCapabilities.includes(capability)
      )
    : [];

  return {
    enabled: true,
    mode: ["simple", "builder", "full"].includes(input.mode) ? input.mode : "builder",
    title: input.title?.trim() || "Agent learner sandbox",
    brief: sanitizeRichTextHtml(input.brief) || undefined,
    capabilities: capabilities.length
      ? capabilities
      : ["identity", "system_prompt", "skills", "tools", "chat", "logs"],
    requiredCapabilities: Array.isArray(input.requiredCapabilities)
      ? input.requiredCapabilities.filter((capability): capability is AgentSandboxCapability =>
          sandboxCapabilities.includes(capability)
        )
      : ["identity", "system_prompt", "skills", "tools", "chat"],
    guideSteps: Array.isArray(input.guideSteps)
      ? input.guideSteps
          .map((step, index) => ({
            id: step.id?.trim() || `step-${index + 1}`,
            target: sandboxTargets.includes(step.target) ? step.target : "identity",
            title: step.title?.trim() || `Step ${index + 1}`,
            body: step.body?.trim() || "",
          }))
          .filter((step) => step.body)
      : [],
    starterAgent: input.starterAgent
      ? {
          name: input.starterAgent.name?.trim() || undefined,
          persona: input.starterAgent.persona?.trim() || undefined,
          systemPrompt: input.starterAgent.systemPrompt?.trim() || undefined,
        }
      : undefined,
    skillTemplates: Array.isArray(input.skillTemplates)
      ? input.skillTemplates
          .map((skill, index) => ({
            id: skill.id?.trim() || `skill-${index + 1}`,
            name: skill.name?.trim() || "",
            instructions: skill.instructions?.trim() || "",
          }))
          .filter((skill) => skill.name && skill.instructions)
      : [],
    toolTemplates: Array.isArray(input.toolTemplates)
      ? input.toolTemplates
          .map((tool, index) => ({
            id: tool.id?.trim() || `tool-${index + 1}`,
            name: tool.name?.trim() || "",
            description: tool.description?.trim() || undefined,
            connectorKind:
              tool.connectorKind &&
              [
                "google_calendar",
                "gmail",
                "google_drive",
                "google_sheets",
                "github",
                "custom",
              ].includes(tool.connectorKind)
                ? tool.connectorKind
                : "custom",
            simulated: tool.simulated !== false,
          }))
          .filter((tool) => tool.name)
      : [],
    review: input.review?.enabled
      ? {
          enabled: true,
          targets: Array.isArray(input.review.targets)
            ? input.review.targets.filter((target) =>
                ["system_prompt", "skills"].includes(target)
              )
            : ["system_prompt"],
          minScore:
            typeof input.review.minScore === "number"
              ? Math.max(0, Math.min(100, Math.floor(input.review.minScore)))
              : 70,
          rubric:
            input.review.rubric?.trim() ||
            "Score clarity, persona, goal, boundaries, tool-use safety, and whether the instructions are specific enough for a beginner agent.",
          model: input.review.model?.trim() || undefined,
        }
      : undefined,
    creditReward:
      typeof input.creditReward === "number" && input.creditReward > 0
        ? Math.floor(input.creditReward)
        : 0,
    completionEventType:
      input.completionEventType?.trim() || "agent_sandbox_completed",
  };
}

function normalizeSkillPack(input?: SkillPack) {
  if (!input) return undefined;
  const challenges = Array.isArray(input.challenges) ? input.challenges : [];

  return {
    slug: input.slug?.trim() || undefined,
    enabled: Boolean(input.enabled),
    title: input.title?.trim() || "Daily challenges",
    subtitle: input.subtitle?.trim() || undefined,
    learnerPromise: sanitizeRichTextHtml(input.learnerPromise) || undefined,
    challenges: challenges
      .map((challenge, index) => ({
        id: challenge.id?.trim() || `challenge-${index + 1}`,
        day:
          typeof challenge.day === "number" && challenge.day > 0
            ? Math.floor(challenge.day)
            : index + 1,
        title: challenge.title?.trim() || `Day ${index + 1}`,
        shortTitle: challenge.shortTitle?.trim() || undefined,
        minutes:
          typeof challenge.minutes === "number" && challenge.minutes > 0
            ? Math.floor(challenge.minutes)
            : 5,
        points:
          typeof challenge.points === "number" && challenge.points > 0
            ? Math.floor(challenge.points)
            : 10,
        streakBoost:
          typeof challenge.streakBoost === "number" && challenge.streakBoost >= 0
            ? Math.floor(challenge.streakBoost)
            : 1,
        assetUrl: normalizeImageUrl(challenge.assetUrl),
        assetAlt: challenge.assetAlt?.trim() || undefined,
        accentColor: challenge.accentColor?.trim() || undefined,
        audioCue: ["spark", "focus", "complete"].includes(challenge.audioCue || "")
          ? challenge.audioCue
          : "focus",
        hook: sanitizeRichTextHtml(challenge.hook) || undefined,
        lesson: sanitizeRichTextHtml(challenge.lesson),
        keyIdeas: Array.isArray(challenge.keyIdeas)
          ? challenge.keyIdeas.map((idea) => idea.trim()).filter(Boolean)
          : [],
        microTask: challenge.microTask?.trim() || undefined,
        practicalSignal: challenge.practicalSignal
          ? {
              ...challenge.practicalSignal,
              id: challenge.practicalSignal.id?.trim(),
              eventType: challenge.practicalSignal.eventType?.trim(),
              label: challenge.practicalSignal.label?.trim(),
              description: challenge.practicalSignal.description?.trim() || undefined,
            }
          : undefined,
        sandbox: normalizeSandboxConfig(challenge.sandbox),
        questions: Array.isArray(challenge.questions)
          ? challenge.questions.map((question, questionIndex) => ({
              id: question.id?.trim() || `q${questionIndex + 1}`,
              prompt: question.prompt?.trim() || "",
              options: Array.isArray(question.options)
                ? question.options.map((option) => option.trim()).filter(Boolean)
                : [],
              answerIndex:
                typeof question.answerIndex === "number" && question.answerIndex >= 0
                  ? Math.floor(question.answerIndex)
                  : 0,
              explanation: question.explanation?.trim() || undefined,
            }))
          : [],
      }))
      .filter(
        (challenge) =>
          challenge.title &&
          challenge.lesson &&
          (challenge.sandbox?.enabled ||
            challenge.questions.every(
              (question) =>
                question.prompt &&
                question.options.length >= 2 &&
                question.answerIndex < question.options.length
            ))
      ),
  };
}

function normalizeSkillPacks(input?: SkillPack[]) {
  if (!Array.isArray(input)) return [];
  const packs = input
    .map((pack, index) => {
      const normalized = normalizeSkillPack(pack);
      if (!normalized) return null;
      return {
        ...normalized,
        slug:
          normalized.slug ||
          normalized.title
            ?.toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-|-$/g, "") ||
          `skill-path-${index + 1}`,
      };
    });

  return packs.filter(
    (pack): pack is Exclude<(typeof packs)[number], null> => Boolean(pack)
  );
}

function normalizeAccessCodes(
  items: AccessCodeInput[] | undefined,
  prefix: string,
  fallbackAmountType: "percent" | "fixed",
  fallbackAmount: number
) {
  if (!Array.isArray(items)) return [];

  return items
    .map((item) => {
      const code = normalizeCode(item.code);
      if (!code) return null;
      const amountType = item.amountType === "fixed" ? "fixed" : fallbackAmountType;
      const amount =
        typeof item.amount === "number" && Number.isFinite(item.amount)
          ? Math.max(0, item.amount)
          : fallbackAmount;
      return {
        id: item.id || makeId(prefix, code),
        code,
        label: item.label?.trim(),
        active: item.active !== false,
        amountType,
        amount,
        maxRedemptions:
          typeof item.maxRedemptions === "number" && item.maxRedemptions > 0
            ? Math.floor(item.maxRedemptions)
            : undefined,
        redeemedCount:
          typeof item.redeemedCount === "number" && item.redeemedCount > 0
            ? Math.floor(item.redeemedCount)
            : 0,
        expiresAt: item.expiresAt || undefined,
      };
    })
    .filter(Boolean);
}

function normalizeAffiliates(items: AffiliateInput[] | undefined) {
  if (!Array.isArray(items)) return [];

  return items
    .map((item) => {
      const code = normalizeCode(item.code);
      const name = item.name?.trim();
      if (!code || !name) return null;
      return {
        id: item.id || makeId("affiliate", code),
        code,
        name,
        active: item.active !== false,
        commissionType: item.commissionType === "fixed" ? "fixed" : "percent",
        commissionAmount:
          typeof item.commissionAmount === "number" &&
          Number.isFinite(item.commissionAmount)
            ? Math.max(0, item.commissionAmount)
            : 10,
        conversions:
          typeof item.conversions === "number" && item.conversions > 0
            ? Math.floor(item.conversions)
            : 0,
      };
    })
    .filter(Boolean);
}

function normalizeEarlyPaymentDiscounts(
  items: EarlyPaymentDiscountInput[] | undefined
) {
  if (!Array.isArray(items)) return [];

  return items
    .map((item) => {
      const deadline = item.deadline ? new Date(item.deadline) : null;
      if (!deadline || Number.isNaN(deadline.getTime())) return null;
      return {
        id: item.id || makeId("early", item.label || deadline.toISOString()),
        label: item.label?.trim(),
        active: item.active !== false,
        amountType: item.amountType === "fixed" ? "fixed" : "percent",
        amount:
          typeof item.amount === "number" && Number.isFinite(item.amount)
            ? Math.max(0, item.amount)
            : 10,
        deadline,
        maxRedemptions:
          typeof item.maxRedemptions === "number" && item.maxRedemptions > 0
            ? Math.floor(item.maxRedemptions)
            : undefined,
        redeemedCount:
          typeof item.redeemedCount === "number" && item.redeemedCount > 0
            ? Math.floor(item.redeemedCount)
            : 0,
      };
    })
    .filter(Boolean);
}

export function normalizeAccessProgramInput(input: CourseInput["accessProgram"]) {
  return {
    discounts: normalizeAccessCodes(input?.discounts, "discount", "percent", 10),
    earlyPaymentDiscounts: normalizeEarlyPaymentDiscounts(
      input?.earlyPaymentDiscounts
    ),
    scholarships: normalizeAccessCodes(
      input?.scholarships,
      "scholarship",
      "percent",
      100
    ),
    passes: normalizeAccessCodes(input?.passes, "pass", "percent", 100),
    affiliates: normalizeAffiliates(input?.affiliates),
  };
}

export function normalizeCourseInput(input: CourseInput) {
  const modules = Array.isArray(input.modules)
    ? input.modules.map((module) => ({
        ...module,
        description: sanitizeRichTextHtml(module.description) || undefined,
        assignment: sanitizeRichTextHtml(module.assignment) || undefined,
        lessons: Array.isArray(module.lessons)
          ? module.lessons.map((lesson) => ({
              ...lesson,
              description: sanitizeRichTextHtml(lesson.description) || undefined,
              assetUrl: normalizeImageUrl(lesson.assetUrl),
              assetAlt: lesson.assetAlt?.trim() || undefined,
            }))
          : [],
      }))
    : [];
  const sessionDates = Array.isArray(input.sessionDates)
    ? input.sessionDates
        .map((value) => normalizeCourseStartDate(value))
        .filter((value): value is Date => Boolean(value))
    : [];
  const lessonsCount = modules.reduce(
    (sum, module) => sum + (module.lessons?.length || 0),
    0
  );

  return {
    ...input,
    currency: (input.currency || "USD").toUpperCase(),
    price: Number(input.price || 0),
    longDescription: sanitizeRichTextHtml(input.longDescription),
    isFree: Boolean(input.isFree || Number(input.price || 0) <= 0),
    courseType: input.courseType || "self-paced",
    startDate: normalizeCourseStartDate(input.startDate),
    nextSessionDate: normalizeCourseStartDate(input.nextSessionDate),
    sessionDates,
    liveSchedule: normalizeLiveSchedule(input.liveSchedule),
    maxEnrollments:
      typeof input.maxEnrollments === "number" && input.maxEnrollments > 0
        ? Math.floor(input.maxEnrollments)
        : undefined,
    liveSessionUrl: input.liveSessionUrl?.trim() || undefined,
    level: input.level || "beginner",
    tags: Array.isArray(input.tags) ? input.tags : [],
    imageUrl: normalizeImageUrl(input.imageUrl),
    bannerImageUrl: normalizeImageUrl(input.bannerImageUrl),
    previewImageUrl: normalizeImageUrl(input.previewImageUrl),
    modules,
    skillPack: normalizeSkillPack(input.skillPack),
    skillPacks: normalizeSkillPacks(input.skillPacks),
    agents: normalizeCourseAgents(input.agents),
    modulesCount: modules.length,
    lessonsCount,
    paymentProviders: input.paymentProviders?.length
      ? input.paymentProviders
      : ["stripe"],
    installmentPlan: {
      enabled: Boolean(input.installmentPlan?.enabled),
      label: input.installmentPlan?.label || "Lipa mdogo mdogo",
      installmentAmount: input.installmentPlan?.installmentAmount,
      installmentCount: input.installmentPlan?.installmentCount || 4,
      releaseAccess:
        input.installmentPlan?.releaseAccess || "module_by_module",
    },
    accessProgram: normalizeAccessProgramInput(input.accessProgram),
    emailSettings: {
      welcomeEnabled: input.emailSettings?.welcomeEnabled !== false,
      enrollmentEnabled: input.emailSettings?.enrollmentEnabled !== false,
      assignmentCreatedEnabled:
        input.emailSettings?.assignmentCreatedEnabled !== false,
      assignmentUpdatedEnabled:
        input.emailSettings?.assignmentUpdatedEnabled !== false,
      courseUpdateEnabled: Boolean(input.emailSettings?.courseUpdateEnabled),
      agentManaged: Boolean(input.emailSettings?.agentManaged),
      replyTo: input.emailSettings?.replyTo?.trim() || undefined,
      customIntro: input.emailSettings?.customIntro?.trim() || undefined,
    },
  };
}

function normalizeLiveSchedule(input?: LiveSchedule) {
  if (!input) return undefined;
  const cadence = ["weekly", "biweekly", "monthly", "custom"].includes(
    input.cadence || ""
  )
    ? input.cadence
    : "weekly";
  const dayOfWeek = input.dayOfWeek?.toLowerCase();
  const normalized = {
    cadence,
    dayOfWeek:
      dayOfWeek &&
      [
        "monday",
        "tuesday",
        "wednesday",
        "thursday",
        "friday",
        "saturday",
        "sunday",
      ].includes(dayOfWeek)
        ? dayOfWeek
        : undefined,
    time: input.time?.trim() || undefined,
    timezone: input.timezone?.trim() || undefined,
    sessionsCount:
      typeof input.sessionsCount === "number" && input.sessionsCount > 0
        ? Math.floor(input.sessionsCount)
        : undefined,
    description: input.description?.trim() || undefined,
  } satisfies LiveSchedule;

  return getLiveScheduleSummary(normalized) ? normalized : undefined;
}

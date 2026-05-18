import { normalizeCourseAgents } from "@/lib/course-agent-defaults";
import { normalizeCourseStartDate } from "@/lib/course-schedule";
import type { CourseAgentConfig } from "@/types/course-agent";

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
      isFree?: boolean;
    }>;
  }>;
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
  const modules = Array.isArray(input.modules) ? input.modules : [];
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
    isFree: Boolean(input.isFree || Number(input.price || 0) <= 0),
    courseType: input.courseType || "self-paced",
    startDate: normalizeCourseStartDate(input.startDate),
    nextSessionDate: normalizeCourseStartDate(input.nextSessionDate),
    sessionDates,
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

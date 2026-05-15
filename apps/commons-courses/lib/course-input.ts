import { normalizeCourseAgents } from "@/lib/course-agent-defaults";
import type { CourseAgentConfig } from "@/types/course-agent";

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
  level?: "beginner" | "intermediate" | "advanced";
  duration?: string;
  instructor?: string;
  tags?: string[];
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
};

export function normalizeCourseInput(input: CourseInput) {
  const modules = Array.isArray(input.modules) ? input.modules : [];
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
    level: input.level || "beginner",
    tags: Array.isArray(input.tags) ? input.tags : [],
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
  };
}

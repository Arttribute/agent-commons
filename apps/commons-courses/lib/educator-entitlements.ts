import "server-only";

import {
  isPaidEducatorPlan,
  normalizeEmailBranding,
  type EmailBranding,
} from "@/lib/email/branding";
import Course from "@/models/Course";
import EducatorProfile from "@/models/EducatorProfile";
import type { ICourse } from "@/models/Course";

export async function canUseCustomEmailBranding(
  course: Pick<ICourse, "educator">,
) {
  const ownerId = course.educator?.userId;
  if (!ownerId) return false;
  const profile = await EducatorProfile.findOne({
    userId: ownerId,
  })
    .select("plan status")
    .lean<{ plan?: string; status?: string }>();
  if (profile) {
    return profile.status === "active" && isPaidEducatorPlan(profile.plan);
  }
  return isPaidEducatorPlan(course.educator?.plan);
}

export async function resolveCourseEmailBranding(
  courseId?: string,
  input?: Partial<EmailBranding> | null,
) {
  const branding = normalizeEmailBranding(input);
  if (!courseId || !branding.enabled) return undefined;
  const course = await Course.findById(courseId).select("educator");
  if (!course || !(await canUseCustomEmailBranding(course))) return undefined;
  return branding;
}

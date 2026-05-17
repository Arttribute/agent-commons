import crypto from "crypto";
import type { NextRequest } from "next/server";
import type mongoose from "mongoose";
import AnalyticsEvent from "@/models/AnalyticsEvent";
import Course from "@/models/Course";
import Enrollment from "@/models/Enrollment";
import Payment from "@/models/Payment";
import Submission from "@/models/Submission";

export type TrackAnalyticsInput = {
  eventType: string;
  userId?: string;
  anonymousId?: string;
  sessionId?: string;
  courseId?: string | mongoose.Types.ObjectId;
  courseSlug?: string;
  page?: string;
  path?: string;
  source?: string;
  referrer?: string;
  provider?: "stripe" | "paystack";
  paymentPlan?: "one_time" | "installment";
  accessCode?: string;
  accessCodeType?: "discount" | "early_payment" | "scholarship" | "pass";
  affiliateCode?: string;
  originalAmount?: number;
  finalAmount?: number;
  discountAmount?: number;
  currency?: string;
  moduleIndex?: number;
  lessonIndex?: number;
  metadata?: Record<string, unknown>;
  request?: NextRequest;
};

export async function trackAnalyticsEvent(input: TrackAnalyticsInput) {
  try {
    const request = input.request;
    await AnalyticsEvent.create({
      eventType: input.eventType,
      userId: input.userId,
      anonymousId: input.anonymousId,
      sessionId: input.sessionId,
      courseId: input.courseId,
      courseSlug: input.courseSlug,
      page: input.page,
      path: input.path,
      source: input.source,
      referrer: input.referrer,
      provider: input.provider,
      paymentPlan: input.paymentPlan,
      accessCode: normalizeCode(input.accessCode),
      accessCodeType: input.accessCodeType,
      affiliateCode: normalizeCode(input.affiliateCode),
      originalAmount: input.originalAmount,
      finalAmount: input.finalAmount,
      discountAmount: input.discountAmount,
      currency: input.currency?.toLowerCase(),
      moduleIndex: input.moduleIndex,
      lessonIndex: input.lessonIndex,
      metadata: scrubMetadata(input.metadata),
      userAgent: request?.headers.get("user-agent") || undefined,
      ipHash: hashIp(getRequestIp(request)),
    });
  } catch (err) {
    console.error("Analytics event write failed", err);
  }
}

export async function buildCourseAnalyticsSummary({
  courseId,
  courseSlug,
  days = 30,
}: {
  courseId: string | mongoose.Types.ObjectId;
  courseSlug?: string;
  days?: number;
}) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const courseMatch = { courseId, createdAt: { $gte: since } };
  const [events, payments, enrollments, submissions] = await Promise.all([
    AnalyticsEvent.find(courseMatch).lean(),
    Payment.find({ courseId, createdAt: { $gte: since } }).lean(),
    Enrollment.find({ courseId }).lean(),
    Submission.find({ courseId, createdAt: { $gte: since } }).lean(),
  ]);

  const completedPayments = payments.filter((payment) => payment.status === "completed");
  const pendingPayments = payments.filter((payment) => payment.status === "pending");
  const stalePendingPayments = pendingPayments.filter((payment) =>
    isStalePending(payment.createdAt)
  );
  const checkoutStarts = events.filter((event) => event.eventType === "checkout_started");
  const courseViews = events.filter((event) => event.eventType === "page_view");
  const lessonViews = events.filter((event) => event.eventType === "lesson_view");
  const lessonCompletions = events.filter((event) => event.eventType === "lesson_completed");
  const uniqueVisitors = new Set(
    events.map((event) => event.userId?.toString() || event.anonymousId).filter(Boolean)
  ).size;
  const totalRevenue = completedPayments.reduce((sum, payment) => sum + payment.amount, 0);
  const totalDiscounts = payments.reduce(
    (sum, payment) => sum + (payment.discountAmount || 0),
    0
  );
  const originalRevenue = payments.reduce(
    (sum, payment) => sum + (payment.originalAmount || payment.amount || 0),
    0
  );
  const averageProgress =
    enrollments.length > 0
      ? Math.round(
          enrollments.reduce((sum, enrollment) => sum + (enrollment.progress || 0), 0) /
            enrollments.length
        )
      : 0;

  return {
    windowDays: days,
    courseSlug,
    totals: {
      events: events.length,
      uniqueVisitors,
      courseViews: courseViews.length,
      lessonViews: lessonViews.length,
      lessonCompletions: lessonCompletions.length,
      enrollments: enrollments.length,
      submissions: submissions.length,
      completedPayments: completedPayments.length,
      pendingPayments: pendingPayments.length,
      stalePendingPayments: stalePendingPayments.length,
      grossRevenue: totalRevenue,
      discountsGiven: totalDiscounts,
      effectiveDiscountRate:
        originalRevenue > 0 ? Math.round((totalDiscounts / originalRevenue) * 100) : 0,
      averageProgress,
    },
    funnels: {
      viewToCheckoutRate: rate(checkoutStarts.length, courseViews.length),
      checkoutCompletionRate: rate(completedPayments.length, checkoutStarts.length),
      pendingAbandonmentRate: rate(stalePendingPayments.length, checkoutStarts.length),
      lessonCompletionRate: rate(lessonCompletions.length, lessonViews.length),
    },
    breakdowns: {
      eventsByType: countBy(events, "eventType"),
      pages: countBy(events, "page"),
      sources: countBy(events, "source"),
      providers: countBy(payments, "provider"),
      paymentStatus: countBy(payments, "status"),
      paymentPlans: countBy(payments, "paymentPlan"),
      accessCodes: countBy(payments, "accessCode"),
      affiliates: countBy(payments, "affiliateCode"),
    },
    recentPendingPayments: stalePendingPayments.slice(0, 10).map((payment) => ({
      provider: payment.provider,
      paymentPlan: payment.paymentPlan,
      amount: payment.amount,
      currency: payment.currency,
      accessCode: payment.accessCode,
      affiliateCode: payment.affiliateCode,
      createdAt: payment.createdAt,
    })),
  };
}

export async function buildEducatorAnalyticsSummary({
  courseIds,
  days = 30,
}: {
  courseIds: Array<string | mongoose.Types.ObjectId>;
  days?: number;
}) {
  const summaries = await Promise.all(
    courseIds.map((courseId) => buildCourseAnalyticsSummary({ courseId, days }))
  );
  return {
    windowDays: days,
    totals: summaries.reduce(
      (acc, item) => ({
        courseViews: acc.courseViews + item.totals.courseViews,
        uniqueVisitors: acc.uniqueVisitors + item.totals.uniqueVisitors,
        enrollments: acc.enrollments + item.totals.enrollments,
        completedPayments: acc.completedPayments + item.totals.completedPayments,
        pendingPayments: acc.pendingPayments + item.totals.pendingPayments,
        stalePendingPayments: acc.stalePendingPayments + item.totals.stalePendingPayments,
        grossRevenue: acc.grossRevenue + item.totals.grossRevenue,
        discountsGiven: acc.discountsGiven + item.totals.discountsGiven,
        submissions: acc.submissions + item.totals.submissions,
      }),
      {
        courseViews: 0,
        uniqueVisitors: 0,
        enrollments: 0,
        completedPayments: 0,
        pendingPayments: 0,
        stalePendingPayments: 0,
        grossRevenue: 0,
        discountsGiven: 0,
        submissions: 0,
      }
    ),
    courses: summaries,
  };
}

export async function buildCourseAnalyticsForAgent(courseId: string | mongoose.Types.ObjectId) {
  const summary = await buildCourseAnalyticsSummary({ courseId, days: 30 });
  return {
    windowDays: summary.windowDays,
    totals: summary.totals,
    funnels: summary.funnels,
    topSources: summary.breakdowns.sources.slice(0, 5),
    paymentStatus: summary.breakdowns.paymentStatus,
    accessCodes: summary.breakdowns.accessCodes.slice(0, 8),
    affiliates: summary.breakdowns.affiliates.slice(0, 8),
    note:
      "Aggregated educator analytics only. Raw learner identities, payment references, and private rows are intentionally excluded.",
  };
}

export async function resolveAnalyticsCourseId(courseSlug?: string) {
  if (!courseSlug) return null;
  const course = (await Course.findOne({ slug: courseSlug })
    .select("_id")
    .lean()) as { _id?: mongoose.Types.ObjectId } | null;
  return course?._id || null;
}

function countBy<T extends Record<string, unknown>>(items: T[], key: keyof T) {
  const counts = new Map<string, number>();
  for (const item of items) {
    const value = item[key];
    const label = typeof value === "string" && value.trim() ? value : "unknown";
    counts.set(label, (counts.get(label) || 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);
}

function rate(numerator: number, denominator: number) {
  if (!denominator) return 0;
  return Math.round((numerator / denominator) * 100);
}

function isStalePending(createdAt?: Date) {
  if (!createdAt) return false;
  return Date.now() - new Date(createdAt).getTime() > 30 * 60 * 1000;
}

function normalizeCode(value?: string) {
  return value?.trim().toUpperCase() || undefined;
}

function scrubMetadata(metadata?: Record<string, unknown>) {
  if (!metadata) return undefined;
  const blocked = new Set(["email", "learnerEmail", "password", "token"]);
  return Object.fromEntries(
    Object.entries(metadata)
      .filter(([key]) => !blocked.has(key))
      .slice(0, 30)
  );
}

function getRequestIp(request?: NextRequest) {
  return (
    request?.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request?.headers.get("x-real-ip") ||
    undefined
  );
}

function hashIp(ip?: string) {
  if (!ip) return undefined;
  return crypto.createHash("sha256").update(ip).digest("hex").slice(0, 24);
}

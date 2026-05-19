const DAY_MS = 24 * 60 * 60 * 1000;

export const INSTALLMENT_INTERVAL_DAYS = 7;
export const INSTALLMENT_GRACE_PERIOD_DAYS = 3;

type InstallmentCourse = {
  price: number;
  startDate?: Date | string | null;
  installmentPlan?: {
    enabled?: boolean;
    installmentCount?: number;
  };
};

type InstallmentEnrollment = {
  paymentStatus?: "free" | "paid" | "partial" | "overdue";
  paidAmount?: number;
  totalAmountDue?: number;
  currentInstallment?: number;
  paymentGraceEndsAt?: Date | string | null;
};

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * DAY_MS);
}

function normalizeDate(value?: Date | string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function getInstallmentCount(course: InstallmentCourse) {
  return course.installmentPlan?.installmentCount || 2;
}

export function getNextInstallmentSchedule({
  course,
  currentInstallment,
  completedAt,
}: {
  course: InstallmentCourse;
  currentInstallment: number;
  completedAt: Date;
}) {
  const installmentCount = getInstallmentCount(course);
  if (currentInstallment >= installmentCount) return null;

  const courseStart = normalizeDate(course.startDate);
  const dueBase = courseStart || completedAt;
  const dueAt = addDays(dueBase, INSTALLMENT_INTERVAL_DAYS * currentInstallment);
  const nextPaymentDueAt =
    dueAt.getTime() < completedAt.getTime() ? completedAt : dueAt;

  return {
    nextPaymentDueAt,
    paymentGraceEndsAt: addDays(
      nextPaymentDueAt,
      INSTALLMENT_GRACE_PERIOD_DAYS
    ),
  };
}

export function isInstallmentOverdue(
  enrollment: InstallmentEnrollment,
  now = new Date()
) {
  if (enrollment.paymentStatus !== "partial") return false;
  if ((enrollment.paidAmount || 0) >= (enrollment.totalAmountDue || 0)) {
    return false;
  }

  const graceEndsAt = normalizeDate(enrollment.paymentGraceEndsAt);
  return Boolean(graceEndsAt && graceEndsAt.getTime() <= now.getTime());
}

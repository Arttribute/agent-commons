export function normalizeCourseStartDate(value?: string | Date | null) {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return date;
}

export function isCourseStarted(startDate?: string | Date | null, now = new Date()) {
  const date = normalizeCourseStartDate(startDate);
  return !date || date.getTime() <= now.getTime();
}

export function formatCourseStartDate(value?: string | Date | null) {
  const date = normalizeCourseStartDate(value);
  if (!date) return null;

  return new Intl.DateTimeFormat("en", {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

export function getCourseStartStatus(
  startDate?: string | Date | null,
  now = new Date()
) {
  const date = normalizeCourseStartDate(startDate);
  if (!date || date.getTime() <= now.getTime()) {
    return { started: true, startDate: date, label: null };
  }

  return {
    started: false,
    startDate: date,
    label: formatCourseStartDate(date),
  };
}

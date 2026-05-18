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

export type LiveSchedule = {
  cadence?: "weekly" | "biweekly" | "monthly" | "custom";
  dayOfWeek?: string;
  time?: string;
  timezone?: string;
  sessionsCount?: number;
  description?: string;
};

const dayLabels: Record<string, string> = {
  monday: "Mondays",
  tuesday: "Tuesdays",
  wednesday: "Wednesdays",
  thursday: "Thursdays",
  friday: "Fridays",
  saturday: "Saturdays",
  sunday: "Sundays",
};

const cadenceLabels: Record<NonNullable<LiveSchedule["cadence"]>, string> = {
  weekly: "Weekly",
  biweekly: "Every other week",
  monthly: "Monthly",
  custom: "Custom schedule",
};

export function formatLiveScheduleTime(time?: string) {
  if (!time) return null;
  const [hourValue, minuteValue = "0"] = time.split(":");
  const hour = Number(hourValue);
  const minute = Number(minuteValue);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return time;

  return new Intl.DateTimeFormat("en", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(Date.UTC(2026, 0, 1, hour, minute)));
}

export function getLiveScheduleSummary(schedule?: LiveSchedule | null) {
  if (!schedule) return null;
  if (schedule.description?.trim()) return schedule.description.trim();

  const cadence = schedule.cadence ? cadenceLabels[schedule.cadence] : null;
  const day = schedule.dayOfWeek
    ? dayLabels[schedule.dayOfWeek.toLowerCase()]
    : null;
  const time = formatLiveScheduleTime(schedule.time);
  const timezone = schedule.timezone?.trim();
  const sessions =
    typeof schedule.sessionsCount === "number" && schedule.sessionsCount > 0
      ? `${schedule.sessionsCount} live class${
          schedule.sessionsCount === 1 ? "" : "es"
        }`
      : null;

  const timing = [day, [time, timezone].filter(Boolean).join(" ") || null]
    .filter(Boolean)
    .join(" at ");
  const parts = [cadence, timing, sessions ? `for ${sessions}` : null].filter(
    Boolean
  );

  return parts.length ? parts.join(" ") : null;
}

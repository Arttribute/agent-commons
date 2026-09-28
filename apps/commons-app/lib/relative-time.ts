/** "3 minutes ago", "yesterday", or a short date for older times. */
export function relativeTime(value: string | number | Date | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  const seconds = Math.round((date.getTime() - Date.now()) / 1_000);
  if (!Number.isFinite(seconds)) return "";
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  const magnitude = Math.abs(seconds);
  if (magnitude < 45) return "just now";
  if (magnitude < 3_600) return formatter.format(Math.round(seconds / 60), "minute");
  if (magnitude < 86_400) return formatter.format(Math.round(seconds / 3_600), "hour");
  if (magnitude < 7 * 86_400) return formatter.format(Math.round(seconds / 86_400), "day");
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: date.getFullYear() === new Date().getFullYear() ? undefined : "numeric" });
}

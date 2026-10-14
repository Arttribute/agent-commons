/** Chat-list timestamps: "now", "5m", "3h", "2d", then a short date. */
export function shortTime(value?: string | number | Date | null, now = Date.now()): string {
  if (!value) return "";
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return "";
  const minutes = Math.floor(Math.max(0, now - time) / 60_000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  const date = new Date(time);
  const sameYear = date.getFullYear() === new Date(now).getFullYear();
  return date.toLocaleDateString(undefined, sameYear ? { month: "short", day: "numeric" } : { month: "short", day: "numeric", year: "numeric" });
}

/** When a reply was sent, for chat messages: "2:14 PM", "Yesterday 2:14 PM", "Mon 2:14 PM", "Oct 3, 2:14 PM". */
export function messageTime(value?: string | number | Date | null, now = new Date()): string {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const time = date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const day = 86_400_000;
  if (date.getTime() >= startOfToday) return time;
  if (date.getTime() >= startOfToday - day) return `Yesterday ${time}`;
  if (date.getTime() >= startOfToday - 6 * day) return `${date.toLocaleDateString(undefined, { weekday: "short" })} ${time}`;
  const sameYear = date.getFullYear() === now.getFullYear();
  return `${date.toLocaleDateString(undefined, sameYear ? { month: "short", day: "numeric" } : { month: "short", day: "numeric", year: "numeric" })}, ${time}`;
}

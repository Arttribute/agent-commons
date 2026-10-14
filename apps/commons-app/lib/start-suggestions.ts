/**
 * Suggestions under the /new composer. Returning people get suggestions
 * written from their recent chats; new people see what Agent Commons can do,
 * with one idea per connected app.
 */

export type SuggestionKind =
  | "research"
  | "document"
  | "website"
  | "schedule"
  | "data"
  | "image"
  | "agent"
  | "continue";

export type StartSuggestion = {
  id: string;
  /** What the row says. */
  text: string;
  /** What the composer receives. Defaults to the text. */
  prompt?: string;
  /** A connected app this uses, shown with the app's mark. */
  app?: string | null;
  kind?: SuggestionKind;
  /** Opens an existing chat instead of filling the composer. */
  href?: string;
};

const CAPABILITIES: StartSuggestion[] = [
  { id: "cap-research", kind: "research", text: "Research a topic and write me a brief with sources" },
  { id: "cap-website", kind: "website", text: "Build a one-page website and publish it" },
  { id: "cap-briefing", kind: "schedule", text: "Send me a news briefing every weekday morning" },
  { id: "cap-data", kind: "data", text: "Turn a spreadsheet into charts and key takeaways" },
  { id: "cap-deck", kind: "document", text: "Draft a short slide deck from my notes" },
  { id: "cap-image", kind: "image", text: "Design a poster for an upcoming event" },
  { id: "cap-agent", kind: "agent", text: "Create an agent that handles a task I repeat every week" },
];

const APP_IDEAS: Array<{ match: RegExp; app: string; text: string }> = [
  { match: /gmail/i, app: "Gmail", text: "Find emails I can unsubscribe from" },
  { match: /calendar/i, app: "Google Calendar", text: "Prep me for my next meeting" },
  { match: /drive|docs/i, app: "Google Drive", text: "Find my latest docs on a project and summarize them" },
  { match: /github/i, app: "GitHub", text: "Summarize what changed in my repositories this week" },
  { match: /notion/i, app: "Notion", text: "Turn my recent Notion notes into a weekly summary" },
  { match: /hubspot/i, app: "HubSpot", text: "Summarize my open deals and the next step for each" },
];

/** A stable pick that changes once a day, so the list doesn't shuffle on every visit. */
function dailyRotation<T>(items: T[], now: Date, count: number): T[] {
  if (items.length <= count) return items;
  const seed = now.getFullYear() * 400 + now.getMonth() * 31 + now.getDate();
  const start = seed % items.length;
  return Array.from({ length: count }, (_, index) => items[(start + index * 2) % items.length]);
}

/** Ideas for people with no chats yet, or when personal suggestions are unavailable. */
export function capabilitySuggestions(connectedApps: string[], now = new Date(), count = 3): StartSuggestion[] {
  const appIdeas = APP_IDEAS.filter((idea) => connectedApps.some((app) => idea.match.test(app)))
    .slice(0, 1)
    .map((idea) => ({ id: `app-${idea.app}`, text: idea.text, app: idea.app }));
  return [...appIdeas, ...dailyRotation(CAPABILITIES, now, count)].slice(0, count);
}

/** Without personal suggestions, the latest chat is still worth one row. */
export function fallbackSuggestions(
  sessions: Array<{ sessionId: string; title?: string | null }>,
  connectedApps: string[],
  now = new Date(),
): StartSuggestion[] {
  const latest = sessions.find((session) => session.title && !["New chat", "New Session"].includes(session.title));
  const resume: StartSuggestion[] = latest
    ? [{ id: `continue-${latest.sessionId}`, kind: "continue", text: `Continue “${latest.title}”`, href: `/sessions/${encodeURIComponent(latest.sessionId)}` }]
    : [];
  return [...resume, ...capabilitySuggestions(connectedApps, now, 3)].slice(0, 3);
}

/** Cleans what the API returns into at most three rows. */
export function normalizeSuggestions(value: unknown): StartSuggestion[] {
  const list = Array.isArray(value) ? value : Array.isArray((value as any)?.suggestions) ? (value as any).suggestions : [];
  const seen = new Set<string>();
  const out: StartSuggestion[] = [];
  for (const item of list) {
    const text = typeof item?.text === "string" ? item.text.replace(/\s+/g, " ").trim().replace(/^["'“”]+|["'“”]+$/g, "").trim() : "";
    if (!text || text.length > 140 || seen.has(text.toLowerCase())) continue;
    seen.add(text.toLowerCase());
    const prompt = typeof item?.prompt === "string" && item.prompt.trim() ? item.prompt.trim().slice(0, 600) : undefined;
    const app = typeof item?.app === "string" && item.app.trim() ? item.app.trim().slice(0, 40) : null;
    const kind = typeof item?.kind === "string" && ["research", "document", "website", "schedule", "data", "image", "agent"].includes(item.kind) ? (item.kind as SuggestionKind) : undefined;
    out.push({ id: `s-${out.length}-${text.slice(0, 24)}`, text, prompt, app, kind });
    if (out.length === 3) break;
  }
  return out;
}

import { BRAVE_SEARCH_BASE_URL, type LocalSettings } from "@agent-commons/desktop-contract";

export function localWebSearchRequest(settings: Pick<LocalSettings, "webSearchUrl" | "webSearchApiKey">, query: string) {
  if (!settings.webSearchUrl) throw new Error("Configure a search provider first.");
  const brave = settings.webSearchUrl === BRAVE_SEARCH_BASE_URL;
  if (brave && !settings.webSearchApiKey) throw new Error("Brave Search requires an API key.");
  const url = new URL("search", `${settings.webSearchUrl.replace(/\/$/, "")}/`);
  url.searchParams.set("q", query);
  if (brave) url.searchParams.set("count", "5");
  else url.searchParams.set("format", "json");
  const headers = {
    Accept: "application/json",
    ...(settings.webSearchApiKey ? { [brave ? "X-Subscription-Token" : "X-Agent-Commons-Search-Key"]: settings.webSearchApiKey } : {}),
  };
  return { url, headers, brave };
}

export function localWebSearchResults(data: unknown, brave: boolean) {
  const payload = data as {
    results?: Array<{ title?: string; url?: string; content?: string }>;
    web?: { results?: Array<{ title?: string; url?: string; description?: string }> };
  };
  const entries = brave ? payload?.web?.results : payload?.results;
  if (!Array.isArray(entries)) return [];
  return (entries as unknown[])
    .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object")
    .slice(0, 5).map((entry) => {
      const snippet = brave ? entry.description : entry.content;
      return {
        title: typeof entry.title === "string" ? entry.title.slice(0, 300) : undefined,
        url: typeof entry.url === "string" ? entry.url.slice(0, 2_000) : undefined,
        snippet: typeof snippet === "string" ? snippet.slice(0, 700) : undefined,
      };
    });
}

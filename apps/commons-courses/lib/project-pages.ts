import type { ProjectPageFrameData } from "@agent-commons/ui";

export type PublicPage = ProjectPageFrameData & {
  surface: string;
  description: string;
  imageUrl?: string;
};
export const commonsWebUrl = () =>
  (
    process.env.NEXT_PUBLIC_AGENT_COMMONS_APP_URL ||
    "https://www.agentcommons.io"
  ).replace(/\/$/, "");
export const commonsApiUrl = () =>
  (
    process.env.AGENT_COMMONS_API_URL ||
    process.env.NEXT_PUBLIC_AGENT_COMMONS_API_URL ||
    "https://api.agentcommons.io"
  ).replace(/\/$/, "");

export async function publicProjectPage(
  slug: string,
): Promise<PublicPage | null> {
  if (!/^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/.test(slug)) return null;
  const response = await fetch(
    `${commonsApiUrl()}/v1/project-pages/${encodeURIComponent(slug)}`,
    { cache: "no-store", redirect: "error" },
  );
  if (response.status === 404) return null;
  if (!response.ok)
    throw new Error("This page could not be loaded. Please try again.");
  const { data } = await response.json();
  return data?.surface === "commonlab" ? data : null;
}

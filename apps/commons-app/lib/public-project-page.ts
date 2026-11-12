export type PublicProjectPage = {
  slug: string;
  surface: "commons" | "commonlab" | "business";
  title: string;
  description: string;
  publicContext: string;
  chatEnabled: boolean;
  imageUrl?: string;
  chatName?: string;
  chatAvatarUrl?: string;
  chatGreeting?: string;
  registrationUrl?: string;
  entryUrl: string;
  publishedAt: string;
};
/** Published metadata has a dedicated read-only endpoint and carries no service credential. */
export async function fetchPublicProjectPage(
  slug: string,
): Promise<PublicProjectPage | null> {
  if (!/^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/.test(slug)) return null;
  const base = process.env.NEXT_PUBLIC_NEST_API_BASE_URL;
  if (!base) return null;
  const response = await fetch(
    `${base.replace(/\/$/, "")}/v1/project-pages/${encodeURIComponent(slug)}`,
    {
      cache: "no-store",
      headers: { Accept: "application/json" },
      redirect: "error",
    },
  );
  if (response.status === 404) return null;
  if (!response.ok)
    throw new Error("This page could not be loaded. Please try again.");
  const payload = await response.json();
  return payload.data ?? null;
}

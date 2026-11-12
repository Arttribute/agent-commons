import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  EventRegistrationExperience,
  type PublicEvent,
} from "@agent-commons/ui";
import "@agent-commons/ui/styles.css";
type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ reference?: string }>;
};
const base = () =>
  (
    process.env.NEXT_PUBLIC_NEST_API_BASE_URL || "https://api.agentcommons.io"
  ).replace(/\/$/, "");
async function load(slug: string): Promise<PublicEvent | null> {
  if (!/^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/.test(slug)) return null;
  const r = await fetch(`${base()}/v1/public-events/${slug}`, {
    cache: "no-store",
  });
  if (r.status === 404) return null;
  if (!r.ok)
    throw new Error(
      "Registration is temporarily unavailable. Please try again.",
    );
  return (await r.json()).data;
}
export async function generateMetadata({
  params,
  searchParams,
}: Props): Promise<Metadata> {
  const event = await load((await params).slug);
  return {
    title: {
      absolute: event ? `Register | ${event.title}` : "Registration not found",
    },
    description: event?.summary,
    robots: { index: false, follow: false },
    referrer: "no-referrer",
  };
}
export default async function Page({ params, searchParams }: Props) {
  const event = await load((await params).slug);
  if (!event) notFound();
  return (
    <div className="h-dvh overflow-y-auto print:h-auto print:overflow-visible">
      <EventRegistrationExperience
        event={event}
        apiBase={base()}
        reference={(await searchParams).reference}
      />
    </div>
  );
}

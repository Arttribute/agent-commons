import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  EventRegistrationExperience,
  type PublicEvent,
} from "@agent-commons/ui";
import "@agent-commons/ui/styles.css";
import { publicRegistration } from "@/lib/course-registration";
import { RegistrationError } from "@/lib/registration-policy";
type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ reference?: string | string[] }>;
};
async function load(slug: string): Promise<PublicEvent | null> {
  if (!/^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/.test(slug)) return null;
  try {
    return await publicRegistration(slug);
  } catch (error) {
    if (error instanceof RegistrationError && error.status === 404) return null;
    throw error;
  }
}
export async function generateMetadata({ params }: Props): Promise<Metadata> {
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
  const candidate = (await searchParams).reference;
  const reference = Array.isArray(candidate) ? candidate[0] : candidate;
  return (
    <EventRegistrationExperience
      event={event}
      apiBase="/api"
      reference={reference}
    />
  );
}

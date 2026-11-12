import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { EventRegistrationExperience } from "@agent-commons/ui";
import "@agent-commons/ui/styles.css";
import { getAppBaseUrl } from "@/lib/app-url";
import { programmeMetadata } from "@/lib/programme-metadata";
import { registrationPage, shareForRegistration } from "@/lib/programme-share";
type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ reference?: string | string[] }>;
};
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const event = await registrationPage((await params).slug);
  if (!event)
    return {
      title: "Registration not found",
      robots: { index: false, follow: false },
    };
  return {
    ...programmeMetadata(await shareForRegistration(event), {
      baseUrl: getAppBaseUrl(),
      path: `/register/${event.slug}`,
      browserTitle: `Register | ${event.title}`,
    }),
    robots: { index: false, follow: false },
    referrer: "no-referrer",
  };
}
export default async function Page({ params, searchParams }: Props) {
  const event = await registrationPage((await params).slug);
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

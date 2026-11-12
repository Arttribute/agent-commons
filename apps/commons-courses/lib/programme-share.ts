import { cache } from "react";
import type { PublicEvent } from "@agent-commons/ui";
import { publicRegistration } from "@/lib/course-registration";
import { RegistrationError } from "@/lib/registration-policy";
import { publicProjectPage, type PublicPage } from "@/lib/project-pages";
import {
  isProgrammePage,
  programmeShare,
  registrationSlugForPage,
} from "@/lib/programme-metadata";

// Metadata and page rendering share the same public registration lookup.
export const registrationPage = cache(
  async (slug: string): Promise<PublicEvent | null> => {
    if (!/^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/.test(slug)) return null;
    try {
      return await publicRegistration(slug);
    } catch (error) {
      if (error instanceof RegistrationError && error.status === 404)
        return null;
      throw error;
    }
  },
);

export async function shareForRegistration(event: PublicEvent) {
  try {
    const page = await publicProjectPage(event.pageSlug || event.slug);
    if (page && isProgrammePage(page, event))
      return programmeShare(page, event);
  } catch {
    // An unavailable optional landing page must not prevent registration.
    console.warn("Programme sharing page unavailable", { slug: event.slug });
  }
  return programmeShare(null, event);
}

export async function shareForPage(page: PublicPage) {
  if (!page.description?.trim() || !page.imageUrl?.trim()) {
    const slug = registrationSlugForPage(page);
    if (slug) {
      try {
        const event = await registrationPage(slug);
        return programmeShare(page, event);
      } catch {
        console.warn("Programme sharing details unavailable", { slug });
      }
    }
  }
  return programmeShare(page);
}

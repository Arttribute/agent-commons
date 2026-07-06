import type { ComponentType } from "react";
import {
  SiGithub,
  SiGithubHex,
  SiGmail,
  SiGmailHex,
  SiGooglecalendar,
  SiGooglecalendarHex,
  SiGooglechat,
  SiGooglechatHex,
  SiGoogledocs,
  SiGoogledocsHex,
  SiGoogledrive,
  SiGoogledriveHex,
  SiGoogleforms,
  SiGoogleformsHex,
  SiGooglesheets,
  SiGooglesheetsHex,
  SiGoogleslides,
  SiGoogleslidesHex,
  SiGoogletasks,
  SiGoogletasksHex,
  SiLinear,
  SiLinearHex,
  SiNotion,
  SiNotionHex,
  SiPostgresql,
  SiPostgresqlHex,
  SiStripe,
  SiStripeHex,
} from "@icons-pack/react-simple-icons";

export interface BrandIcon {
  icon: ComponentType<{ color?: string; size?: number | string; className?: string }>;
  /** Official brand color */
  hex: string;
  /** Near-black marks (GitHub, Notion) — render in the theme foreground so they survive dark mode */
  monochrome?: boolean;
}

const BRAND_MATCHERS: Array<{ pattern: RegExp; brand: BrandIcon }> = [
  { pattern: /gmail/, brand: { icon: SiGmail, hex: SiGmailHex } },
  { pattern: /google[\s_-]?drive/, brand: { icon: SiGoogledrive, hex: SiGoogledriveHex } },
  { pattern: /google[\s_-]?calendar/, brand: { icon: SiGooglecalendar, hex: SiGooglecalendarHex } },
  { pattern: /google[\s_-]?docs?/, brand: { icon: SiGoogledocs, hex: SiGoogledocsHex } },
  { pattern: /google[\s_-]?sheets?|spreadsheet/, brand: { icon: SiGooglesheets, hex: SiGooglesheetsHex } },
  { pattern: /google[\s_-]?slides?/, brand: { icon: SiGoogleslides, hex: SiGoogleslidesHex } },
  { pattern: /google[\s_-]?chat/, brand: { icon: SiGooglechat, hex: SiGooglechatHex } },
  { pattern: /google[\s_-]?forms?/, brand: { icon: SiGoogleforms, hex: SiGoogleformsHex } },
  { pattern: /google[\s_-]?tasks?/, brand: { icon: SiGoogletasks, hex: SiGoogletasksHex } },
  { pattern: /github/, brand: { icon: SiGithub, hex: SiGithubHex, monochrome: true } },
  { pattern: /notion/, brand: { icon: SiNotion, hex: SiNotionHex, monochrome: true } },
  { pattern: /postgres/, brand: { icon: SiPostgresql, hex: SiPostgresqlHex } },
  { pattern: /\blinear\b/, brand: { icon: SiLinear, hex: SiLinearHex } },
  { pattern: /stripe/, brand: { icon: SiStripe, hex: SiStripeHex } },
  // Slack and Canva marks aren't in simple-icons (trademark removals) —
  // those tools fall back to the node-type icon.
];

/**
 * Resolve a recognizable service mark for a tool from its name/label,
 * so e.g. a Gmail tool node reads as Gmail at a glance. Returns null
 * when no brand matches — callers fall back to the node-type icon.
 */
export function getBrandIcon(
  ...nameParts: Array<string | undefined>
): BrandIcon | null {
  const haystack = nameParts.filter(Boolean).join(" ").toLowerCase();
  if (!haystack) return null;
  for (const { pattern, brand } of BRAND_MATCHERS) {
    if (pattern.test(haystack)) return brand;
  }
  return null;
}

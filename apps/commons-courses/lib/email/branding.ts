export type EmailBranding = {
  enabled: boolean;
  senderName?: string;
  logoUrl?: string;
  accentColor?: string;
  footerText?: string;
};

export type EducatorPlan = "free" | "starter" | "growth" | "institution";

export function isPaidEducatorPlan(plan?: string | null) {
  return plan === "starter" || plan === "growth" || plan === "institution";
}

export function normalizeEmailBranding(input?: Partial<EmailBranding> | null) {
  if (!input) return { enabled: false } satisfies EmailBranding;
  return {
    enabled: Boolean(input.enabled),
    senderName: cleanText(input.senderName, 80),
    logoUrl: normalizeBrandLogoUrl(input.logoUrl),
    accentColor: normalizeBrandColor(input.accentColor),
    footerText: cleanText(input.footerText, 240),
  } satisfies EmailBranding;
}

export function normalizeBrandColor(value?: string | null) {
  const color = value?.trim();
  return color && /^#[0-9a-f]{6}$/i.test(color) ? color.toUpperCase() : undefined;
}

export function normalizeBrandLogoUrl(value?: string | null) {
  const url = value?.trim();
  if (!url) return undefined;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" ? parsed.toString() : undefined;
  } catch {
    return undefined;
  }
}

function cleanText(value: unknown, maxLength: number) {
  if (typeof value !== "string") return undefined;
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized ? normalized.slice(0, maxLength) : undefined;
}

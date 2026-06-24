import { randomBytes } from "crypto";

const PREFIXES = {
  user: "usr",
  workspace: "wsp",
  identity: "idn",
  membership: "mem",
  serviceAccount: "svc",
  project: "prj",
  apiKey: "key",
} as const;

export type CommonsIdKind = keyof typeof PREFIXES;

export function createCommonsId(kind: CommonsIdKind): string {
  return `${PREFIXES[kind]}_${randomBytes(16).toString("base64url")}`;
}

export function normalizeEmail(value: string | null | undefined): string | null {
  const email = value?.trim().toLowerCase();
  return email && email.includes("@") ? email : null;
}

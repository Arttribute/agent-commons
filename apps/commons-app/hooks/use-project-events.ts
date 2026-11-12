"use client";
import { desktopApiFetch } from "@/lib/desktop-api-fetch";
import type { PublicEvent } from "@agent-commons/ui";
export type EventSettings = Omit<
  PublicEvent,
  "slug" | "status" | "available"
> & { surface: "commons" | "commonlab" | "business" };
export type ProjectEvent = {
  eventId: string;
  slug: string;
  status: "draft" | "open" | "closed";
  config: EventSettings;
  registrationUrl: string;
};
export type EventBooking = {
  registration_id: string;
  reference: string;
  status: string;
  payment_status: string;
  quantity: number;
  amount_minor: string;
  currency: string;
  contact: { name: string; email: string; phone: string };
  participants: Array<Record<string, unknown>>;
  paid_at: string | null;
  created_at: string;
  payment_details?: {
    reason?: string;
    amountMinor?: number;
    currency?: string;
  };
};
export type EventPaymentAccount = {
  connected: boolean;
  accountId?: string;
  mode?: string;
  webhookUrl?: string;
};
async function request(path: string, method = "GET", body?: unknown) {
  const response = await desktopApiFetch(path, {
    method,
    cache: "no-store",
    ...(body === undefined
      ? {}
      : {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(
      typeof result.message === "string"
        ? result.message
        : result.error || "The request could not be completed",
    );
  return result.data;
}
const base = (project: string) =>
  `/api/projects/${encodeURIComponent(project)}/events`;
export const projectEventsApi = {
  list: (project: string): Promise<ProjectEvent[]> => request(base(project)),
  save: (
    project: string,
    input: { slug: string; status: string; config: EventSettings },
    id?: string,
  ): Promise<ProjectEvent> =>
    request(
      base(project) + (id ? "/" + encodeURIComponent(id) : ""),
      id ? "PATCH" : "POST",
      input,
    ),
  account: (project: string): Promise<EventPaymentAccount> =>
    request(base(project) + "/paystack"),
  connect: (
    project: string,
    input: { secretKey: string; signingSecret?: string },
  ): Promise<EventPaymentAccount> =>
    request(base(project) + "/paystack", "POST", input),
  registrations: (
    project: string,
    id: string,
    offset = 0,
  ): Promise<{ registrations: EventBooking[]; nextOffset: number | null }> =>
    request(
      base(project) +
        "/" +
        encodeURIComponent(id) +
        "/registrations?offset=" +
        offset,
    ),
};

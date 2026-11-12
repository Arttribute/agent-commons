import type { PublicEvent } from "@agent-commons/ui";
export type EventSettings = Omit<
  PublicEvent,
  "slug" | "status" | "available"
> & { surface: "commons" | "commonlab" | "business" };
export type ProgrammeEvent = {
  eventId: string;
  projectId: string;
  projectName: string;
  slug: string;
  status: string;
  config: EventSettings;
  registrationUrl: string;
};
export type Booking = {
  registration_id: string;
  reference: string;
  status: string;
  payment_status: string;
  quantity: number;
  amount_minor: string;
  discount_code?: string;
  discount_amount_minor?: string;
  currency: string;
  contact: { name: string; email: string; phone: string };
  participants: Array<Record<string, unknown>>;
  paid_at: string | null;
  created_at: string;
  payment_details?: { reason?: string };
};
export type PaymentAccount = {
  connected: boolean;
  mode?: string;
  webhookUrl?: string;
};
export async function eventRequest<T>(
  path = "",
  method = "GET",
  body?: unknown,
): Promise<T> {
  const response = await fetch(`/api/educator/registrations${path}`, {
    method,
    cache: "no-store",
    ...(body === undefined
      ? {}
      : {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(
      data.message || data.error || "Could not complete the request.",
    );
  return data.data;
}
export function bookingsCsv(items: Booking[]) {
  const cell = (value: unknown) =>
    '"' +
    String(value ?? "")
      .replace(/^[=+\-@\t\r]/, "'$&")
      .replaceAll('"', '""') +
    '"';
  return [
    [
      "Reference",
      "Registration",
      "Payment",
      "Places",
      "Contact",
      "Email",
      "Phone",
      "Amount",
      "Currency",
      "Paid at",
      "Discount code",
      "Discount",
    ],
    ...items.map((b) => [
      b.reference,
      b.status,
      b.payment_status,
      b.quantity,
      b.contact.name,
      b.contact.email,
      b.contact.phone,
      Number(b.amount_minor) / 100,
      b.currency,
      b.paid_at,
      b.discount_code,
      Number(b.discount_amount_minor || 0) / 100,
    ]),
  ]
    .map((row) => row.map(cell).join(","))
    .join("\r\n");
}

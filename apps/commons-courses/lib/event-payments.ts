/** Route new event payments without changing the existing course webhook URL. */
export async function relayEventPayment(
  body: string,
  headers: Headers,
  apiBase: string,
): Promise<Response | null> {
  let event: any;
  try {
    event = JSON.parse(body);
  } catch {
    return null;
  }
  const metadata = event?.data?.metadata;
  if (metadata?.purpose !== "event_registration") return null;
  if (
    !/^ac_evt_[a-f0-9]{48}$/.test(event?.data?.reference || "") ||
    !/^[a-f0-9-]{36}$/.test(metadata.eventPaymentAccountId || "")
  )
    return new Response("Invalid event reference", { status: 400 });
  const forwarded = new Headers({ "Content-Type": "application/json" });
  for (const name of ["x-paystack-signature", "paystack-signature"]) {
    const value = headers.get(name);
    if (value) forwarded.set(name, value);
  }
  if (
    !forwarded.has("x-paystack-signature") &&
    !forwarded.has("paystack-signature")
  )
    return new Response("Missing payment signature", { status: 400 });
  try {
    const result = await fetch(
      `${apiBase.replace(/\/$/, "")}/v1/event-payments/paystack/${metadata.eventPaymentAccountId}`,
      {
        method: "POST",
        headers: forwarded,
        body,
        signal: AbortSignal.timeout(20_000),
      },
    );
    if (!result.ok)
      return new Response("Event payment delivery failed", {
        status: result.status >= 500 ? 503 : result.status,
      });
    return Response.json({ received: true });
  } catch {
    return new Response("Event payment delivery is temporarily unavailable", {
      status: 503,
    });
  }
}

import test from "node:test";
import assert from "node:assert/strict";
import { relayEventPayment } from "./event-payments.ts";

test("existing course payments remain with their original webhook handler", async () => {
  assert.equal(
    await relayEventPayment(
      '{"event":"charge.success","data":{"metadata":{"courseSlug":"course"}}}',
      new Headers(),
      "https://api.example",
    ),
    null,
  );
});
test("event relay forwards raw bytes and signatures, never cookies or credentials", async () => {
  const original = globalThis.fetch;
  const body = JSON.stringify({
    data: {
      reference: "ac_evt_" + "a".repeat(48),
      metadata: {
        purpose: "event_registration",
        eventPaymentAccountId: "82e2aa45-91c5-494f-b608-cbe8f9f9f042",
      },
    },
  });
  try {
    globalThis.fetch = (async (url, init) => {
      assert.equal(
        String(url),
        "https://api.example/v1/event-payments/paystack/82e2aa45-91c5-494f-b608-cbe8f9f9f042",
      );
      assert.equal(init?.body, body);
      const headers = new Headers(init?.headers);
      assert.equal(headers.get("x-paystack-signature"), "legacy-signature");
      assert.equal(headers.get("paystack-signature"), "modern-signature");
      assert.equal(headers.has("cookie"), false);
      assert.equal(headers.has("authorization"), false);
      return Response.json({ received: true });
    }) as typeof fetch;
    const result = await relayEventPayment(
      body,
      new Headers({
        "x-paystack-signature": "legacy-signature",
        "paystack-signature": "modern-signature",
        cookie: "private",
        authorization: "private",
      }),
      "https://api.example",
    );
    assert.equal(result?.status, 200);
    globalThis.fetch = (async () =>
      new Response("Retry", { status: 500 })) as typeof fetch;
    assert.equal(
      (
        await relayEventPayment(
          body,
          new Headers({ "x-paystack-signature": "signature" }),
          "https://api.example",
        )
      )?.status,
      503,
    );
    assert.equal(
      (await relayEventPayment(body, new Headers(), "https://api.example"))
        ?.status,
      400,
    );
  } finally {
    globalThis.fetch = original;
  }
});

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  publicReceipt,
  receiptState,
  receiptRetryAllowed,
} from "./payment-receipt-policy.ts";
const payment = {
  status: "completed",
  amount: 10,
  currency: "kes",
  providerReference: "opaque-payment-reference",
  metadata: {
    registration: {
      status: "confirmed",
      contact: {
        name: "Parent",
        email: "private@example.com",
        phone: "private-phone",
      },
      participants: [{ name: "Private child" }],
    },
    receipt: {
      snapshot: {
        programme: "Camp",
        quantity: 1,
        when: "9–11 December",
        location: "Nairobi",
        paidAt: "2026-11-12T12:00:00Z",
        email: "hidden@example.com",
        accessCode: "PRIVATE_CODE",
      },
    },
  },
};
test("verification shows current financial status without family details or promo codes", () => {
  const receipt = publicReceipt(payment)!;
  assert.equal(receipt.amountMinor, 1000);
  assert.equal(receipt.title, "Payment verified");
  for (const secret of [
    "private@example.com",
    "private-phone",
    "Private child",
    "hidden@example.com",
    "PRIVATE_CODE",
  ])
    assert(!JSON.stringify(receipt).includes(secret));
  assert.equal(
    receiptState({ ...payment, status: "refunded" }).title,
    "Payment refunded",
  );
  assert.equal(receiptState({ ...payment, status: "pending" }).verified, false);
});
test("a paid booking needing review is not described as confirmed", () => {
  const state = receiptState({
    ...payment,
    metadata: { registration: { status: "review" } },
  });
  assert(state.title.includes("needs review"));
});
test("automatic retries stop before provider idempotency expires", () => {
  const now = Date.parse("2026-11-12T12:00:00Z");
  assert(receiptRetryAllowed("2026-11-12T11:00:00Z", now));
  assert(!receiptRetryAllowed("2026-11-11T12:00:00Z", now));
});

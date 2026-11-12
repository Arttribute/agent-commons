export type ReceiptPayment = {
  status: string;
  amount: number;
  currency: string;
  providerReference: string;
  metadata?: Record<string, any>;
};
export function receiptState(payment: ReceiptPayment) {
  if (payment.status === "refunded")
    return { title: "Payment refunded", tone: "neutral", verified: false };
  if (payment.status !== "completed")
    return { title: "Payment not verified", tone: "warning", verified: false };
  if (payment.metadata?.registration?.status === "review")
    return {
      title: "Payment received. Booking needs review.",
      tone: "warning",
      verified: true,
    };
  return {
    title: payment.amount === 0 ? "Registration confirmed" : "Payment verified",
    tone: "success",
    verified: true,
  };
}
export function publicReceipt(payment: ReceiptPayment) {
  const saved = payment.metadata?.receipt?.snapshot;
  if (!saved) return null;
  return {
    ...receiptState(payment),
    receiptNumber: "CL-" + payment.providerReference.slice(-10).toUpperCase(),
    programme: saved.programme,
    when: saved.when,
    location: saved.location,
    quantity: saved.quantity,
    amountMinor: Math.round(payment.amount * 100),
    currency: payment.currency.toUpperCase(),
    paidAt: saved.paidAt,
    note: saved.note || "",
  };
}
/** Never repeat a send after the provider's idempotency window has expired. */
export function receiptRetryAllowed(firstAttemptAt?: string, now = Date.now()) {
  return (
    !firstAttemptAt ||
    now - new Date(firstAttemptAt).getTime() < 23 * 60 * 60_000
  );
}
export function receiptMoney(minor: number, currency: string) {
  return new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency,
    maximumFractionDigits: minor % 100 ? 2 : 0,
  })
    .format(minor / 100)
    .replace(/KES|Ksh/g, "KSh");
}

import Payment from "@/models/Payment";
import { fulfillCompletedPayment } from "@/lib/payment-fulfillment";
import { verifyPaystackTransaction } from "@/lib/paystack";
import { stripe } from "@/lib/stripe";

type PaymentForRecovery = {
  provider: "stripe" | "paystack";
  providerReference: string;
  status: "pending" | "completed" | "failed" | "refunded";
};

export async function recoverCompletedEnrollment(params: {
  userId: string;
  courseId: string;
}) {
  const payments = (await Payment.find({
    userId: params.userId,
    courseId: params.courseId,
    status: { $in: ["pending", "completed"] },
  })
    .sort({ createdAt: -1 })
    .limit(10)
    .lean()) as unknown as PaymentForRecovery[];

  for (const payment of payments) {
    const fulfilled = await recoverPayment(payment);
    if (fulfilled) return true;
  }

  return false;
}

async function recoverPayment(payment: PaymentForRecovery) {
  if (payment.status === "completed") {
    const result = await fulfillCompletedPayment({
      provider: payment.provider,
      providerReference: payment.providerReference,
    });
    return result.fulfilled;
  }

  if (payment.provider === "paystack") {
    return recoverPaystackPayment(payment.providerReference);
  }

  return recoverStripePayment(payment.providerReference);
}

async function recoverPaystackPayment(reference: string) {
  try {
    const transaction = await verifyPaystackTransaction(reference);
    if (transaction.status !== "success") return false;
    const result = await fulfillCompletedPayment({
      provider: "paystack",
      providerReference: transaction.reference,
      channel: transaction.channel || "unknown",
      fallback: {
        userId: transaction.metadata?.userId as string | undefined,
        courseSlug: transaction.metadata?.courseSlug as string | undefined,
        amount: transaction.amount / 100,
        metadata: transaction.metadata,
      },
    });
    return result.fulfilled;
  } catch {
    return false;
  }
}

async function recoverStripePayment(sessionId: string) {
  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (session.payment_status !== "paid") return false;
    const result = await fulfillCompletedPayment({
      provider: "stripe",
      providerReference: session.id,
      stripePaymentIntentId: session.payment_intent as string,
      fallback: {
        userId: session.metadata?.userId,
        courseSlug: session.metadata?.courseSlug,
        metadata: session.metadata || undefined,
      },
    });
    return result.fulfilled;
  } catch {
    return false;
  }
}

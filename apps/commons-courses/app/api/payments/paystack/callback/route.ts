import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { fulfillCompletedPayment } from "@/lib/payment-fulfillment";
import { verifyPaystackTransaction } from "@/lib/paystack";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const reference = url.searchParams.get("reference") || url.searchParams.get("trxref");

  if (!reference) {
    return redirectError(req, "missing_reference");
  }

  let transaction;
  try {
    transaction = await verifyPaystackTransaction(reference);
  } catch (err) {
    console.error("Paystack callback verification failed", { reference, err });
    return redirectError(req, "provider_verify_failed");
  }

  if (transaction.status !== "success") {
    return redirectError(req, "payment_not_successful");
  }

  await connectDB();
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

  if (!result.fulfilled) {
    return redirectError(req, result.reason || "fulfillment_failed");
  }

  return NextResponse.redirect(new URL("/dashboard?enrolled=1", req.url));
}

function redirectError(req: NextRequest, code: string) {
  const url = new URL("/payments/error", req.url);
  url.searchParams.set("code", code);
  url.searchParams.set("provider", "paystack");
  return NextResponse.redirect(url);
}

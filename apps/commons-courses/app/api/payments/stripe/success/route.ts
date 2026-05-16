import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { fulfillCompletedPayment } from "@/lib/payment-fulfillment";
import { stripe } from "@/lib/stripe";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const sessionId = url.searchParams.get("session_id");

  if (!sessionId) {
    return redirectError(req, "missing_session");
  }

  let session;
  try {
    session = await stripe.checkout.sessions.retrieve(sessionId);
  } catch (err) {
    console.error("Stripe success verification failed", { sessionId, err });
    return redirectError(req, "provider_verify_failed");
  }

  if (session.payment_status !== "paid") {
    return redirectError(req, "payment_not_successful");
  }

  await connectDB();
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

  if (!result.fulfilled) {
    return redirectError(req, result.reason || "fulfillment_failed");
  }

  return NextResponse.redirect(new URL("/dashboard?enrolled=1", req.url));
}

function redirectError(req: NextRequest, code: string) {
  const url = new URL("/payments/error", req.url);
  url.searchParams.set("code", code);
  url.searchParams.set("provider", "stripe");
  return NextResponse.redirect(url);
}

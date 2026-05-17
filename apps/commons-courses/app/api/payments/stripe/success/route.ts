import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createAccountToken } from "@/lib/account-tokens";
import { connectDB } from "@/lib/db";
import { fulfillCompletedPayment } from "@/lib/payment-fulfillment";
import { stripe } from "@/lib/stripe";
import { trackAnalyticsEvent } from "@/lib/analytics";

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
    await trackAnalyticsEvent({
      eventType: "payment_failed",
      page: "checkout",
      provider: "stripe",
      metadata: { code: result.reason || "fulfillment_failed", providerReference: session.id },
      request: req,
    });
    return redirectError(req, result.reason || "fulfillment_failed");
  }
  await trackAnalyticsEvent({
    eventType: "payment_completed",
    userId: result.payment.userId.toString(),
    courseId: result.payment.courseId,
    courseSlug: result.course.slug,
    page: "checkout",
    provider: "stripe",
    paymentPlan: result.payment.paymentPlan,
    accessCode: result.payment.accessCode,
    accessCodeType: result.payment.accessCodeType,
    affiliateCode: result.payment.affiliateCode,
    originalAmount: result.payment.originalAmount,
    finalAmount: result.payment.amount,
    discountAmount: result.payment.discountAmount,
    currency: result.payment.currency,
    metadata: { providerReference: session.id },
    request: req,
  });

  return redirectAfterPayment(req, {
    userId: result.payment.userId.toString(),
    courseSlug: result.course.slug,
    canUseCheckoutSignIn: result.payment.metadata?.checkoutSignin === true ||
      result.payment.metadata?.checkoutSignin === "1",
  });
}

function redirectError(req: NextRequest, code: string) {
  const url = new URL("/payments/error", req.url);
  url.searchParams.set("code", code);
  url.searchParams.set("provider", "stripe");
  return NextResponse.redirect(url);
}

async function redirectAfterPayment(
  req: NextRequest,
  params: { userId: string; courseSlug: string; canUseCheckoutSignIn: boolean }
) {
  const session = await auth();
  if (session?.user?.id) {
    return NextResponse.redirect(new URL("/dashboard?enrolled=1", req.url));
  }

  if (!params.canUseCheckoutSignIn) {
    const signInUrl = new URL("/auth/signin", req.url);
    signInUrl.searchParams.set("callbackUrl", `/courses/${params.courseSlug}/learn`);
    return NextResponse.redirect(signInUrl);
  }

  const { token } = await createAccountToken({
    userId: params.userId,
    purpose: "checkout_signin",
    ttlMinutes: 15,
  });
  const signInUrl = new URL("/auth/checkout", req.url);
  signInUrl.searchParams.set("token", token);
  signInUrl.searchParams.set("callbackUrl", `/courses/${params.courseSlug}/learn`);
  return NextResponse.redirect(signInUrl);
}

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createAccountToken } from "@/lib/account-tokens";
import { connectDB } from "@/lib/db";
import { fulfillCompletedPayment } from "@/lib/payment-fulfillment";
import { verifyPaystackTransaction } from "@/lib/paystack";
import { trackAnalyticsEvent } from "@/lib/analytics";

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
    await trackAnalyticsEvent({
      eventType: "payment_failed",
      page: "checkout",
      provider: "paystack",
      metadata: {
        code: result.reason || "fulfillment_failed",
        providerReference: transaction.reference,
      },
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
    provider: "paystack",
    paymentPlan: result.payment.paymentPlan,
    accessCode: result.payment.accessCode,
    accessCodeType: result.payment.accessCodeType,
    affiliateCode: result.payment.affiliateCode,
    originalAmount: result.payment.originalAmount,
    finalAmount: result.payment.amount,
    discountAmount: result.payment.discountAmount,
    currency: result.payment.currency,
    metadata: { providerReference: transaction.reference, channel: transaction.channel },
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
  url.searchParams.set("provider", "paystack");
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

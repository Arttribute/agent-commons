import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import {
  PaystackEvent,
  verifyPaystackWebhookSignature,
} from "@/lib/paystack";
import { connectDB } from "@/lib/db";
import { fulfillCompletedPayment } from "@/lib/payment-fulfillment";
import { trackAnalyticsEvent } from "@/lib/analytics";
import type Stripe from "stripe";

export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig = req.headers.get("stripe-signature");
  const paystackSig = req.headers.get("x-paystack-signature");

  if (paystackSig) {
    return handlePaystackWebhook(body, paystackSig);
  }

  if (!sig) {
    return NextResponse.json({ error: "Missing signature." }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch {
    return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const { userId, courseSlug } = session.metadata || {};

    if (!userId || !courseSlug) {
      return NextResponse.json({ error: "Missing metadata." }, { status: 400 });
    }

    await connectDB();

    const result = await fulfillCompletedPayment({
      provider: "stripe",
      providerReference: session.id,
      stripePaymentIntentId: session.payment_intent as string,
      fallback: {
        userId,
        courseSlug,
        metadata: session.metadata || undefined,
      },
    });
    if (result.fulfilled) {
      await trackAnalyticsEvent({
        eventType: "payment_completed",
        userId: result.payment.userId.toString(),
        courseId: result.payment.courseId,
        courseSlug: result.course.slug,
        page: "webhook",
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
      });
    }
  }

  return NextResponse.json({ received: true });
}

async function handlePaystackWebhook(body: string, signature: string) {
  if (!verifyPaystackWebhookSignature(body, signature)) {
    return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
  }

  const event = JSON.parse(body) as PaystackEvent;
  if (event.event !== "charge.success") {
    return NextResponse.json({ received: true });
  }

  const { reference, metadata, channel, amount } = event.data;
  const userId = metadata?.userId as string | undefined;
  const courseSlug = metadata?.courseSlug as string | undefined;

  if (!userId || !courseSlug || !reference) {
    return NextResponse.json({ error: "Missing metadata." }, { status: 400 });
  }

  await connectDB();

  const result = await fulfillCompletedPayment({
    provider: "paystack",
    providerReference: reference,
    channel: channel || "unknown",
    fallback: {
      userId,
      courseSlug,
      amount: amount / 100,
      metadata,
    },
  });
  if (result.fulfilled) {
    await trackAnalyticsEvent({
      eventType: "payment_completed",
      userId: result.payment.userId.toString(),
      courseId: result.payment.courseId,
      courseSlug: result.course.slug,
      page: "webhook",
      provider: "paystack",
      paymentPlan: result.payment.paymentPlan,
      accessCode: result.payment.accessCode,
      accessCodeType: result.payment.accessCodeType,
      affiliateCode: result.payment.affiliateCode,
      originalAmount: result.payment.originalAmount,
      finalAmount: result.payment.amount,
      discountAmount: result.payment.discountAmount,
      currency: result.payment.currency,
      metadata: { providerReference: reference, channel },
    });
  }

  return NextResponse.json({ received: true });
}

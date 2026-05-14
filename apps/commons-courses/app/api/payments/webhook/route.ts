import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import {
  PaystackEvent,
  verifyPaystackWebhookSignature,
} from "@/lib/paystack";
import { connectDB } from "@/lib/db";
import Payment from "@/models/Payment";
import Enrollment from "@/models/Enrollment";
import Course from "@/models/Course";
import type Stripe from "stripe";

interface ExistingEnrollment {
  paidAmount?: number;
  currentInstallment?: number;
}

function getMetadataString(metadata: unknown, key: string) {
  if (!metadata || typeof metadata !== "object") return undefined;
  const value = (metadata as Record<string, unknown>)[key];
  return typeof value === "string" ? value : undefined;
}

function getMetadataNumber(metadata: unknown, key: string) {
  if (!metadata || typeof metadata !== "object") return undefined;
  const value = (metadata as Record<string, unknown>)[key];
  return typeof value === "number" ? value : Number(value) || undefined;
}

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

    // Update payment record
    await Payment.findOneAndUpdate(
      { stripeSessionId: session.id },
      {
        status: "completed",
        stripePaymentIntentId: session.payment_intent as string,
      }
    );

    // Find course and enroll user
    const course = await Course.findOne({ slug: courseSlug });
    if (course) {
      const payment = await Payment.findOne({ stripeSessionId: session.id });
      const paymentPlan = payment?.paymentPlan || "one_time";
      const requestedAccessLevel =
        getMetadataString(payment?.metadata, "accessLevel") ||
        session.metadata?.accessLevel ||
        "full";
      const paidAmount = payment?.amount || course.price;
      const existingEnrollment = await Enrollment.findOne({
        userId,
        courseId: course._id,
      }).lean();
      const nextPaidAmount =
        paymentPlan === "installment"
          ? ((existingEnrollment as ExistingEnrollment | null)?.paidAmount || 0) +
            paidAmount
          : course.price;
      const installmentNumber =
        payment?.installmentNumber ||
        Number(session.metadata?.installmentNumber) ||
        (paymentPlan === "installment"
          ? ((existingEnrollment as ExistingEnrollment | null)?.currentInstallment ||
              0) + 1
          : 0);
      const paymentStatus =
        paymentPlan === "installment" && nextPaidAmount < course.price
          ? "partial"
          : "paid";
      const accessLevel = paymentStatus === "paid" ? "full" : requestedAccessLevel;

      await Enrollment.findOneAndUpdate(
        { userId, courseId: course._id },
        {
          userId,
          courseId: course._id,
          status: "active",
          accessLevel,
          paymentStatus,
          paymentId: session.id,
          paidAmount: nextPaidAmount,
          totalAmountDue: course.price,
          currentInstallment: installmentNumber,
        },
        { upsert: true }
      );
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

  const { reference, metadata, channel } = event.data;
  const userId = metadata?.userId as string | undefined;
  const courseSlug = metadata?.courseSlug as string | undefined;

  if (!userId || !courseSlug || !reference) {
    return NextResponse.json({ error: "Missing metadata." }, { status: 400 });
  }

  await connectDB();

  const payment = await Payment.findOneAndUpdate(
    { provider: "paystack", providerReference: reference },
    {
      status: "completed",
      channel: channel || "unknown",
    },
    { new: true }
  );

  const course = await Course.findOne({ slug: courseSlug });
  if (course) {
    const paymentPlan = payment?.paymentPlan || "one_time";
    const requestedAccessLevel =
      getMetadataString(payment?.metadata, "accessLevel") ||
      getMetadataString(metadata, "accessLevel") ||
      (paymentPlan === "installment" ? "partial" : "full");
    const paidAmount = payment?.amount || event.data.amount / 100;
    const existingEnrollment = await Enrollment.findOne({
      userId,
      courseId: course._id,
    }).lean();
    const nextPaidAmount =
      paymentPlan === "installment"
        ? ((existingEnrollment as ExistingEnrollment | null)?.paidAmount || 0) +
          paidAmount
        : course.price;
    const installmentNumber =
      payment?.installmentNumber ||
      getMetadataNumber(metadata, "installmentNumber") ||
      (paymentPlan === "installment"
        ? ((existingEnrollment as ExistingEnrollment | null)?.currentInstallment ||
            0) + 1
        : 0);
    const paymentStatus =
      paymentPlan === "installment" && nextPaidAmount < course.price
        ? "partial"
        : "paid";
    const accessLevel = paymentStatus === "paid" ? "full" : requestedAccessLevel;

    await Enrollment.findOneAndUpdate(
      { userId, courseId: course._id },
      {
        userId,
        courseId: course._id,
        status: "active",
        accessLevel,
        paymentStatus,
        paymentId: reference,
        paidAmount: nextPaidAmount,
        totalAmountDue: course.price,
        currentInstallment: installmentNumber,
      },
      { upsert: true }
    );
  }

  return NextResponse.json({ received: true });
}

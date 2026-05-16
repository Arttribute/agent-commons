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
import { recordSaleLedger } from "@/lib/payout-ledger";
import { recordAccessProgramConversion } from "@/lib/course-access";
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
    const updatedPayment = await Payment.findOneAndUpdate(
      { stripeSessionId: session.id, status: { $ne: "completed" } },
      {
        status: "completed",
        stripePaymentIntentId: session.payment_intent as string,
      },
      { new: true }
    );
    if (updatedPayment?._id) {
      await recordSaleLedger(updatedPayment._id.toString());
    }

    // Find course and enroll user
    const course = await Course.findOne({ slug: courseSlug });
    if (course) {
      const payment =
        updatedPayment || (await Payment.findOne({ stripeSessionId: session.id }));
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
          : paidAmount;
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
          accessSource: payment?.accessCodeType ? payment.accessCodeType : "payment",
          accessCode: payment?.accessCode,
          affiliateCode: payment?.affiliateCode,
          paidAmount: nextPaidAmount,
          totalAmountDue: course.price,
          currentInstallment: installmentNumber,
        },
        { upsert: true }
      );
      if (updatedPayment) {
        await recordAccessProgramConversion({
          courseId: course._id.toString(),
          accessCode: payment?.accessCode,
          accessCodeType: payment?.accessCodeType,
          affiliateCode: payment?.affiliateCode,
        });
      }
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
    {
      provider: "paystack",
      providerReference: reference,
      status: { $ne: "completed" },
    },
    {
      status: "completed",
      channel: channel || "unknown",
    },
    { new: true }
  );
  if (payment?._id) {
    await recordSaleLedger(payment._id.toString());
  }

  const course = await Course.findOne({ slug: courseSlug });
  if (course) {
    const completedPayment =
      payment ||
      (await Payment.findOne({ provider: "paystack", providerReference: reference }));
    const paymentPlan = completedPayment?.paymentPlan || "one_time";
    const requestedAccessLevel =
      getMetadataString(completedPayment?.metadata, "accessLevel") ||
      getMetadataString(metadata, "accessLevel") ||
      (paymentPlan === "installment" ? "partial" : "full");
    const paidAmount = completedPayment?.amount || event.data.amount / 100;
    const existingEnrollment = await Enrollment.findOne({
      userId,
      courseId: course._id,
    }).lean();
    const nextPaidAmount =
      paymentPlan === "installment"
        ? ((existingEnrollment as ExistingEnrollment | null)?.paidAmount || 0) +
          paidAmount
        : paidAmount;
    const installmentNumber =
      completedPayment?.installmentNumber ||
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
        accessSource: completedPayment?.accessCodeType
          ? completedPayment.accessCodeType
          : "payment",
        accessCode: completedPayment?.accessCode,
        affiliateCode: completedPayment?.affiliateCode,
        paidAmount: nextPaidAmount,
        totalAmountDue: course.price,
        currentInstallment: installmentNumber,
      },
      { upsert: true }
    );
    if (payment) {
      await recordAccessProgramConversion({
        courseId: course._id.toString(),
        accessCode: completedPayment?.accessCode,
        accessCodeType: completedPayment?.accessCodeType,
        affiliateCode: completedPayment?.affiliateCode,
      });
    }
  }

  return NextResponse.json({ received: true });
}

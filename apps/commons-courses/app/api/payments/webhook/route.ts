import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { connectDB } from "@/lib/db";
import Payment from "@/models/Payment";
import Enrollment from "@/models/Enrollment";
import Course from "@/models/Course";
import type Stripe from "stripe";

export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig = req.headers.get("stripe-signature");

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
      await Enrollment.findOneAndUpdate(
        { userId, courseId: course._id },
        {
          userId,
          courseId: course._id,
          status: "active",
          paymentId: session.id,
        },
        { upsert: true }
      );
    }
  }

  return NextResponse.json({ received: true });
}

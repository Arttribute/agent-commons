import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { stripe } from "@/lib/stripe";
import { connectDB } from "@/lib/db";
import Course from "@/models/Course";
import Payment from "@/models/Payment";
import { coursesData } from "@/data/courses";
import mongoose from "mongoose";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) {
    const signinUrl = new URL("/auth/signin", req.url);
    return NextResponse.redirect(signinUrl);
  }

  const { searchParams } = new URL(req.url);
  const courseSlug = searchParams.get("courseSlug");
  if (!courseSlug) {
    return NextResponse.json({ error: "Missing courseSlug." }, { status: 400 });
  }

  await connectDB();

  let courseMongoId: mongoose.Types.ObjectId | null = null;
  let coursePrice: number;
  let courseTitle: string;

  // Try DB first, fall back to static data
  const dbCourse = await Course.findOne({ slug: courseSlug, published: true });
  if (dbCourse) {
    if (dbCourse.isFree) {
      // Direct enroll for free courses
      return NextResponse.redirect(new URL("/dashboard", req.url));
    }
    courseMongoId = dbCourse._id;
    coursePrice = dbCourse.price;
    courseTitle = dbCourse.title;
  } else {
    const staticCourse = coursesData.find((c) => c.slug === courseSlug);
    if (!staticCourse) {
      return NextResponse.json({ error: "Course not found." }, { status: 404 });
    }
    if (staticCourse.isFree) {
      return NextResponse.redirect(new URL("/dashboard", req.url));
    }
    coursePrice = staticCourse.price;
    courseTitle = staticCourse.title;
  }

  const baseUrl =
    process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";

  const stripeSession = await stripe.checkout.sessions.create({
    payment_method_types: ["card"],
    line_items: [
      {
        price_data: {
          currency: "usd",
          product_data: {
            name: courseTitle,
            description: "Agent Commons Courses — Lifetime access",
          },
          unit_amount: coursePrice * 100,
        },
        quantity: 1,
      },
    ],
    mode: "payment",
    success_url: `${baseUrl}/dashboard?enrolled=1`,
    cancel_url: `${baseUrl}/courses/${courseSlug}`,
    metadata: {
      userId: session.user.id,
      courseSlug,
    },
  });

  // Record pending payment (best-effort)
  if (courseMongoId) {
    await Payment.create({
      userId: session.user.id,
      courseId: courseMongoId,
      stripeSessionId: stripeSession.id,
      amount: coursePrice,
      status: "pending",
    }).catch(() => {});
  }

  return NextResponse.redirect(stripeSession.url!);
}

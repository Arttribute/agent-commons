import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { stripe } from "@/lib/stripe";
import { initializePaystackTransaction } from "@/lib/paystack";
import { connectDB } from "@/lib/db";
import Course from "@/models/Course";
import Enrollment from "@/models/Enrollment";
import Payment from "@/models/Payment";
import mongoose from "mongoose";

type PaymentProvider = "stripe" | "paystack";
type PaymentPlan = "one_time" | "installment";
type AccessLevel = "full" | "partial";

interface CheckoutCourse {
  _id: mongoose.Types.ObjectId;
  title: string;
  price: number;
  currency?: string;
  isFree: boolean;
  paymentProviders?: PaymentProvider[];
  installmentPlan?: {
    enabled?: boolean;
    installmentAmount?: number;
    installmentCount?: number;
    releaseAccess?: "full_after_first_payment" | "module_by_module" | "full_after_completion";
  };
  educator?: {
    settlementMode?: "platform_rails" | "educator_direct";
    platformFeePercent?: number;
    paystackSubaccountCode?: string;
  };
}

interface ExistingEnrollment {
  currentInstallment?: number;
}

function getCourseCurrency(currency?: string) {
  return currency?.toLowerCase() === "kes" ? "kes" : "usd";
}

function getProvider(reqProvider: string | null, currency: string): PaymentProvider {
  if (reqProvider === "paystack" || reqProvider === "stripe") return reqProvider;
  return currency === "kes" ? "paystack" : "stripe";
}

function getPlanAmount(course: CheckoutCourse, plan: PaymentPlan) {
  if (plan === "one_time") return course.price;

  const installmentPlan = course.installmentPlan;
  if (!installmentPlan?.enabled) {
    throw new Error("Installments are not enabled for this course.");
  }

  if (installmentPlan.installmentAmount) {
    return installmentPlan.installmentAmount;
  }

  return Math.ceil(course.price / (installmentPlan.installmentCount || 4));
}

function getAccessLevel(course: CheckoutCourse, plan: PaymentPlan): AccessLevel {
  if (plan === "one_time") return "full";
  return course.installmentPlan?.releaseAccess === "full_after_first_payment"
    ? "full"
    : "partial";
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) {
    const signinUrl = new URL("/auth/signin", req.url);
    return NextResponse.redirect(signinUrl);
  }

  const { searchParams } = new URL(req.url);
  const courseSlug = searchParams.get("courseSlug");
  const requestedProvider = searchParams.get("provider");
  const requestedPlan = searchParams.get("plan") === "installment" ? "installment" : "one_time";
  if (!courseSlug) {
    return NextResponse.json({ error: "Missing courseSlug." }, { status: 400 });
  }

  await connectDB();

  const dbCourse = (await Course.findOne({
    slug: courseSlug,
    published: true,
  })) as CheckoutCourse | null;
  if (!dbCourse) {
    return NextResponse.json({ error: "Course not found." }, { status: 404 });
  }

  if (dbCourse.isFree) {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  const courseMongoId = dbCourse._id as mongoose.Types.ObjectId;
  let coursePrice: number;
  try {
    coursePrice = getPlanAmount(dbCourse, requestedPlan);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid payment plan.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
  const courseTitle = dbCourse.title;
  const courseCurrency = getCourseCurrency(dbCourse.currency);
  const provider = getProvider(requestedProvider, courseCurrency);
  const enabledProviders = dbCourse.paymentProviders || ["stripe"];
  if (!enabledProviders.includes(provider)) {
    return NextResponse.json(
      { error: `${provider} is not enabled for this course.` },
      { status: 400 }
    );
  }

  const baseUrl =
    process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
  const existingEnrollment = await Enrollment.findOne({
    userId: session.user.id,
    courseId: courseMongoId,
  }).lean();
  const nextInstallment =
    requestedPlan === "installment"
      ? ((existingEnrollment as ExistingEnrollment | null)?.currentInstallment || 0) + 1
      : undefined;

  if (provider === "paystack") {
    const providerReference = `ac_${courseMongoId}_${Date.now()}`;
    const subaccount =
      dbCourse.educator?.settlementMode === "platform_rails"
        ? dbCourse.educator?.paystackSubaccountCode
        : undefined;
    const transactionCharge =
      subaccount && typeof dbCourse.educator?.platformFeePercent === "number"
        ? Math.round(coursePrice * 100 * (dbCourse.educator.platformFeePercent / 100))
        : undefined;

    const paystackTransaction = await initializePaystackTransaction({
      email: session.user.email!,
      amount: coursePrice * 100,
      currency: courseCurrency.toUpperCase(),
      reference: providerReference,
      callback_url: `${baseUrl}/dashboard?payment=paystack`,
      channels:
        courseCurrency === "kes"
          ? ["mobile_money", "card", "bank_transfer"]
          : ["card", "bank_transfer"],
      subaccount,
      bearer: subaccount ? "account" : undefined,
      transaction_charge: transactionCharge,
      metadata: {
        userId: session.user.id,
        courseSlug,
        paymentPlan: requestedPlan,
        installmentNumber: nextInstallment,
        accessLevel: getAccessLevel(dbCourse, requestedPlan),
      },
    });

    await Payment.create({
      userId: session.user.id,
      courseId: courseMongoId,
      provider,
      channel: courseCurrency === "kes" ? "mobile_money" : "unknown",
      paymentPlan: requestedPlan,
      installmentNumber: nextInstallment,
      providerReference,
      providerAccessCode: paystackTransaction.access_code,
      checkoutUrl: paystackTransaction.authorization_url,
      amount: coursePrice,
      currency: courseCurrency,
      status: "pending",
      metadata: {
        courseSlug,
        installmentNumber: nextInstallment,
        accessLevel: getAccessLevel(dbCourse, requestedPlan),
      },
    });

    return NextResponse.redirect(paystackTransaction.authorization_url);
  }

  const stripeSession = await stripe.checkout.sessions.create({
    payment_method_types: ["card"],
    line_items: [
      {
        price_data: {
          currency: courseCurrency,
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
      paymentPlan: requestedPlan,
      installmentNumber: nextInstallment ?? null,
      accessLevel: getAccessLevel(dbCourse, requestedPlan),
    },
  });

  // Record pending payment (best-effort)
  if (courseMongoId) {
    await Payment.create({
      userId: session.user.id,
      courseId: courseMongoId,
      provider,
      paymentPlan: requestedPlan,
      installmentNumber: nextInstallment,
      stripeSessionId: stripeSession.id,
      providerReference: stripeSession.id,
      checkoutUrl: stripeSession.url || undefined,
      amount: coursePrice,
      currency: courseCurrency,
      status: "pending",
      metadata: {
        courseSlug,
        installmentNumber: nextInstallment,
        accessLevel: getAccessLevel(dbCourse, requestedPlan),
      },
    }).catch(() => {});
  }

  return NextResponse.redirect(stripeSession.url!);
}

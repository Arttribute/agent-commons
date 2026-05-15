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

function getProvider(
  reqProvider: string | null,
  currency: string,
  enabledProviders: PaymentProvider[]
): PaymentProvider {
  if (reqProvider === "paystack" || reqProvider === "stripe") return reqProvider;
  if (currency === "kes" && enabledProviders.includes("paystack")) {
    return "paystack";
  }
  return enabledProviders[0] || "stripe";
}

function redirectPaymentError(
  req: NextRequest,
  params: {
    code: string;
    courseSlug?: string;
    provider?: string;
    message?: string;
  }
) {
  const url = new URL("/payments/error", req.url);
  url.searchParams.set("code", params.code);
  if (params.courseSlug) url.searchParams.set("courseSlug", params.courseSlug);
  if (params.provider) url.searchParams.set("provider", params.provider);
  if (params.message) url.searchParams.set("message", params.message);
  return NextResponse.redirect(url);
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
    return redirectPaymentError(req, {
      code: "missing_course",
      message: "We could not tell which course you wanted to enroll in.",
    });
  }

  await connectDB();

  const dbCourse = (await Course.findOne({
    slug: courseSlug,
    published: true,
  })) as CheckoutCourse | null;
  if (!dbCourse) {
    return redirectPaymentError(req, { code: "course_not_found", courseSlug });
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
    return redirectPaymentError(req, {
      code: "invalid_payment_plan",
      courseSlug,
      message,
    });
  }
  const courseTitle = dbCourse.title;
  const courseCurrency = getCourseCurrency(dbCourse.currency);
  const enabledProviders = dbCourse.paymentProviders || ["stripe"];
  const provider = getProvider(requestedProvider, courseCurrency, enabledProviders);
  if (!enabledProviders.includes(provider)) {
    return redirectPaymentError(req, {
      code: "provider_not_enabled",
      courseSlug,
      provider,
    });
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

    let paystackTransaction;
    try {
      paystackTransaction = await initializePaystackTransaction({
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
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Paystack checkout could not be started.";
      return redirectPaymentError(req, {
        code: "provider_start_failed",
        courseSlug,
        provider,
        message,
      });
    }

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

  let stripeSession;
  try {
    stripeSession = await stripe.checkout.sessions.create({
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
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Stripe checkout could not be started.";
    return redirectPaymentError(req, {
      code: "provider_start_failed",
      courseSlug,
      provider,
      message,
    });
  }

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

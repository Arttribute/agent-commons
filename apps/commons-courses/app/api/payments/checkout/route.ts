import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { stripe } from "@/lib/stripe";
import { initializePaystackTransaction } from "@/lib/paystack";
import { connectDB } from "@/lib/db";
import Course from "@/models/Course";
import Enrollment from "@/models/Enrollment";
import Payment from "@/models/Payment";
import mongoose from "mongoose";
import { getSafeErrorMessage } from "@/lib/safe-error";
import { recoverCompletedEnrollment } from "@/lib/payment-recovery";
import {
  CourseAccessProgram,
  priceCourseAccess,
  recordAccessProgramConversion,
} from "@/lib/course-access";

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
  accessProgram?: CourseAccessProgram;
  educator?: {
    settlementMode?: "platform_rails" | "educator_direct";
    platformFeePercent?: number;
    paystackSubaccountCode?: string;
  };
}

interface ExistingEnrollment {
  currentInstallment?: number;
  accessLevel?: AccessLevel;
  paymentStatus?: "free" | "paid" | "partial" | "overdue";
  status?: "active" | "completed" | "cancelled";
}

function getCourseCurrency(currency?: string) {
  return currency?.toLowerCase() === "kes" ? "kes" : "usd";
}

function getProvider(
  reqProvider: string | null,
  currency: string,
  enabledProviders: PaymentProvider[]
): PaymentProvider {
  if (currency === "kes") {
    return "paystack";
  }
  if (reqProvider === "paystack" || reqProvider === "stripe") return reqProvider;
  return enabledProviders[0] || "stripe";
}

function redirectPaymentError(
  req: NextRequest,
  params: {
    code: string;
    courseSlug?: string;
    provider?: string;
  }
) {
  const url = new URL("/payments/error", req.url);
  url.searchParams.set("code", params.code);
  if (params.courseSlug) url.searchParams.set("courseSlug", params.courseSlug);
  if (params.provider) url.searchParams.set("provider", params.provider);
  return NextResponse.redirect(url);
}

function logProviderStartFailure(
  provider: PaymentProvider,
  courseSlug: string,
  err: unknown
) {
  console.error("Payment provider checkout failed", {
    provider,
    courseSlug,
    message: getSafeErrorMessage(err, "Unknown provider error"),
  });
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
  const accessCode = searchParams.get("accessCode") || searchParams.get("code");
  const affiliateCode = searchParams.get("affiliate") || searchParams.get("ref");
  if (!courseSlug) {
    return redirectPaymentError(req, {
      code: "missing_course",
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

  const courseMongoId = dbCourse._id as mongoose.Types.ObjectId;
  if (dbCourse.isFree) {
    await Enrollment.findOneAndUpdate(
      { userId: session.user.id, courseId: courseMongoId },
      {
        userId: session.user.id,
        courseId: courseMongoId,
        status: "active",
        accessLevel: "full",
        paymentStatus: "free",
        accessSource: "free",
        paidAmount: 0,
        totalAmountDue: 0,
      },
      { upsert: true }
    );
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  let coursePrice: number;
  try {
    coursePrice = getPlanAmount(dbCourse, requestedPlan);
  } catch {
    return redirectPaymentError(req, {
      code: "invalid_payment_plan",
      courseSlug,
    });
  }
  const accessPrice = priceCourseAccess({
    amount: coursePrice,
    accessProgram: dbCourse.accessProgram,
    accessCode,
    affiliateCode,
  });

  if (accessPrice.freeAccess) {
    await Enrollment.findOneAndUpdate(
      { userId: session.user.id, courseId: courseMongoId },
      {
        userId: session.user.id,
        courseId: courseMongoId,
        status: "active",
        accessLevel: "full",
        paymentStatus:
          accessPrice.accessCodeType === "discount" ? "paid" : "free",
        paymentId: accessPrice.accessCode,
        accessSource: accessPrice.accessCodeType,
        accessCode: accessPrice.accessCode,
        affiliateCode: accessPrice.affiliateCode,
        paidAmount: 0,
        totalAmountDue: dbCourse.price,
        currentInstallment: 0,
      },
      { upsert: true }
    );
    await recordAccessProgramConversion({
      courseId: courseMongoId.toString(),
      accessCode: accessPrice.accessCode,
      accessCodeType: accessPrice.accessCodeType,
      affiliateCode: accessPrice.affiliateCode,
    });
    return NextResponse.redirect(new URL("/dashboard?enrolled=1", req.url));
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
  const existing = existingEnrollment as ExistingEnrollment | null;
  if (
    existing?.status !== "cancelled" &&
    (existing?.accessLevel === "full" ||
      existing?.paymentStatus === "paid" ||
      existing?.paymentStatus === "free")
  ) {
    return NextResponse.redirect(new URL("/dashboard?enrolled=1", req.url));
  }
  const recoveredEnrollment = await recoverCompletedEnrollment({
    userId: session.user.id,
    courseId: courseMongoId.toString(),
  });
  if (recoveredEnrollment) {
    return NextResponse.redirect(new URL("/dashboard?enrolled=1", req.url));
  }
  const nextInstallment =
    requestedPlan === "installment"
      ? (existing?.currentInstallment || 0) + 1
      : undefined;

  if (provider === "paystack") {
    const providerReference = `ac-${courseMongoId}-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}`;
    const subaccount =
      dbCourse.educator?.settlementMode === "platform_rails"
        ? dbCourse.educator?.paystackSubaccountCode
        : undefined;
    const transactionCharge =
      subaccount && typeof dbCourse.educator?.platformFeePercent === "number"
        ? Math.min(
            Math.round(accessPrice.finalAmount * 100),
            Math.round(
              accessPrice.finalAmount *
                100 *
                (dbCourse.educator.platformFeePercent / 100)
            )
          )
        : undefined;

    let paystackTransaction;
    try {
      paystackTransaction = await initializePaystackTransaction({
        email: session.user.email!,
        amount: Math.round(accessPrice.finalAmount * 100),
        currency: courseCurrency.toUpperCase(),
        reference: providerReference,
        callback_url: `${baseUrl}/api/payments/paystack/callback`,
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
          accessCode: accessPrice.accessCode,
          accessCodeType: accessPrice.accessCodeType,
          affiliateCode: accessPrice.affiliateCode,
          discountAmount: accessPrice.discountAmount,
          originalAmount: accessPrice.originalAmount,
        },
      });
    } catch (err) {
      logProviderStartFailure(provider, courseSlug, err);
      return redirectPaymentError(req, {
        code: "provider_start_failed",
        courseSlug,
        provider,
      });
    }

    await Payment.create({
      userId: session.user.id,
      courseId: courseMongoId,
      provider,
      channel: courseCurrency === "kes" ? "mobile_money" : "unknown",
      paymentPlan: requestedPlan,
      installmentNumber: nextInstallment,
      stripeSessionId: `paystack:${providerReference}`,
      providerReference,
      providerAccessCode: paystackTransaction.access_code,
      checkoutUrl: paystackTransaction.authorization_url,
      originalAmount: accessPrice.originalAmount,
      discountAmount: accessPrice.discountAmount,
      accessCode: accessPrice.accessCode,
      accessCodeType: accessPrice.accessCodeType,
      affiliateCode: accessPrice.affiliateCode,
      affiliateCommissionAmount: accessPrice.affiliateCommissionAmount,
      amount: accessPrice.finalAmount,
      currency: courseCurrency,
      status: "pending",
      metadata: {
        courseSlug,
        installmentNumber: nextInstallment,
        accessLevel: getAccessLevel(dbCourse, requestedPlan),
        accessCode: accessPrice.accessCode,
        accessCodeType: accessPrice.accessCodeType,
        affiliateCode: accessPrice.affiliateCode,
        discountAmount: accessPrice.discountAmount,
        originalAmount: accessPrice.originalAmount,
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
            unit_amount: Math.round(accessPrice.finalAmount * 100),
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      success_url: `${baseUrl}/api/payments/stripe/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/courses/${courseSlug}`,
      metadata: {
        userId: session.user.id,
        courseSlug,
        paymentPlan: requestedPlan,
        installmentNumber: nextInstallment ?? null,
        accessLevel: getAccessLevel(dbCourse, requestedPlan),
        accessCode: accessPrice.accessCode || "",
        accessCodeType: accessPrice.accessCodeType || "",
        affiliateCode: accessPrice.affiliateCode || "",
        discountAmount: String(accessPrice.discountAmount),
        originalAmount: String(accessPrice.originalAmount),
      },
    });
  } catch (err) {
    logProviderStartFailure(provider, courseSlug, err);
    return redirectPaymentError(req, {
      code: "provider_start_failed",
      courseSlug,
      provider,
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
      originalAmount: accessPrice.originalAmount,
      discountAmount: accessPrice.discountAmount,
      accessCode: accessPrice.accessCode,
      accessCodeType: accessPrice.accessCodeType,
      affiliateCode: accessPrice.affiliateCode,
      affiliateCommissionAmount: accessPrice.affiliateCommissionAmount,
      amount: accessPrice.finalAmount,
      currency: courseCurrency,
      status: "pending",
      metadata: {
        courseSlug,
        installmentNumber: nextInstallment,
        accessLevel: getAccessLevel(dbCourse, requestedPlan),
        accessCode: accessPrice.accessCode,
        accessCodeType: accessPrice.accessCodeType,
        affiliateCode: accessPrice.affiliateCode,
        discountAmount: accessPrice.discountAmount,
        originalAmount: accessPrice.originalAmount,
      },
    }).catch(() => {});
  }

  return NextResponse.redirect(stripeSession.url!);
}

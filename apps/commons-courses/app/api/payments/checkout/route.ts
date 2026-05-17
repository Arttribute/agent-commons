import { NextRequest, NextResponse } from "next/server";
import type { Session } from "next-auth";
import { auth } from "@/lib/auth";
import { createAccountToken } from "@/lib/account-tokens";
import { getAppBaseUrl } from "@/lib/app-url";
import { stripe } from "@/lib/stripe";
import { initializePaystackTransaction } from "@/lib/paystack";
import { connectDB } from "@/lib/db";
import {
  sendEnrollmentEmail,
  sendVerificationEmail,
} from "@/lib/email/resend";
import Course from "@/models/Course";
import Enrollment from "@/models/Enrollment";
import Payment from "@/models/Payment";
import User from "@/models/User";
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
  slug: string;
  instructor?: string;
  duration?: string;
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
  emailSettings?: {
    enrollmentEnabled?: boolean;
    replyTo?: string;
    customIntro?: string;
  };
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

interface CheckoutUser {
  id: string;
  email: string;
  name?: string | null;
  canUseCheckoutSignIn: boolean;
  needsEmailVerification: boolean;
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

function normalizeEmail(email: string | null) {
  return email?.trim().toLowerCase() || "";
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function defaultNameFromEmail(email: string) {
  return email.split("@")[0]?.replace(/[._-]+/g, " ") || "Learner";
}

async function resolveCheckoutUser({
  session,
  email,
  acceptedTerms,
}: {
  session: Session | null;
  email: string | null;
  acceptedTerms: boolean;
}): Promise<CheckoutUser | null> {
  if (session?.user?.id && session.user.email) {
    if (acceptedTerms) {
      await User.findByIdAndUpdate(session.user.id, {
        $set: { termsAcceptedAt: new Date() },
      });
    }
    return {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
      canUseCheckoutSignIn: false,
      needsEmailVerification: false,
    };
  }

  const normalizedEmail = normalizeEmail(email);
  if (!isValidEmail(normalizedEmail) || !acceptedTerms) return null;

  const existing = await User.findOne({ email: normalizedEmail }).select(
    "+password"
  );
  if (existing) {
    if (!existing.termsAcceptedAt) {
      existing.termsAcceptedAt = new Date();
      await existing.save();
    }
    return {
      id: existing._id.toString(),
      email: existing.email,
      name: existing.name,
      canUseCheckoutSignIn: !existing.password && !existing.emailVerifiedAt,
      needsEmailVerification: Boolean(existing.password && !existing.emailVerifiedAt),
    };
  }

  const created = await User.create({
    name: defaultNameFromEmail(normalizedEmail),
    email: normalizedEmail,
    role: "learner",
    authProvider: "credentials",
    termsAcceptedAt: new Date(),
  });

  return {
    id: created._id.toString(),
    email: created.email,
    name: created.name,
    canUseCheckoutSignIn: true,
    needsEmailVerification: false,
  };
}

async function sendCheckoutVerificationIfNeeded({
  checkoutUser,
  courseSlug,
}: {
  checkoutUser: CheckoutUser;
  courseSlug: string;
}) {
  if (!checkoutUser.needsEmailVerification) return;

  const { token } = await createAccountToken({
    userId: checkoutUser.id,
    purpose: "email_verification",
    ttlMinutes: 60 * 24,
  });
  await sendVerificationEmail({
    user: { name: checkoutUser.name, email: checkoutUser.email },
    token,
    callbackUrl: `/courses/${courseSlug}/learn`,
  });
}

async function redirectAfterEnrollment({
  req,
  session,
  userId,
  courseSlug,
  canUseCheckoutSignIn,
}: {
  req: NextRequest;
  session: Session | null;
  userId: string;
  courseSlug: string;
  canUseCheckoutSignIn: boolean;
}) {
  if (session?.user?.id) {
    return NextResponse.redirect(new URL("/dashboard?enrolled=1", req.url));
  }

  if (!canUseCheckoutSignIn) {
    const signInUrl = new URL("/auth/signin", req.url);
    signInUrl.searchParams.set("callbackUrl", `/courses/${courseSlug}/learn`);
    return NextResponse.redirect(signInUrl);
  }

  const { token } = await createAccountToken({
    userId,
    purpose: "checkout_signin",
    ttlMinutes: 15,
  });
  const signInUrl = new URL("/auth/checkout", req.url);
  signInUrl.searchParams.set("token", token);
  signInUrl.searchParams.set("callbackUrl", `/courses/${courseSlug}/learn`);
  return NextResponse.redirect(signInUrl);
}

export async function GET(req: NextRequest) {
  const session = await auth();
  const { searchParams } = new URL(req.url);
  const courseSlug = searchParams.get("courseSlug");
  const requestedProvider = searchParams.get("provider");
  const requestedPlan = searchParams.get("plan") === "installment" ? "installment" : "one_time";
  const accessCode = searchParams.get("accessCode") || searchParams.get("code");
  const affiliateCode = searchParams.get("affiliate") || searchParams.get("ref");
  const checkoutUserEmail = searchParams.get("email") || searchParams.get("learnerEmail");
  const acceptedTerms = searchParams.get("acceptTerms") === "1";
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

  const checkoutUser = await resolveCheckoutUser({
    session,
    email: checkoutUserEmail,
    acceptedTerms,
  });
  if (!checkoutUser) {
    const signinUrl = new URL("/auth/signin", req.url);
    signinUrl.searchParams.set(
      "callbackUrl",
      `/api/payments/checkout?courseSlug=${encodeURIComponent(courseSlug)}`
    );
    return NextResponse.redirect(signinUrl);
  }
  await sendCheckoutVerificationIfNeeded({ checkoutUser, courseSlug });

  const courseMongoId = dbCourse._id as mongoose.Types.ObjectId;
  if (dbCourse.isFree) {
    const existingFreeEnrollment = await Enrollment.findOne({
      userId: checkoutUser.id,
      courseId: courseMongoId,
    }).lean();
    await Enrollment.findOneAndUpdate(
      { userId: checkoutUser.id, courseId: courseMongoId },
      {
        userId: checkoutUser.id,
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
    if (!existingFreeEnrollment) {
      await sendEnrollmentEmail(
        { name: checkoutUser.name, email: checkoutUser.email },
        {
          title: dbCourse.title,
          slug: dbCourse.slug,
          instructor: dbCourse.instructor,
          duration: dbCourse.duration,
          settings: dbCourse.emailSettings,
        }
      );
    }
    return redirectAfterEnrollment({
      req,
      session,
      userId: checkoutUser.id,
      courseSlug,
      canUseCheckoutSignIn: checkoutUser.canUseCheckoutSignIn,
    });
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
    const existingAccessEnrollment = await Enrollment.findOne({
      userId: checkoutUser.id,
      courseId: courseMongoId,
    }).lean();
    await Enrollment.findOneAndUpdate(
      { userId: checkoutUser.id, courseId: courseMongoId },
      {
        userId: checkoutUser.id,
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
    if (!existingAccessEnrollment) {
      await sendEnrollmentEmail(
        { name: checkoutUser.name, email: checkoutUser.email },
        {
          title: dbCourse.title,
          slug: dbCourse.slug,
          instructor: dbCourse.instructor,
          duration: dbCourse.duration,
          settings: dbCourse.emailSettings,
        }
      );
    }
    return redirectAfterEnrollment({
      req,
      session,
      userId: checkoutUser.id,
      courseSlug,
      canUseCheckoutSignIn: checkoutUser.canUseCheckoutSignIn,
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

  const baseUrl = getAppBaseUrl();
  const existingEnrollment = await Enrollment.findOne({
    userId: checkoutUser.id,
    courseId: courseMongoId,
  }).lean();
  const existing = existingEnrollment as ExistingEnrollment | null;
  if (
    existing?.status !== "cancelled" &&
    (existing?.accessLevel === "full" ||
      existing?.paymentStatus === "paid" ||
      existing?.paymentStatus === "free")
  ) {
    return redirectAfterEnrollment({
      req,
      session,
      userId: checkoutUser.id,
      courseSlug,
      canUseCheckoutSignIn: checkoutUser.canUseCheckoutSignIn,
    });
  }
  const recoveredEnrollment = await recoverCompletedEnrollment({
    userId: checkoutUser.id,
    courseId: courseMongoId.toString(),
  });
  if (recoveredEnrollment) {
    return redirectAfterEnrollment({
      req,
      session,
      userId: checkoutUser.id,
      courseSlug,
      canUseCheckoutSignIn: checkoutUser.canUseCheckoutSignIn,
    });
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
        email: checkoutUser.email,
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
          userId: checkoutUser.id,
          courseSlug,
          paymentPlan: requestedPlan,
          installmentNumber: nextInstallment,
          accessLevel: getAccessLevel(dbCourse, requestedPlan),
          accessCode: accessPrice.accessCode,
          accessCodeType: accessPrice.accessCodeType,
          affiliateCode: accessPrice.affiliateCode,
          discountAmount: accessPrice.discountAmount,
          originalAmount: accessPrice.originalAmount,
          checkoutSignin: checkoutUser.canUseCheckoutSignIn ? "1" : "0",
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
      userId: checkoutUser.id,
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
        userId: checkoutUser.id,
        courseSlug,
        installmentNumber: nextInstallment,
        accessLevel: getAccessLevel(dbCourse, requestedPlan),
        accessCode: accessPrice.accessCode,
        accessCodeType: accessPrice.accessCodeType,
        affiliateCode: accessPrice.affiliateCode,
        discountAmount: accessPrice.discountAmount,
        originalAmount: accessPrice.originalAmount,
        checkoutSignin: checkoutUser.canUseCheckoutSignIn,
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
      customer_email: checkoutUser.email,
      success_url: `${baseUrl}/api/payments/stripe/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/courses/${courseSlug}`,
      metadata: {
        userId: checkoutUser.id,
        courseSlug,
        paymentPlan: requestedPlan,
        installmentNumber: nextInstallment ?? null,
        accessLevel: getAccessLevel(dbCourse, requestedPlan),
        accessCode: accessPrice.accessCode || "",
        accessCodeType: accessPrice.accessCodeType || "",
        affiliateCode: accessPrice.affiliateCode || "",
        discountAmount: String(accessPrice.discountAmount),
        originalAmount: String(accessPrice.originalAmount),
        checkoutSignin: checkoutUser.canUseCheckoutSignIn ? "1" : "0",
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
      userId: checkoutUser.id,
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
        userId: checkoutUser.id,
        courseSlug,
        installmentNumber: nextInstallment,
        accessLevel: getAccessLevel(dbCourse, requestedPlan),
        accessCode: accessPrice.accessCode,
        accessCodeType: accessPrice.accessCodeType,
        affiliateCode: accessPrice.affiliateCode,
        discountAmount: accessPrice.discountAmount,
        originalAmount: accessPrice.originalAmount,
        checkoutSignin: checkoutUser.canUseCheckoutSignIn,
      },
    }).catch(() => {});
  }

  return NextResponse.redirect(stripeSession.url!);
}

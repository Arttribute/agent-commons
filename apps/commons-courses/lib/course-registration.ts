import crypto from "node:crypto";
import mongoose, { type ClientSession } from "mongoose";
import type { PublicEvent } from "@agent-commons/ui";
import { connectDB } from "@/lib/db";
import {
  priceCourseAccess,
  recordAccessProgramConversion,
} from "@/lib/course-access";
import {
  initializePaystackTransaction,
  verifyPaystackTransaction,
  type PaystackVerifiedTransaction,
} from "@/lib/paystack";
import { getAppBaseUrl } from "@/lib/app-url";
import { recordSaleLedger } from "@/lib/payout-ledger";
import {
  checkoutInput,
  eventConfigSchema,
  referenceSchema,
  slugSchema,
  parse,
  RegistrationError,
} from "@/lib/registration-policy";
import Course from "@/models/Course";
import Payment from "@/models/Payment";
import User from "@/models/User";
import Enrollment from "@/models/Enrollment";

const nowISO = () => new Date().toISOString();
export function registrationConfig(course: any) {
  if (!course?.published || !course.registration?.enabled)
    throw new RegistrationError("Registration not found", 404);
  return eventConfigSchema.parse({
    ...course.registration,
    summary: course.description,
    theme: {
      ...course.registration.theme,
      accent: course.theme?.primary || course.registration.theme?.accent,
      background:
        course.theme?.background || course.registration.theme?.background,
      ink: course.theme?.text || course.registration.theme?.ink,
      imageUrl:
        course.bannerImageUrl ||
        course.imageUrl ||
        course.registration.theme?.imageUrl ||
        "",
    },
    title: course.title,
    amountMinor: Math.round(course.price * 100),
    currency: (course.currency || "KES").toUpperCase(),
    capacity: course.maxEnrollments ?? null,
  });
}
async function load(slug: string, session?: ClientSession) {
  parse(slugSchema, slug);
  await connectDB();
  const course = await Course.findOne({
    slug,
    published: true,
    "registration.enabled": true,
  }).session(session || null);
  registrationConfig(course);
  return course!;
}
async function occupied(
  courseId: unknown,
  session?: ClientSession,
  exclude?: string,
) {
  return Payment.find({
    courseId,
    ...(exclude ? { providerReference: { $ne: exclude } } : {}),
    $or: [
      { status: "completed", "metadata.registration.status": "confirmed" },
      {
        status: "pending",
        "metadata.registration.status": "pending",
        "metadata.registration.expiresAt": { $gt: nowISO() },
      },
    ],
  })
    .session(session || null)
    .lean();
}
export async function publicRegistration(slug: string): Promise<PublicEvent> {
  const course = await load(slug),
    config = registrationConfig(course);
  const holds = await occupied(course._id);
  const used = holds.reduce(
    (n, p) => n + Number(p.metadata?.registration?.quantity || 0),
    0,
  );
  return {
    ...config,
    slug: course.slug,
    status: course.registration?.status || "open",
    available:
      config.capacity === null ? null : Math.max(0, config.capacity - used),
  };
}
function price(course: any, quantity: number, code: string, holds: any[]) {
  const c = registrationConfig(course);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > c.maxPerOrder)
    throw new RegistrationError("Please check the number of places");
  const program = course.accessProgram?.toObject?.() || course.accessProgram;
  const result = priceCourseAccess({
    amount: course.price * quantity,
    accessProgram: program,
    accessCode: code,
  });
  if (
    code &&
    !priceCourseAccess({
      amount: course.price * quantity,
      accessProgram: { ...program, earlyPaymentDiscounts: [] },
      accessCode: code,
    }).accessCode
  )
    throw new RegistrationError("That code is unavailable or has expired");
  const all = [
    ...(course.accessProgram?.discounts || []),
    ...(course.accessProgram?.scholarships || []),
    ...(course.accessProgram?.passes || []),
    ...(course.accessProgram?.earlyPaymentDiscounts || []),
  ];
  const rule = all.find(
    (r: any) => r.code === result.accessCode || r.id === result.accessCode,
  );
  const pending = holds.filter(
    (p) => p.status === "pending" && p.accessCode === result.accessCode,
  ).length;
  if (
    rule?.maxRedemptions &&
    Number(rule.redeemedCount || 0) + pending >= rule.maxRedemptions
  )
    throw new RegistrationError(
      "That code is currently in use or has reached its limit",
      409,
    );
  return result;
}
export async function quoteRegistration(slug: string, input: any) {
  const course = await load(slug),
    code = String(input?.code || "")
      .trim()
      .toUpperCase();
  if (code.length > 32) throw new RegistrationError("Please check the code");
  const p = price(course, input?.quantity, code, await occupied(course._id));
  return {
    amountMinor: Math.round(p.finalAmount * 100),
    originalAmountMinor: Math.round(p.originalAmount * 100),
    discountAmountMinor: Math.round(p.discountAmount * 100),
    discountCode: p.accessCode || "",
  };
}
export function registrationReceipt(payment: any) {
  const r = payment.metadata.registration;
  return {
    reference: payment.providerReference,
    bookingCode: "AC-" + payment.providerReference.slice(-10).toUpperCase(),
    status: r.status,
    paymentStatus:
      payment.status === "completed"
        ? payment.amount
          ? "paid"
          : "free"
        : "unpaid",
    quantity: r.quantity,
    amountMinor: Math.round(payment.amount * 100),
    originalAmountMinor: Math.round(payment.originalAmount * 100),
    discountAmountMinor: Math.round(payment.discountAmount * 100),
    discountCode: payment.accessCode || null,
    currency: payment.currency.toUpperCase(),
    checkoutUrl:
      r.status === "pending" && r.expiresAt > nowISO()
        ? payment.checkoutUrl || null
        : null,
    expiresAt: r.expiresAt,
    paidAt: r.paidAt || null,
    paymentDetails: r.reviewReason
      ? {
          reason: r.reviewReason,
          amountMinor: r.receivedAmountMinor,
          currency: r.receivedCurrency,
        }
      : null,
  };
}
export async function startRegistration(slug: string, input: unknown) {
  await connectDB();
  let payment: any;
  await mongoose.connection.transaction(async (session) => {
    const course = await load(slug, session),
      config = registrationConfig(course);
    // A write to the course serializes seat/coupon allocation across all its checkouts.
    await Course.updateOne(
      { _id: course._id },
      { $inc: { registrationRevision: 1 } },
      { session },
    );
    const valid = checkoutInput(config, input);
    payment = await Payment.findOne({
      courseId: course._id,
      "metadata.registration.idempotencyKey": valid.idempotencyKey,
    }).session(session);
    if (payment) {
      if (payment.metadata.registration.hash !== valid.hash)
        throw new RegistrationError(
          "This booking changed. Please start again",
          409,
        );
      return;
    }
    if (course.registration?.status !== "open")
      throw new RegistrationError("Registration is closed", 409);
    const holds = await occupied(course._id, session),
      qty = valid.participants.length;
    const used = holds.reduce(
      (n, p) => n + Number(p.metadata?.registration?.quantity || 0),
      0,
    );
    if (config.capacity !== null && used + qty > config.capacity)
      throw new RegistrationError(
        "There are not enough places available for this booking",
        409,
      );
    const pricing = price(course, qty, valid.discountCode, holds),
      amountMinor = Math.round(pricing.finalAmount * 100);
    if (amountMinor > 0 && !course.paymentProviders?.includes("paystack"))
      throw new RegistrationError(
        "Paystack is not enabled for this programme",
        409,
      );
    if (
      valid.expectedAmountMinor !== undefined &&
      valid.expectedAmountMinor !== amountMinor
    )
      throw new RegistrationError(
        "The price changed. Apply your code again",
        409,
      );
    let user = await User.findOne({ email: valid.contact.email }).session(
      session,
    );
    if (!user)
      [user] = await User.create(
        [
          {
            email: valid.contact.email,
            name: valid.contact.name,
            role: "learner",
            authProvider: "credentials",
          },
        ],
        { session },
      );
    const reference = "ac_evt_" + crypto.randomBytes(24).toString("hex");
    [payment] = await Payment.create(
      [
        {
          userId: user!._id,
          courseId: course._id,
          provider: "paystack",
          paymentPlan: "one_time",
          providerReference: reference,
          stripeSessionId: "paystack:" + reference,
          originalAmount: pricing.originalAmount,
          amount: pricing.finalAmount,
          discountAmount: pricing.discountAmount,
          accessCode: pricing.accessCode,
          accessCodeType: pricing.accessCodeType,
          currency: config.currency.toLowerCase(),
          status: "pending",
          metadata: {
            courseSlug: slug,
            courseTitle: course.title,
            userId: String(user!._id),
            accessLevel: "full",
            registration: {
              status: "pending",
              idempotencyKey: valid.idempotencyKey,
              hash: valid.hash,
              quantity: qty,
              contact: valid.contact,
              participants: valid.participants,
              agreement: {
                text: config.agreementText,
                terms: config.terms,
                agreedAt: nowISO(),
              },
              expiresAt: new Date(Date.now() + 20 * 60_000).toISOString(),
            },
          },
        },
      ],
      { session },
    );
  });
  if (payment.amount === 0 && payment.status === "pending") {
    await completeRegistration(payment.providerReference, undefined, true);
    payment = await Payment.findById(payment._id);
  }
  if (payment.status !== "pending" || payment.checkoutUrl)
    return registrationReceipt(payment);
  const r = payment.metadata.registration;
  if (r.expiresAt <= nowISO())
    throw new RegistrationError(
      "This checkout has expired. Start a new booking",
      409,
    );
  const lock = await Payment.findOneAndUpdate(
    {
      _id: payment._id,
      checkoutUrl: { $exists: false },
      $or: [
        { "metadata.registration.initializingUntil": { $exists: false } },
        { "metadata.registration.initializingUntil": { $lt: nowISO() } },
      ],
    },
    {
      $set: {
        "metadata.registration.initializingUntil": new Date(
          Date.now() + 45_000,
        ).toISOString(),
      },
    },
    { new: true },
  );
  if (!lock) return registrationReceipt(payment);
  try {
    const course = await Course.findById(payment.courseId);
    const subaccount =
      course?.educator?.settlementMode === "platform_rails"
        ? course.educator.paystackSubaccountCode
        : undefined;
    const transaction = await initializePaystackTransaction({
      email: r.contact.email,
      amount: Math.round(payment.amount * 100),
      currency: payment.currency.toUpperCase(),
      reference: payment.providerReference,
      callback_url: `${getAppBaseUrl()}/api/payments/paystack/callback`,
      channels: ["mobile_money", "card", "bank_transfer"],
      subaccount,
      bearer: subaccount ? "account" : undefined,
      transaction_charge: subaccount
        ? Math.round(
            payment.amount * (course?.educator?.platformFeePercent || 0),
          )
        : undefined,
      metadata: {
        userId: String(payment.userId),
        courseSlug: slug,
        purpose: "course_registration",
        registration: true,
        accessCode: payment.accessCode,
      },
    });
    if (
      transaction.reference !== payment.providerReference ||
      new URL(transaction.authorization_url).origin !==
        "https://checkout.paystack.com"
    )
      throw new Error("Unexpected payment provider response");
    payment = await Payment.findByIdAndUpdate(
      payment._id,
      {
        $set: {
          checkoutUrl: transaction.authorization_url,
          providerAccessCode: transaction.access_code,
        },
        $unset: { "metadata.registration.initializingUntil": "" },
      },
      { new: true },
    );
    return registrationReceipt(payment);
  } catch (error) {
    // Provider initialization can have succeeded before a timeout. Keep the same
    // reference and hold so a verified late callback can still be reconciled.
    await Payment.updateOne(
      { _id: payment._id },
      { $unset: { "metadata.registration.initializingUntil": "" } },
    );
    console.error("Programme checkout initialization failed", {
      reference: payment.providerReference,
      message: error instanceof Error ? error.message : "Provider error",
    });
    throw new RegistrationError(
      "Payment checkout is temporarily unavailable. Please try again",
      503,
    );
  }
}
export async function completeRegistration(
  reference: string,
  verified?: PaystackVerifiedTransaction,
  free = false,
) {
  await connectDB();
  let result: any;
  await mongoose.connection.transaction(async (session) => {
    const payment = await Payment.findOne({
      provider: "paystack",
      providerReference: reference,
    }).session(session);
    if (!payment?.metadata?.registration) {
      result = { fulfilled: false, reason: "missing_payment_context" };
      return;
    }
    const course = await Course.findById(payment.courseId).session(session);
    if (!course) {
      result = { fulfilled: false, reason: "missing_course" };
      return;
    }
    await Course.updateOne(
      { _id: course._id },
      { $inc: { registrationRevision: 1 } },
      { session },
    );
    const r = payment.metadata.registration;
    if (payment.status === "completed") {
      result = {
        fulfilled: r.status === "confirmed",
        payment,
        course,
        reason: r.reviewReason,
      };
      return;
    }
    if (free && payment.amount !== 0)
      throw new RegistrationError(
        "This payment requires Paystack verification",
      );
    const config = registrationConfig(course),
      holds = await occupied(course._id, session, reference);
    const occupiedPlaces = holds.reduce(
      (n, p) => n + Number(p.metadata?.registration?.quantity || 0),
      0,
    );
    const expectedMode = process.env.PAYSTACK_SECRET_KEY?.startsWith("sk_live_")
      ? "live"
      : "test";
    if (!free && (!verified || verified.status !== "success")) {
      result = {
        fulfilled: false,
        payment,
        course,
        reason: "payment_not_successful",
      };
      return;
    }
    const expectedAmountMinor = Math.round(payment.amount * 100);
    let reason =
      free && payment.amount !== 0
        ? "Invalid free payment"
        : !free &&
            (verified!.reference !== reference ||
              verified!.amount !== Math.round(payment.amount * 100) ||
              verified!.currency.toUpperCase() !==
                payment.currency.toUpperCase() ||
              verified!.domain !== expectedMode)
          ? "Payment details need checking"
          : config.capacity !== null &&
              occupiedPlaces + r.quantity > config.capacity
            ? "Payment arrived after the hold and all places were taken"
            : undefined;
    // Re-check the code limit if the payment arrived after its reservation expired.
    if (!reason && r.expiresAt <= nowISO() && payment.accessCode) {
      try {
        price(course, r.quantity, payment.accessCode, holds);
      } catch {
        reason = "Payment arrived after the code allocation expired";
      }
    }
    r.status = reason ? "review" : "confirmed";
    r.reviewReason = reason;
    r.paidAt = nowISO();
    r.transactionId = verified?.id;
    r.expectedAmountMinor = expectedAmountMinor;
    r.receivedAmountMinor = verified?.amount ?? 0;
    r.receivedCurrency = verified?.currency || payment.currency;
    r.expectedCurrency = payment.currency;
    if (verified && verified.domain === expectedMode) {
      payment.amount = verified.amount / 100;
      if (verified.currency.toLowerCase() !== payment.currency) {
        r.expectedOriginalAmount = payment.originalAmount;
        r.expectedDiscountAmount = payment.discountAmount;
        payment.originalAmount = payment.amount;
        payment.discountAmount = 0;
        payment.currency = verified.currency.toLowerCase();
      }
    }
    payment.status =
      !free && verified?.domain !== expectedMode ? "failed" : "completed";
    payment.metadata = { ...payment.metadata, registration: r };
    payment.channel = verified?.channel || "unknown";
    payment.markModified("metadata");
    await payment.save({ session });
    if (!reason) {
      await Enrollment.findOneAndUpdate(
        { userId: payment.userId, courseId: course._id },
        {
          $set: {
            status: "active",
            accessLevel: "full",
            paymentStatus: payment.amount ? "paid" : "free",
            paymentId: reference,
            totalAmountDue: course.price,
            accessSource: payment.accessCodeType || "payment",
            accessCode: payment.accessCode,
          },
          $inc: { paidAmount: payment.amount },
        },
        { upsert: true, session },
      );
      await recordAccessProgramConversion({
        courseId: String(course._id),
        accessCode: payment.accessCode,
        accessCodeType: payment.accessCodeType,
        affiliateCode: payment.affiliateCode,
        session,
      });
    }
    result = {
      fulfilled: !reason,
      payment,
      course,
      reason,
      newlyCompleted: true,
    };
  });
  if (result?.payment?.status === "completed")
    await recordSaleLedger(String(result.payment._id));
  return result;
}
export async function getRegistrationReceipt(
  slug: string,
  reference: string,
  verify = false,
) {
  const course = await load(slug);
  parse(referenceSchema, reference);
  let payment = await Payment.findOne({
    courseId: course._id,
    providerReference: reference,
    "metadata.registration": { $exists: true },
  });
  if (!payment) throw new RegistrationError("Booking not found", 404);
  if (verify && payment.status === "pending" && payment.amount > 0) {
    const transaction = await verifyPaystackTransaction(reference);
    if (transaction.status === "success") {
      await completeRegistration(reference, transaction);
      payment = await Payment.findById(payment._id);
    }
  }
  return registrationReceipt(payment);
}

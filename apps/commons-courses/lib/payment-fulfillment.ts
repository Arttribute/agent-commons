import Course from "@/models/Course";
import Enrollment from "@/models/Enrollment";
import Payment from "@/models/Payment";
import { recordAccessProgramConversion } from "@/lib/course-access";
import { recordSaleLedger } from "@/lib/payout-ledger";

type FulfillmentParams = {
  provider: "stripe" | "paystack";
  providerReference: string;
  stripePaymentIntentId?: string;
  channel?: string;
  fallback?: {
    userId?: string;
    courseSlug?: string;
    amount?: number;
    metadata?: Record<string, unknown>;
  };
};

type ExistingEnrollment = {
  paidAmount?: number;
  currentInstallment?: number;
};

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

export async function fulfillCompletedPayment(params: FulfillmentParams) {
  const paymentQuery =
    params.provider === "stripe"
      ? { stripeSessionId: params.providerReference }
      : { provider: "paystack", providerReference: params.providerReference };

  const updatedPayment = await Payment.findOneAndUpdate(
    { ...paymentQuery, status: { $ne: "completed" } },
    {
      status: "completed",
      channel: params.channel || undefined,
      stripePaymentIntentId: params.stripePaymentIntentId,
    },
    { new: true }
  );
  if (updatedPayment?._id) {
    await recordSaleLedger(updatedPayment._id.toString());
  }

  const payment = updatedPayment || (await Payment.findOne(paymentQuery));
  const metadata = payment?.metadata || params.fallback?.metadata;
  const courseSlug = getMetadataString(metadata, "courseSlug") || params.fallback?.courseSlug;
  const userId = payment?.userId?.toString() || params.fallback?.userId;
  const course = payment?.courseId
    ? await Course.findById(payment.courseId)
    : await Course.findOne({ slug: courseSlug });

  if (!payment || !course || !userId) {
    return { fulfilled: false, payment, course, reason: "missing_payment_context" };
  }

  const paymentPlan = payment.paymentPlan || "one_time";
  const requestedAccessLevel =
    getMetadataString(metadata, "accessLevel") ||
    (paymentPlan === "installment" ? "partial" : "full");
  const paidAmount = payment.amount || params.fallback?.amount || course.price;
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
    payment.installmentNumber ||
    getMetadataNumber(metadata, "installmentNumber") ||
    (paymentPlan === "installment"
      ? ((existingEnrollment as ExistingEnrollment | null)?.currentInstallment || 0) + 1
      : 0);
  const paymentStatus =
    paymentPlan === "installment" && nextPaidAmount < course.price
      ? "partial"
      : "paid";

  await Enrollment.findOneAndUpdate(
    { userId, courseId: course._id },
    {
      userId,
      courseId: course._id,
      status: "active",
      accessLevel: paymentStatus === "paid" ? "full" : requestedAccessLevel,
      paymentStatus,
      paymentId: params.providerReference,
      accessSource: payment.accessCodeType || "payment",
      accessCode: payment.accessCode,
      affiliateCode: payment.affiliateCode,
      paidAmount: nextPaidAmount,
      totalAmountDue: course.price,
      currentInstallment: installmentNumber,
    },
    { upsert: true }
  );

  if (updatedPayment) {
    await recordAccessProgramConversion({
      courseId: course._id.toString(),
      accessCode: payment.accessCode,
      accessCodeType: payment.accessCodeType,
      affiliateCode: payment.affiliateCode,
    });
  }

  return { fulfilled: true, payment, course };
}

import Course from "@/models/Course";
import Payment from "@/models/Payment";
import PayoutLedger from "@/models/PayoutLedger";

export async function recordSaleLedger(paymentId: string) {
  const payment = await Payment.findById(paymentId);
  if (!payment || payment.status !== "completed") return;

  const course = await Course.findById(payment.courseId);
  const educatorId = course?.educator?.userId;
  if (!course || !educatorId) return;

  const platformFeePercent = course.educator?.platformFeePercent ?? 20;
  const platformFee = Number(
    (payment.amount * (platformFeePercent / 100)).toFixed(2)
  );
  const netAmount = Number((payment.amount - platformFee).toFixed(2));

  await PayoutLedger.findOneAndUpdate(
    { paymentId: payment._id },
    {
      educatorId,
      courseId: course._id,
      paymentId: payment._id,
      type: "sale",
      grossAmount: payment.amount,
      platformFee,
      netAmount,
      currency: payment.currency,
      status: "available",
      provider: payment.provider,
      providerReference: payment.providerReference,
    },
    { upsert: true, new: true }
  );
}

import crypto from "node:crypto";
import QRCode from "qrcode";
import { connectDB } from "@/lib/db";
import { getAppBaseUrl } from "@/lib/app-url";
import {
  publicReceipt,
  receiptRetryAllowed,
} from "@/lib/payment-receipt-policy";
import Payment from "@/models/Payment";
import Course from "@/models/Course";
import User from "@/models/User";

export const receiptUrl = (token: string) =>
  new URL("/receipts/" + token, getAppBaseUrl()).href;
export const receiptQR = (token: string) =>
  QRCode.toBuffer(receiptUrl(token), {
    type: "png",
    width: 320,
    margin: 3,
    errorCorrectionLevel: "M",
  });
export async function ensurePaymentReceipt(paymentId: string) {
  await connectDB();
  let payment = await Payment.findById(paymentId);
  if (!payment || !["completed", "refunded"].includes(payment.status))
    return null;
  const course = await Course.findById(payment.courseId);
  if (!payment.metadata?.receipt?.token) {
    const snapshot = {
      programme: payment.metadata?.courseTitle || course?.title || "Programme",
      when: course?.registration?.when || "",
      location: course?.registration?.location || "",
      quantity: payment.metadata?.registration?.quantity || 1,
      paidAt:
        payment.metadata?.registration?.paidAt ||
        payment.updatedAt.toISOString(),
      note: course?.emailSettings?.receiptNote || "",
    };
    await Payment.updateOne(
      { _id: payment._id, "metadata.receipt.token": { $exists: false } },
      {
        $set: {
          "metadata.receipt.token": crypto.randomBytes(24).toString("hex"),
          "metadata.receipt.snapshot": snapshot,
          "metadata.receipt.qrEnabled":
            course?.emailSettings?.receiptQrEnabled !== false,
        },
      },
    );
    payment = await Payment.findById(paymentId);
  }
  return { payment, course, token: String(payment.metadata.receipt.token) };
}
export async function lookupPaymentReceipt(token: string) {
  if (!/^[a-f0-9]{48}$/.test(token)) return null;
  await connectDB();
  const payment = await Payment.findOne({
    "metadata.receipt.token": token,
  }).lean();
  return payment ? publicReceipt(payment as any) : null;
}
export async function sendPaymentReceipt(
  paymentId: string,
  options: { manual?: boolean; resend?: boolean; requestId?: string } = {},
) {
  const data = await ensurePaymentReceipt(paymentId);
  if (!data || data.payment.status !== "completed")
    return { status: "unavailable" };
  const { payment, course, token } = data;
  if (!options.manual && !course?.emailSettings?.receiptEnabled)
    return { status: "disabled" };
  const old = payment.metadata.receipt.email;
  if (old?.status === "sent" && !options.resend)
    return { status: "sent", messageId: old.messageId };
  if (
    options.resend &&
    !/^[a-zA-Z0-9_-]{16,100}$/.test(options.requestId || "")
  )
    throw new Error("Start a new receipt request");
  const operation = options.resend
    ? "receipt-" + paymentId + "-" + options.requestId
    : old?.operation || "receipt-" + paymentId + "-initial";
  if (old?.operation === operation && old.status === "sent")
    return { status: "sent", messageId: old.messageId };
  if (old?.operation === operation && !receiptRetryAllowed(old.firstAttemptAt))
    return {
      status: "review",
      error: "Check the earlier delivery before choosing Resend",
    };
  const lease = crypto.randomUUID(),
    now = new Date().toISOString();
  const claim = await Payment.findOneAndUpdate(
    {
      _id: payment._id,
      status: "completed",
      $and: [
        {
          $or: [
            { "metadata.receipt.email.status": { $ne: "sending" } },
            { "metadata.receipt.email.leaseUntil": { $lt: now } },
          ],
        },
        ...(!options.resend
          ? [{ "metadata.receipt.email.status": { $ne: "sent" } }]
          : [
              {
                $or: [
                  { "metadata.receipt.email.operation": { $ne: operation } },
                  { "metadata.receipt.email.status": { $ne: "sent" } },
                ],
              },
            ]),
      ],
    },
    {
      $set: {
        "metadata.receipt.email": {
          operation,
          lease,
          status: "sending",
          firstAttemptAt:
            old?.operation === operation ? old.firstAttemptAt : now,
          leaseUntil: new Date(Date.now() + 3 * 60_000).toISOString(),
        },
      },
    },
    { new: true },
  );
  if (!claim) return { status: "busy" };
  try {
    const user = await User.findById(payment.userId)
      .select("name email")
      .lean();
    const contact = payment.metadata?.registration?.contact || user;
    if (!contact?.email) throw new Error("This payment has no payer email");
    const { sendPaymentReceiptEmail } = await import("@/lib/email/resend");
    const qr =
      course?.emailSettings?.receiptQrEnabled === false
        ? undefined
        : await receiptQR(token);
    const messageId = await sendPaymentReceiptEmail({
      to: contact.email,
      name: contact.name,
      receipt: publicReceipt(claim as any)!,
      verificationUrl: receiptUrl(token),
      qr,
      courseId: String(payment.courseId),
      settings: course?.emailSettings,
      idempotencyKey: operation,
    });
    await Payment.updateOne(
      { _id: payment._id, "metadata.receipt.email.lease": lease },
      {
        $set: {
          "metadata.receipt.email.status": "sent",
          "metadata.receipt.email.messageId": messageId,
          "metadata.receipt.email.sentAt": new Date().toISOString(),
        },
        $unset: {
          "metadata.receipt.email.lease": "",
          "metadata.receipt.email.leaseUntil": "",
        },
      },
    );
    return { status: "sent", messageId };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message.slice(0, 300)
        : "Receipt delivery failed";
    await Payment.updateOne(
      { _id: payment._id, "metadata.receipt.email.lease": lease },
      {
        $set: {
          "metadata.receipt.email.status": "failed",
          "metadata.receipt.email.error": message,
        },
        $unset: {
          "metadata.receipt.email.lease": "",
          "metadata.receipt.email.leaseUntil": "",
        },
      },
    );
    return { status: "failed", error: message };
  }
}
export async function afterPaymentReceipt(payment: any, course: any) {
  if (!payment || payment.status !== "completed") return;
  try {
    await ensurePaymentReceipt(String(payment._id));
    if (course?.emailSettings?.receiptEnabled)
      await sendPaymentReceipt(String(payment._id));
  } catch (error) {
    console.error("Receipt preparation failed", {
      paymentId: String(payment._id),
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

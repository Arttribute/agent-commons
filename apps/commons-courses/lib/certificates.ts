import "server-only";
import { Resend } from "resend";
import { Types } from "mongoose";
import Certificate, { type ICertificate } from "@/models/Certificate";
import Enrollment from "@/models/Enrollment";
import type { ICourse } from "@/models/Course";
import { buildCertificateEmail } from "@/lib/email/certificate";
import { deliverCertificate } from "@/lib/certificate-delivery";
import { SAFE_RETRY_MS, SEND_LEASE_MS } from "@/lib/certificate-policy";

export async function sendCourseCertificate(course: ICourse, id: string, educatorId: string) {
  if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL) {
    throw new Error("Certificate email is not configured. Set the Resend API key and sender.");
  }
  const resend = new Resend(process.env.RESEND_API_KEY);
  const now = new Date();
  const lease = new Date(now.getTime() - SEND_LEASE_MS);
  return deliverCertificate<ICertificate>(id, {
    async claim() {
      return Certificate.findOneAndUpdate(
        {
          _id: id,
          courseId: course._id,
          $and: [
            { $or: [{ emailStatus: { $in: ["ready", "failed"] } }, { emailStatus: "sending", sendingStartedAt: { $lte: lease } }] },
            { $or: [{ firstAttemptAt: { $exists: false } }, { firstAttemptAt: { $gt: new Date(now.getTime() - SAFE_RETRY_MS) } }] },
          ],
        },
        { $set: { emailStatus: "sending", sendingStartedAt: now }, $unset: { emailError: 1 } },
        { new: true },
      ).select("+pdf +emailPayload");
    },
    async award(certificate) {
      const enrollment = await Enrollment.findOne({ courseId: course._id, userId: certificate.userId, status: { $ne: "cancelled" } });
      if (!enrollment) throw new Error("The participant no longer has an active enrollment.");
      if (!certificate.emailPayload) {
        certificate.emailPayload = await buildCertificateEmail(course, certificate);
        await certificate.save();
      }
      if (!certificate.awardedAt) {
        certificate.awardedAt = now;
        certificate.awardedBy = new Types.ObjectId(educatorId);
        await certificate.save();
      }
      // Do not fabricate lesson completions, quiz answers or points for an
      // educator-awarded workshop completion.
      enrollment.status = "completed";
      enrollment.completionSource = "certificate";
      enrollment.progress = 100;
      enrollment.completedAt ||= certificate.awardedAt;
      await enrollment.save();
    },
    async send(certificate) {
      if (!certificate.firstAttemptAt) {
        certificate.firstAttemptAt = new Date();
        await certificate.save();
      }
      const { data, error } = await resend.emails.send(
        {
          ...certificate.emailPayload!,
          attachments: [{ filename: certificate.filename, content: Buffer.from(certificate.pdf).toString("base64"), contentType: "application/pdf" }],
        },
        { idempotencyKey: `course-certificate/${certificate._id}` },
      );
      if (error || !data?.id) throw new Error(error?.message || "The email provider did not accept the certificate.");
      return data.id;
    },
    async sent(certificate, messageId) {
      await Certificate.updateOne(
        { _id: certificate._id, emailStatus: "sending", sendingStartedAt: now },
        { $set: { emailStatus: "sent", emailSentAt: new Date(), emailMessageId: messageId }, $unset: { sendingStartedAt: 1, emailError: 1 } },
      );
    },
    async failed(certificate, error) {
      await Certificate.updateOne(
        { _id: certificate._id, emailStatus: "sending", sendingStartedAt: now },
        { $set: { emailStatus: "failed", emailError: error.slice(0, 500) }, $unset: { sendingStartedAt: 1 } },
      );
    },
  });
}

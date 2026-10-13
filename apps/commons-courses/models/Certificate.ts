import mongoose, { Schema, type Document } from "mongoose";

export interface ICertificate extends Document {
  courseId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  preparedBy: mongoose.Types.ObjectId;
  recipientName: string;
  recipientEmail: string;
  completionPeriod: string;
  filename: string;
  pdf: Buffer;
  sha256: string;
  awardedAt?: Date;
  awardedBy?: mongoose.Types.ObjectId;
  emailStatus: "ready" | "sending" | "sent" | "failed";
  emailPayload?: {
    from: string;
    to: string[];
    subject: string;
    html: string;
    text: string;
    replyTo?: string;
  };
  firstAttemptAt?: Date;
  sendingStartedAt?: Date;
  emailSentAt?: Date;
  emailMessageId?: string;
  emailError?: string;
  createdAt: Date;
}

const CertificateSchema = new Schema<ICertificate>(
  {
    courseId: { type: Schema.Types.ObjectId, ref: "Course", required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    preparedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    recipientName: { type: String, required: true, maxlength: 160 },
    recipientEmail: { type: String, required: true, lowercase: true, trim: true },
    completionPeriod: { type: String, default: "", maxlength: 120 },
    filename: { type: String, required: true },
    pdf: { type: Buffer, required: true, select: false },
    sha256: { type: String, required: true },
    awardedAt: Date,
    awardedBy: { type: Schema.Types.ObjectId, ref: "User" },
    emailStatus: { type: String, enum: ["ready", "sending", "sent", "failed"], default: "ready" },
    emailPayload: { type: Schema.Types.Mixed, select: false },
    firstAttemptAt: Date,
    sendingStartedAt: Date,
    emailSentAt: Date,
    emailMessageId: String,
    emailError: String,
  },
  { timestamps: true },
);

CertificateSchema.index({ courseId: 1, userId: 1 }, { unique: true });
CertificateSchema.index({ userId: 1, awardedAt: -1 });

export default (mongoose.models.Certificate as mongoose.Model<ICertificate>) ||
  mongoose.model<ICertificate>("Certificate", CertificateSchema);

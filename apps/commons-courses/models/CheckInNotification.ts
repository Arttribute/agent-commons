import mongoose, { Document, Schema } from "mongoose";

export type CheckInEmailStatus =
  | "not_sent"
  | "pending"
  | "sent"
  | "skipped"
  | "failed";

export interface ICheckInNotification extends Document {
  assignmentId: mongoose.Types.ObjectId;
  courseId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  email?: string;
  emailStatus: CheckInEmailStatus;
  providerMessageId?: string;
  lastError?: string;
  sentAt?: Date;
  openedAt?: Date;
  startedAt?: Date;
  submittedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const CheckInNotificationSchema = new Schema<ICheckInNotification>(
  {
    assignmentId: {
      type: Schema.Types.ObjectId,
      ref: "Assignment",
      required: true,
    },
    courseId: { type: Schema.Types.ObjectId, ref: "Course", required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    email: { type: String, trim: true, lowercase: true },
    emailStatus: {
      type: String,
      enum: ["not_sent", "pending", "sent", "skipped", "failed"],
      default: "not_sent",
    },
    providerMessageId: String,
    lastError: String,
    sentAt: Date,
    openedAt: Date,
    startedAt: Date,
    submittedAt: Date,
  },
  { timestamps: true },
);

CheckInNotificationSchema.index(
  { assignmentId: 1, userId: 1 },
  { unique: true },
);
CheckInNotificationSchema.index({ courseId: 1, updatedAt: -1 });

export default mongoose.models.CheckInNotification ||
  mongoose.model<ICheckInNotification>(
    "CheckInNotification",
    CheckInNotificationSchema,
  );

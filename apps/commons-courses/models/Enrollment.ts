import mongoose, { Schema, Document } from "mongoose";

export interface IEnrollment extends Document {
  userId: mongoose.Types.ObjectId;
  courseId: mongoose.Types.ObjectId;
  status: "active" | "completed" | "cancelled";
  accessLevel: "full" | "partial";
  paymentStatus: "free" | "paid" | "partial" | "overdue";
  paymentId?: string;
  accessSource?:
    | "free"
    | "payment"
    | "discount"
    | "early_payment"
    | "scholarship"
    | "pass";
  accessCode?: string;
  affiliateCode?: string;
  paidAmount: number;
  totalAmountDue: number;
  currentInstallment: number;
  nextPaymentDueAt?: Date;
  paymentGraceEndsAt?: Date;
  enrolledAt: Date;
  completedAt?: Date;
  progress: number;
  completedLessons: string[];
}

const EnrollmentSchema = new Schema<IEnrollment>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    courseId: { type: Schema.Types.ObjectId, ref: "Course", required: true },
    status: {
      type: String,
      enum: ["active", "completed", "cancelled"],
      default: "active",
    },
    accessLevel: {
      type: String,
      enum: ["full", "partial"],
      default: "full",
    },
    paymentStatus: {
      type: String,
      enum: ["free", "paid", "partial", "overdue"],
      default: "free",
    },
    paymentId: String,
    accessSource: {
      type: String,
      enum: ["free", "payment", "discount", "early_payment", "scholarship", "pass"],
    },
    accessCode: String,
    affiliateCode: String,
    paidAmount: { type: Number, default: 0 },
    totalAmountDue: { type: Number, default: 0 },
    currentInstallment: { type: Number, default: 0 },
    nextPaymentDueAt: Date,
    paymentGraceEndsAt: Date,
    enrolledAt: { type: Date, default: Date.now },
    completedAt: Date,
    progress: { type: Number, default: 0 },
    completedLessons: [String],
  },
  { timestamps: true }
);

EnrollmentSchema.index({ userId: 1, courseId: 1 }, { unique: true });

export default mongoose.models.Enrollment ||
  mongoose.model<IEnrollment>("Enrollment", EnrollmentSchema);

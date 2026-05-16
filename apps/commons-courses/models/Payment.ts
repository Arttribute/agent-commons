import mongoose, { Schema, Document } from "mongoose";

export interface IPayment extends Document {
  userId: mongoose.Types.ObjectId;
  courseId: mongoose.Types.ObjectId;
  provider: "stripe" | "paystack";
  channel?: "card" | "mobile_money" | "bank_transfer" | "unknown";
  paymentPlan: "one_time" | "installment";
  installmentNumber?: number;
  stripeSessionId?: string;
  stripePaymentIntentId?: string;
  providerReference: string;
  providerAccessCode?: string;
  checkoutUrl?: string;
  originalAmount?: number;
  discountAmount?: number;
  accessCode?: string;
  accessCodeType?: "discount" | "scholarship" | "pass";
  affiliateCode?: string;
  affiliateCommissionAmount?: number;
  amount: number;
  currency: string;
  status: "pending" | "completed" | "failed" | "refunded";
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

const PaymentSchema = new Schema<IPayment>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    courseId: { type: Schema.Types.ObjectId, ref: "Course", required: true },
    provider: {
      type: String,
      enum: ["stripe", "paystack"],
      default: "stripe",
      required: true,
    },
    channel: {
      type: String,
      enum: ["card", "mobile_money", "bank_transfer", "unknown"],
      default: "unknown",
    },
    paymentPlan: {
      type: String,
      enum: ["one_time", "installment"],
      default: "one_time",
    },
    installmentNumber: Number,
    stripeSessionId: String,
    stripePaymentIntentId: String,
    providerReference: { type: String, required: true, unique: true },
    providerAccessCode: String,
    checkoutUrl: String,
    originalAmount: Number,
    discountAmount: { type: Number, default: 0 },
    accessCode: String,
    accessCodeType: {
      type: String,
      enum: ["discount", "scholarship", "pass"],
    },
    affiliateCode: String,
    affiliateCommissionAmount: Number,
    amount: { type: Number, required: true },
    currency: { type: String, default: "usd" },
    status: {
      type: String,
      enum: ["pending", "completed", "failed", "refunded"],
      default: "pending",
    },
    metadata: Schema.Types.Mixed,
  },
  { timestamps: true }
);

PaymentSchema.index({ stripeSessionId: 1 }, { unique: true, sparse: true });

export default mongoose.models.Payment ||
  mongoose.model<IPayment>("Payment", PaymentSchema);

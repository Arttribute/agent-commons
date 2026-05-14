import mongoose, { Schema, Document } from "mongoose";

export interface IPayoutLedger extends Document {
  educatorId: mongoose.Types.ObjectId;
  courseId?: mongoose.Types.ObjectId;
  paymentId?: mongoose.Types.ObjectId;
  type: "sale" | "refund" | "payout" | "adjustment";
  grossAmount: number;
  platformFee: number;
  netAmount: number;
  currency: string;
  status: "pending" | "available" | "paid" | "void";
  provider?: "stripe" | "paystack" | "manual";
  providerReference?: string;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const PayoutLedgerSchema = new Schema<IPayoutLedger>(
  {
    educatorId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    courseId: { type: Schema.Types.ObjectId, ref: "Course" },
    paymentId: { type: Schema.Types.ObjectId, ref: "Payment" },
    type: {
      type: String,
      enum: ["sale", "refund", "payout", "adjustment"],
      required: true,
    },
    grossAmount: { type: Number, required: true },
    platformFee: { type: Number, default: 0 },
    netAmount: { type: Number, required: true },
    currency: { type: String, default: "usd" },
    status: {
      type: String,
      enum: ["pending", "available", "paid", "void"],
      default: "pending",
    },
    provider: {
      type: String,
      enum: ["stripe", "paystack", "manual"],
    },
    providerReference: String,
    notes: String,
  },
  { timestamps: true }
);

PayoutLedgerSchema.index({ educatorId: 1, createdAt: -1 });
PayoutLedgerSchema.index({ paymentId: 1 }, { unique: true, sparse: true });

export default mongoose.models.PayoutLedger ||
  mongoose.model<IPayoutLedger>("PayoutLedger", PayoutLedgerSchema);

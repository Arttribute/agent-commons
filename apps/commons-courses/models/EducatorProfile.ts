import mongoose, { Schema, Document } from "mongoose";

export interface IEducatorProfile extends Document {
  userId: mongoose.Types.ObjectId;
  displayName: string;
  bio?: string;
  organization?: string;
  plan: "free" | "starter" | "growth" | "institution";
  status: "active" | "paused";
  settlementMode: "platform_rails" | "educator_direct";
  platformFeePercent: number;
  paystackSubaccountCode?: string;
  stripeAccountId?: string;
  payoutEmail?: string;
  payoutPhone?: string;
  createdAt: Date;
  updatedAt: Date;
}

const EducatorProfileSchema = new Schema<IEducatorProfile>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    displayName: { type: String, required: true, trim: true },
    bio: String,
    organization: String,
    plan: {
      type: String,
      enum: ["free", "starter", "growth", "institution"],
      default: "free",
    },
    status: {
      type: String,
      enum: ["active", "paused"],
      default: "active",
    },
    settlementMode: {
      type: String,
      enum: ["platform_rails", "educator_direct"],
      default: "platform_rails",
    },
    platformFeePercent: { type: Number, default: 20, min: 0, max: 100 },
    paystackSubaccountCode: String,
    stripeAccountId: String,
    payoutEmail: String,
    payoutPhone: String,
  },
  { timestamps: true }
);

export default mongoose.models.EducatorProfile ||
  mongoose.model<IEducatorProfile>("EducatorProfile", EducatorProfileSchema);

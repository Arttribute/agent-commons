import mongoose, { Schema, Document } from "mongoose";

export interface IAccountToken extends Document {
  userId: mongoose.Types.ObjectId;
  tokenHash: string;
  purpose: "email_verification" | "password_reset" | "checkout_signin";
  expiresAt: Date;
  usedAt?: Date;
  createdAt: Date;
}

const AccountTokenSchema = new Schema<IAccountToken>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    tokenHash: { type: String, required: true, unique: true },
    purpose: {
      type: String,
      enum: ["email_verification", "password_reset", "checkout_signin"],
      required: true,
    },
    expiresAt: { type: Date, required: true },
    usedAt: Date,
  },
  { timestamps: true }
);

AccountTokenSchema.index({ userId: 1, purpose: 1, usedAt: 1 });
AccountTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.models.AccountToken ||
  mongoose.model<IAccountToken>("AccountToken", AccountTokenSchema);

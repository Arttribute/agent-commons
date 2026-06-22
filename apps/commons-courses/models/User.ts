import mongoose, { Schema, Document } from "mongoose";

export interface IUser extends Document {
  name: string;
  email: string;
  image?: string;
  password?: string;
  role: "learner" | "educator" | "admin";
  emailVerifiedAt?: Date;
  authProvider?: "credentials" | "google";
  /** Timestamp of when the user accepted the Terms & Conditions. Null = not yet accepted. */
  termsAcceptedAt?: Date;
  createdAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    name: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    image: String,
    password: { type: String, select: false },
    role: {
      type: String,
      enum: ["learner", "educator", "admin"],
      default: "learner",
    },
    emailVerifiedAt: { type: Date, default: null },
    authProvider: {
      type: String,
      enum: ["credentials", "google"],
      default: "credentials",
    },
    termsAcceptedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export default mongoose.models.User ||
  mongoose.model<IUser>("User", UserSchema);

import crypto from "crypto";
import mongoose from "mongoose";
import AccountToken from "@/models/AccountToken";

export type AccountTokenPurpose =
  | "email_verification"
  | "password_reset"
  | "checkout_signin";

export function hashAccountToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export async function createAccountToken({
  userId,
  purpose,
  ttlMinutes,
}: {
  userId: string | mongoose.Types.ObjectId;
  purpose: AccountTokenPurpose;
  ttlMinutes: number;
}) {
  const token = crypto.randomBytes(32).toString("base64url");
  const tokenHash = hashAccountToken(token);
  const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000);

  await AccountToken.updateMany(
    { userId, purpose, usedAt: null },
    { usedAt: new Date() }
  );
  await AccountToken.create({
    userId,
    purpose,
    tokenHash,
    expiresAt,
  });

  return { token, expiresAt };
}

export async function consumeAccountToken({
  token,
  purpose,
}: {
  token: string;
  purpose: AccountTokenPurpose;
}) {
  const record = await AccountToken.findOne({
    tokenHash: hashAccountToken(token),
    purpose,
    usedAt: null,
    expiresAt: { $gt: new Date() },
  });
  if (!record) return null;

  record.usedAt = new Date();
  await record.save();
  return record;
}

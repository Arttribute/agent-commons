import { NextRequest, NextResponse } from "next/server";
import { consumeAccountToken } from "@/lib/account-tokens";
import { connectDB } from "@/lib/db";
import { sendWelcomeEmail } from "@/lib/email/resend";
import User from "@/models/User";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get("token");
  const callbackUrl = searchParams.get("callbackUrl") || "/dashboard";
  if (!token) {
    return NextResponse.redirect(new URL("/auth/signin?verified=0", req.url));
  }

  await connectDB();
  const record = await consumeAccountToken({
    token,
    purpose: "email_verification",
  });
  if (!record) {
    return NextResponse.redirect(new URL("/auth/signin?verified=0", req.url));
  }

  const user = await User.findById(record.userId);
  if (!user) {
    return NextResponse.redirect(new URL("/auth/signin?verified=0", req.url));
  }

  if (!user.emailVerifiedAt) {
    user.emailVerifiedAt = new Date();
    await user.save();
    await sendWelcomeEmail({ name: user.name, email: user.email });
  }

  const signInUrl = new URL("/auth/signin", req.url);
  signInUrl.searchParams.set("verified", "1");
  signInUrl.searchParams.set("callbackUrl", callbackUrl);
  return NextResponse.redirect(signInUrl);
}

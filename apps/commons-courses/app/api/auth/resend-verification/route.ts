import { NextRequest, NextResponse } from "next/server";
import { createAccountToken } from "@/lib/account-tokens";
import { connectDB } from "@/lib/db";
import { sendVerificationEmail } from "@/lib/email/resend";
import User from "@/models/User";

export async function POST(req: NextRequest) {
  const { email, callbackUrl } = await req.json();
  if (!email) {
    return NextResponse.json({ error: "Email is required." }, { status: 400 });
  }

  await connectDB();
  const user = await User.findOne({ email: String(email).toLowerCase() });
  if (user && !user.emailVerifiedAt) {
    const { token } = await createAccountToken({
      userId: user._id,
      purpose: "email_verification",
      ttlMinutes: 60 * 24,
    });
    await sendVerificationEmail({
      user: { name: user.name, email: user.email },
      token,
      callbackUrl,
    });
  }

  return NextResponse.json({ success: true });
}

import { NextRequest, NextResponse } from "next/server";
import { createAccountToken } from "@/lib/account-tokens";
import { connectDB } from "@/lib/db";
import { sendPasswordResetEmail } from "@/lib/email/resend";
import User from "@/models/User";

export async function POST(req: NextRequest) {
  const { email } = await req.json();
  if (!email) {
    return NextResponse.json({ error: "Email is required." }, { status: 400 });
  }

  await connectDB();
  const user = await User.findOne({ email: String(email).toLowerCase() });
  if (user?.password) {
    const { token } = await createAccountToken({
      userId: user._id,
      purpose: "password_reset",
      ttlMinutes: 60,
    });
    await sendPasswordResetEmail({
      user: { name: user.name, email: user.email },
      token,
    });
  }

  return NextResponse.json({ success: true });
}

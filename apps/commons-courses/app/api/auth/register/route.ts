import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { createAccountToken } from "@/lib/account-tokens";
import { connectDB } from "@/lib/db";
import { sendVerificationEmail } from "@/lib/email/resend";
import User from "@/models/User";

export async function POST(req: NextRequest) {
  try {
    const { name, email, password, callbackUrl } = await req.json();

    if (!name || !email || !password) {
      return NextResponse.json(
        { error: "All fields are required." },
        { status: 400 }
      );
    }
    if (password.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters." },
        { status: 400 }
      );
    }

    await connectDB();

    const existing = await User.findOne({ email });
    if (existing) {
      return NextResponse.json(
        { error: "An account with this email already exists." },
        { status: 409 }
      );
    }

    const hashed = await bcrypt.hash(password, 12);
    const user = await User.create({
      name,
      email,
      password: hashed,
      authProvider: "credentials",
    });
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

    return NextResponse.json({ success: true, verificationRequired: true }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Server error." }, { status: 500 });
  }
}

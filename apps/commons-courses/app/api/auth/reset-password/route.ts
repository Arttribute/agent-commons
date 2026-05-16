import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { consumeAccountToken } from "@/lib/account-tokens";
import { connectDB } from "@/lib/db";
import User from "@/models/User";

export async function POST(req: NextRequest) {
  const { token, password } = await req.json();
  if (!token || !password) {
    return NextResponse.json(
      { error: "Token and password are required." },
      { status: 400 }
    );
  }
  if (String(password).length < 8) {
    return NextResponse.json(
      { error: "Password must be at least 8 characters." },
      { status: 400 }
    );
  }

  await connectDB();
  const record = await consumeAccountToken({ token, purpose: "password_reset" });
  if (!record) {
    return NextResponse.json(
      { error: "This reset link is invalid or expired." },
      { status: 400 }
    );
  }

  await User.findByIdAndUpdate(record.userId, {
    password: await bcrypt.hash(password, 12),
    authProvider: "credentials",
    emailVerifiedAt: new Date(),
  });

  return NextResponse.json({ success: true });
}

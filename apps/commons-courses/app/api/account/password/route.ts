import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { auth } from "@/lib/auth";
import { connectDB } from "@/lib/db";
import User from "@/models/User";

export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { currentPassword, newPassword } = await req.json();
  if (!newPassword || String(newPassword).length < 8) {
    return NextResponse.json(
      { error: "New password must be at least 8 characters." },
      { status: 400 }
    );
  }

  await connectDB();
  const user = await User.findById(session.user.id).select("+password");
  if (!user) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }

  if (user.password) {
    const isValid = await bcrypt.compare(String(currentPassword || ""), user.password);
    if (!isValid) {
      return NextResponse.json(
        { error: "Current password is incorrect." },
        { status: 400 }
      );
    }
  }

  user.password = await bcrypt.hash(newPassword, 12);
  user.authProvider = user.authProvider || "credentials";
  if (!user.emailVerifiedAt) user.emailVerifiedAt = new Date();
  await user.save();

  return NextResponse.json({ success: true });
}

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { connectDB } from "@/lib/db";
import User from "@/models/User";

type AccountUser = {
  name?: string;
  email?: string;
  role?: string;
  emailVerifiedAt?: Date;
  authProvider?: string;
  password?: string;
};

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  await connectDB();
  const user = await User.findById(session.user.id)
    .select("name email role emailVerifiedAt authProvider +password")
    .lean() as AccountUser | null;
  if (!user) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }

  return NextResponse.json({
    user: {
      name: user.name,
      email: user.email,
      role: user.role,
      emailVerifiedAt: user.emailVerifiedAt,
      authProvider: user.authProvider,
      hasPassword: Boolean(user.password),
    },
  });
}

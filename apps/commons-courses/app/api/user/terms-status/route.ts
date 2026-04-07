import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { connectDB } from "@/lib/db";
import User from "@/models/User";

export async function GET() {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ accepted: false, loggedIn: false });
  }

  await connectDB();
  const user = await User.findById(session.user.id).select("termsAcceptedAt").lean();

  return NextResponse.json({
    loggedIn: true,
    accepted: !!(user as { termsAcceptedAt?: Date } | null)?.termsAcceptedAt,
    acceptedAt: (user as { termsAcceptedAt?: Date } | null)?.termsAcceptedAt ?? null,
  });
}

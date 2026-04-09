import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { connectDB } from "@/lib/db";
import User from "@/models/User";

export async function POST() {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  await connectDB();
  await User.findByIdAndUpdate(session.user.id, {
    $set: { termsAcceptedAt: new Date() },
  });

  return NextResponse.json({ accepted: true });
}

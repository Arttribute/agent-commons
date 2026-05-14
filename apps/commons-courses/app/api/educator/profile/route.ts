import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { connectDB } from "@/lib/db";
import EducatorProfile from "@/models/EducatorProfile";
import User from "@/models/User";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  await connectDB();
  const profile = await EducatorProfile.findOne({
    userId: session.user.id,
  }).lean();

  return NextResponse.json({ profile });
}

export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const body = await req.json();
  const displayName = body.displayName || session.user.name;
  if (!displayName) {
    return NextResponse.json(
      { error: "displayName is required." },
      { status: 400 }
    );
  }

  await connectDB();
  const profile = await EducatorProfile.findOneAndUpdate(
    { userId: session.user.id },
    {
      userId: session.user.id,
      displayName,
      bio: body.bio,
      organization: body.organization,
      payoutEmail: body.payoutEmail,
      payoutPhone: body.payoutPhone,
      settlementMode: body.settlementMode || "platform_rails",
      paystackSubaccountCode: body.paystackSubaccountCode,
      stripeAccountId: body.stripeAccountId,
    },
    { upsert: true, new: true, runValidators: true }
  );

  await User.findByIdAndUpdate(session.user.id, { role: "educator" });

  return NextResponse.json({ profile });
}

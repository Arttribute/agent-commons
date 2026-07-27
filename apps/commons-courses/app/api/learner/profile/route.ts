import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { connectDB } from "@/lib/db";
import {
  sanitizeLearnerProfile,
  serializeLearnerProfile,
} from "@/lib/learner-profile";
import LearnerProfile from "@/models/LearnerProfile";
import type { LearnerProfileData } from "@/types/learner-profile";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  await connectDB();
  const profile = (await LearnerProfile.findOne({ userId: session.user.id })
    .lean()) as (Partial<LearnerProfileData> & { updatedAt?: Date }) | null;

  return NextResponse.json({
    profile: serializeLearnerProfile(
      profile
        ? {
            ...profile,
            updatedAt: profile.updatedAt?.toISOString(),
          }
        : null,
    ),
  });
}
export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const patch = sanitizeLearnerProfile(await req.json());
  await connectDB();
  const profile = (await LearnerProfile.findOneAndUpdate(
    { userId: session.user.id },
    {
      $set: patch,
      $setOnInsert: { userId: session.user.id },
    },
    { upsert: true, new: true, runValidators: true },
  ).lean()) as unknown as Partial<LearnerProfileData> & { updatedAt?: Date };

  return NextResponse.json({
    profile: serializeLearnerProfile({
      ...profile,
      updatedAt: profile.updatedAt?.toISOString(),
    }),
  });
}

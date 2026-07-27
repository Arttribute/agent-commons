import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { connectDB } from "@/lib/db";
import LearnerProfile from "@/models/LearnerProfile";

const supportedSignals = {
  audio_started: "usageSignals.audioStarts",
  learning_view_helpful: "usageSignals.helpfulMarks",
} as const;

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const body = (await req.json()) as { signal?: keyof typeof supportedSignals };
  if (!body.signal || !supportedSignals[body.signal]) {
    return NextResponse.json({ error: "Unsupported signal." }, { status: 400 });
  }

  await connectDB();
  const profile = await LearnerProfile.findOne({ userId: session.user.id })
    .select("allowUsageLearning")
    .lean<{ allowUsageLearning?: boolean } | null>();
  if (profile?.allowUsageLearning === false) {
    return NextResponse.json({ recorded: false });
  }

  await LearnerProfile.updateOne(
    { userId: session.user.id },
    {
      $inc: { [supportedSignals[body.signal]]: 1 },
      $setOnInsert: { userId: session.user.id },
    },
    { upsert: true },
  );
  return NextResponse.json({ recorded: true });
}

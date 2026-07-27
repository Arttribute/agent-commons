import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { connectDB } from "@/lib/db";
import { generateLearningView } from "@/lib/learner-learning-runtime";
import { serializeLearnerProfile } from "@/lib/learner-profile";
import Course from "@/models/Course";
import LearnerProfile from "@/models/LearnerProfile";
import type { LearnerProfileData } from "@/types/learner-profile";

type Body = {
  kind?: "contextual_example" | "mind_map";
  courseSlug?: string;
  courseTitle?: string;
  contentTitle?: string;
  source?: string;
};

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(
      { error: "Sign in to create a learning view." },
      { status: 401 },
    );
  }

  const body = (await req.json()) as Body;
  if (
    !body.kind ||
    !["contextual_example", "mind_map"].includes(body.kind) ||
    !body.courseSlug ||
    !body.contentTitle ||
    !body.source
  ) {
    return NextResponse.json(
      { error: "kind, courseSlug, contentTitle, and source are required." },
      { status: 400 },
    );
  }

  const source = body.source.trim().slice(0, 16000);
  if (source.length < 20) {
    return NextResponse.json(
      { error: "There is not enough source content to create this view." },
      { status: 400 },
    );
  }

  await connectDB();
  const [course, storedProfile] = await Promise.all([
    Course.findOne({
      published: true,
      $or: [
        { slug: body.courseSlug },
        { "skillPack.slug": body.courseSlug },
        { "skillPacks.slug": body.courseSlug },
      ],
    })
      .select("_id title")
      .lean<{ _id: unknown; title: string } | null>(),
    LearnerProfile.findOne({ userId: session.user.id }).lean(),
  ]);
  if (!course) {
    return NextResponse.json({ error: "Content not found." }, { status: 404 });
  }

  const profile = serializeLearnerProfile(
    storedProfile as unknown as Partial<LearnerProfileData> | null,
  );
  if (body.kind === "contextual_example" && !profile.personalizationEnabled) {
    return NextResponse.json(
      { error: "Turn on personalization to create a contextual example." },
      { status: 409 },
    );
  }

  const view = await generateLearningView({
    kind: body.kind,
    courseTitle: body.courseTitle || course.title,
    contentTitle: body.contentTitle,
    source,
    profile,
  });

  if (profile.allowUsageLearning) {
    const signal =
      body.kind === "mind_map" ? "usageSignals.mindMapViews" : "usageSignals.contextualExampleViews";
    await LearnerProfile.updateOne(
      { userId: session.user.id },
      {
        $inc: { [signal]: 1 },
        $setOnInsert: { userId: session.user.id },
      },
      { upsert: true },
    );
  }

  return NextResponse.json({ kind: body.kind, view });
}

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { connectDB } from "@/lib/db";
import {
  buildManagedCoursesFilter,
  requireEducator,
  slugifyCourseTitle,
} from "@/lib/educator-auth";
import { normalizeCourseInput } from "@/lib/course-input";
import { indexCourseForSearch } from "@/lib/search-indexers";
import Course from "@/models/Course";
import EducatorProfile from "@/models/EducatorProfile";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  await connectDB();
  const filter =
    session.user.role === "admin"
      ? {}
      : buildManagedCoursesFilter({
          userId: session.user.id,
          email: session.user.email,
          role: session.user.role,
        });
  const courses = await Course.find(filter).sort({ updatedAt: -1 }).lean();

  return NextResponse.json({ courses });
}

export async function POST(req: NextRequest) {
  const authResult = await requireEducator();
  if (authResult.error) return authResult.error;

  const body = await req.json();
  if (!body.title || !body.tagline || !body.description) {
    return NextResponse.json(
      { error: "title, tagline, and description are required." },
      { status: 400 }
    );
  }

  await connectDB();
  const profile = await EducatorProfile.findOne({
    userId: authResult.session.userId,
  });
  const slug = body.slug || slugifyCourseTitle(body.title);
  const existing = await Course.findOne({ slug });
  if (existing) {
    return NextResponse.json(
      { error: "A course with this slug already exists." },
      { status: 409 }
    );
  }

  const course = await Course.create({
    ...normalizeCourseInput(body),
    slug,
    instructor: body.instructor || profile?.displayName || "CommonLab educator",
    longDescription:
      body.longDescription || body.description || "Course details coming soon.",
    duration: body.duration || "Self-paced",
    educator: {
      userId: authResult.session.userId,
      name: profile?.displayName,
      plan: profile?.plan || "free",
      settlementMode: profile?.settlementMode || "platform_rails",
      platformFeePercent: profile?.platformFeePercent ?? 20,
      paystackSubaccountCode: profile?.paystackSubaccountCode,
      stripeAccountId: profile?.stripeAccountId,
    },
  });
  await indexCourseForSearch(course);

  return NextResponse.json({ course }, { status: 201 });
}

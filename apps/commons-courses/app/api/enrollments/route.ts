import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { connectDB } from "@/lib/db";
import { sendEnrollmentEmail } from "@/lib/email/resend";
import Enrollment from "@/models/Enrollment";
import Course from "@/models/Course";

export async function GET() {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  await connectDB();
  const enrollments = await Enrollment.find({ userId: session.user.id })
    .populate("courseId", "title slug tagline duration level")
    .sort({ enrolledAt: -1 })
    .lean();

  return NextResponse.json(enrollments);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const { courseId } = await req.json();
    await connectDB();

    const course = await Course.findById(courseId);
    if (!course) {
      return NextResponse.json({ error: "Course not found." }, { status: 404 });
    }

    if (!course.isFree) {
      return NextResponse.json(
        { error: "This course requires payment." },
        { status: 402 },
      );
    }

    const existing = await Enrollment.findOne({
      userId: session.user.id,
      courseId,
    });
    if (existing) {
      if (existing.status === "cancelled") {
        existing.status = "active";
        existing.accessLevel = "full";
        existing.paymentStatus = "free";
        existing.accessSource = "free";
        existing.enrolledAt = new Date();
        await existing.save();
        return NextResponse.json(existing);
      }
      return NextResponse.json({ error: "Already enrolled." }, { status: 409 });
    }

    const enrollment = await Enrollment.create({
      userId: session.user.id,
      courseId,
      status: "active",
    });
    await sendEnrollmentEmail(
      { name: session.user.name, email: session.user.email },
      {
        id: String(course._id),
        title: course.title,
        slug: course.slug,
        instructor: course.instructor,
        duration: course.duration,
        settings: course.emailSettings,
      },
    );

    return NextResponse.json(enrollment, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Server error." }, { status: 500 });
  }
}

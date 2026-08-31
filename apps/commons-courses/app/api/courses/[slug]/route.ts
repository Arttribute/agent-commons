import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { connectDB } from "@/lib/db";
import { getCourseCollaboratorRole } from "@/lib/educator-auth";
import { getCourseStartStatus } from "@/lib/course-schedule";
import Course from "@/models/Course";
import type { ICourse } from "@/models/Course";
import Enrollment from "@/models/Enrollment";

type PublicCourse = {
  _id: unknown;
  startDate?: Date;
  catalogVisibility?: "public" | "private";
  educator?: { userId?: unknown };
  [key: string]: unknown;
};

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    await connectDB();
    const course = (await Course.findOne({
      slug,
      published: true,
    }).lean()) as PublicCourse | null;
    if (!course) {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }
    if (course.catalogVisibility === "private") {
      const session = await auth();
      const manages = Boolean(
        session?.user?.id &&
          (session.user.role === "admin" ||
            String(course.educator?.userId || "") === session.user.id ||
            getCourseCollaboratorRole(course as unknown as ICourse, {
              userId: session.user.id,
              email: session.user.email,
            })),
      );
      const enrolled =
        !manages && session?.user?.id
          ? await Enrollment.exists({
              userId: session.user.id,
              courseId: course._id,
              status: { $ne: "cancelled" },
            })
          : null;
      if (!manages && !enrolled) {
        return NextResponse.json({ error: "Not found." }, { status: 404 });
      }
    }
    const startStatus = getCourseStartStatus(
      course.startDate as Date | undefined,
    );
    return NextResponse.json({
      ...course,
      hasStarted: startStatus.started,
      startDateLabel: startStatus.label,
    });
  } catch {
    return NextResponse.json({ error: "Server error." }, { status: 500 });
  }
}

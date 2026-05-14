import { NextRequest, NextResponse } from "next/server";
import { requireEducatorCourse } from "@/lib/educator-auth";
import Enrollment from "@/models/Enrollment";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const result = await requireEducatorCourse(slug);
  if (result.error) return result.error;

  const enrollments = await Enrollment.find({ courseId: result.course._id })
    .populate("userId", "name email")
    .sort({ enrolledAt: -1 })
    .lean();

  return NextResponse.json({ enrollments });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const result = await requireEducatorCourse(slug);
  if (result.error) return result.error;

  const { enrollmentId, status, accessLevel, paymentStatus } = await req.json();
  if (!enrollmentId) {
    return NextResponse.json(
      { error: "enrollmentId is required." },
      { status: 400 }
    );
  }

  const update: Record<string, string> = {};
  if (["active", "completed", "cancelled"].includes(status)) update.status = status;
  if (["full", "partial"].includes(accessLevel)) update.accessLevel = accessLevel;
  if (["free", "paid", "partial", "overdue"].includes(paymentStatus)) {
    update.paymentStatus = paymentStatus;
  }

  const enrollment = await Enrollment.findOneAndUpdate(
    { _id: enrollmentId, courseId: result.course._id },
    { $set: update },
    { new: true }
  );

  if (!enrollment) {
    return NextResponse.json(
      { error: "Enrollment not found." },
      { status: 404 }
    );
  }

  return NextResponse.json({ enrollment });
}

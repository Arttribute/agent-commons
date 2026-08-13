import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { serializeCourseMaterial } from "@/lib/course-material-data";
import { serializeLabWorkspace } from "@/lib/lab-workspace-data";
import { connectDB } from "@/lib/db";
import Course from "@/models/Course";
import CourseMaterial from "@/models/CourseMaterial";
import Enrollment from "@/models/Enrollment";
import LabWorkspace from "@/models/LabWorkspace";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const currentUser = await auth();
  if (!currentUser?.user?.id) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const { slug } = await params;
  await connectDB();
  const course = await Course.findOne({ slug, published: true });
  if (!course) return NextResponse.json({ error: "Course not found." }, { status: 404 });
  const enrolled = await Enrollment.exists({ userId: currentUser.user.id, courseId: course._id, status: { $ne: "cancelled" } });
  if (!enrolled) return NextResponse.json({ error: "Enroll in this course to view its materials." }, { status: 403 });
  const materials = await CourseMaterial.find({ courseId: course._id, visibility: "course" }).sort({ createdAt: -1 });
  const workspaces = await LabWorkspace.find({ courseId: course._id, visibility: "course" }).sort({ createdAt: -1 });
  return NextResponse.json({ materials: materials.map(serializeCourseMaterial), workspaces: workspaces.map((workspace) => serializeLabWorkspace(workspace)) });
}

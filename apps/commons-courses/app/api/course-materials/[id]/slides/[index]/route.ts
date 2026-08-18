import { NextRequest, NextResponse } from "next/server";
import { mongo, Types } from "mongoose";
import { auth } from "@/lib/auth";
import { connectDB } from "@/lib/db";
import { getCourseCollaboratorRole } from "@/lib/educator-auth";
import Course from "@/models/Course";
import CourseMaterial from "@/models/CourseMaterial";
import Enrollment from "@/models/Enrollment";
import LiveParticipant from "@/models/LiveParticipant";
import LiveSession from "@/models/LiveSession";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; index: string }> },
) {
  const currentUser = await auth();
  if (!currentUser?.user?.id) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const { id, index: rawIndex } = await params;
  if (!Types.ObjectId.isValid(id)) return NextResponse.json({ error: "Slide not found." }, { status: 404 });
  const index = Number(rawIndex);
  if (!Number.isInteger(index) || index < 0) return NextResponse.json({ error: "Slide not found." }, { status: 404 });
  await connectDB();
  const material = await CourseMaterial.findById(id);
  const slideId = material?.slideGridFsIds?.[index];
  if (!material || !slideId) return NextResponse.json({ error: "Slide not found." }, { status: 404 });
  const course = await Course.findById(material.courseId);
  if (!course?.published) return NextResponse.json({ error: "Slide not found." }, { status: 404 });
  const manages = currentUser.user.role === "admin" || course.educator?.userId?.toString() === currentUser.user.id || Boolean(getCourseCollaboratorRole(course, { userId: currentUser.user.id, email: currentUser.user.email }));
  if (!manages && material.visibility === "educator") {
    return NextResponse.json({ error: "This material is limited to course facilitators." }, { status: 403 });
  }
  if (!manages && material.visibility === "live") {
    const sessionIds = await LiveSession.find({ courseId: material.courseId, "activities.materialId": String(material._id) }).distinct("_id");
    const attended = await LiveParticipant.exists({ sessionId: { $in: sessionIds }, userId: currentUser.user.id });
    if (!attended) return NextResponse.json({ error: "This material is limited to live-session participants." }, { status: 403 });
  } else if (!manages) {
    const enrolled = await Enrollment.exists({ userId: currentUser.user.id, courseId: material.courseId, status: { $ne: "cancelled" } });
    if (!enrolled) return NextResponse.json({ error: "This material is limited to course participants." }, { status: 403 });
  }
  const db = CourseMaterial.db.db;
  if (!db) return NextResponse.json({ error: "Slide storage is unavailable." }, { status: 503 });
  const stream = new mongo.GridFSBucket(db, { bucketName: "courseMaterials" }).openDownloadStream(new mongo.ObjectId(String(slideId)));
  const body = new ReadableStream({
    start(controller) {
      stream.on("data", (chunk) => controller.enqueue(new Uint8Array(chunk)));
      stream.on("end", () => controller.close());
      stream.on("error", (error) => controller.error(error));
    },
    cancel() { stream.destroy(); },
  });
  return new NextResponse(body, {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "private, max-age=3600, stale-while-revalidate=86400",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

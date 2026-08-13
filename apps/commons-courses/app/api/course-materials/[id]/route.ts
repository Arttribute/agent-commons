import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import { auth } from "@/lib/auth";
import { readEducatorCopilotFile } from "@/lib/educator-copilot-files";
import { connectDB } from "@/lib/db";
import { getCourseCollaboratorRole } from "@/lib/educator-auth";
import Course from "@/models/Course";
import CourseMaterial from "@/models/CourseMaterial";
import Enrollment from "@/models/Enrollment";
import LiveParticipant from "@/models/LiveParticipant";
import LiveSession from "@/models/LiveSession";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const currentUser = await auth();
  if (!currentUser?.user?.id) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const { id } = await params;
  if (!Types.ObjectId.isValid(id)) return NextResponse.json({ error: "Material not found." }, { status: 404 });
  await connectDB();
  const material = await CourseMaterial.findById(id);
  if (!material) return NextResponse.json({ error: "Material not found." }, { status: 404 });
  const course = await Course.findById(material.courseId);
  if (!course?.published) return NextResponse.json({ error: "Material not found." }, { status: 404 });
  const manages = currentUser.user.role === "admin" || course.educator?.userId?.toString() === currentUser.user.id ||
    Boolean(getCourseCollaboratorRole(course, { userId: currentUser.user.id, email: currentUser.user.email }));
  if (!manages && material.visibility === "live") {
    const liveSessionIds = await LiveSession.find({
      courseId: material.courseId,
      "activities.materialId": String(material._id),
    }).distinct("_id");
    const attended = await LiveParticipant.exists({
      sessionId: { $in: liveSessionIds },
      userId: currentUser.user.id,
    });
    if (!attended) return NextResponse.json({ error: "This material is limited to live-session participants." }, { status: 403 });
  } else if (!manages) {
    const enrolled = await Enrollment.exists({
      userId: currentUser.user.id,
      courseId: material.courseId,
      status: { $ne: "cancelled" },
    });
    if (!enrolled) return NextResponse.json({ error: "This material is limited to course participants." }, { status: 403 });
  }
  if (material.storage === "gridfs" && material.gridFsId) {
    return NextResponse.json({
      material: {
        id: String(material._id),
        name: material.name,
        mimeType: material.mimeType,
        kind: material.kind,
        content: material.textPreview || "",
        imageUrls: (material.slideGridFsIds || []).map(
          (_item: unknown, index: number) => `/api/course-materials/${material._id}/slides/${index}`,
        ),
        downloadUrl: `/api/course-materials/${material._id}/download`,
        embeddable: false,
      },
    }, { headers: { "Cache-Control": "private, no-store" } });
  }
  if (!material.fileId) return NextResponse.json({ error: "Material file is unavailable." }, { status: 410 });
  const accessToken = process.env.AGENT_COMMONS_API_KEY || currentUser.accessToken;
  if (!accessToken) return NextResponse.json({ error: "Material storage is temporarily unavailable." }, { status: 503 });
  const response = await readEducatorCopilotFile(material.fileId, {
    accessToken,
    principalId: material.ownerPrincipalId,
  }, { maxChars: 100_000, includeImageUrls: true, includeDownloadUrl: true });
  if (!response?.data) return NextResponse.json({ error: "Material could not be opened." }, { status: 502 });
  const download = response.data.download;
  const downloadUrl = response.data.downloadUrl || (typeof download === "string" ? download : download?.url);
  return NextResponse.json({
    material: {
      id: String(material._id),
      name: material.name,
      mimeType: material.mimeType,
      kind: material.kind,
      content: response.data.content || "",
      imageUrls: response.data.imageUrls || [],
      downloadUrl,
      embeddable: true,
    },
  }, { headers: { "Cache-Control": "private, no-store" } });
}

import { NextRequest, NextResponse } from "next/server";
import { serializeCourseMaterial } from "@/lib/course-material-data";
import { uploadEducatorCopilotFiles } from "@/lib/educator-copilot-files";
import { requireEducatorCourse } from "@/lib/educator-auth";
import CourseMaterial from "@/models/CourseMaterial";

const allowed = new Set([
  "application/pdf",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
]);
const maxSize = 50 * 1024 * 1024;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const result = await requireEducatorCourse(slug);
  if (result.error) return result.error;
  const materials = await CourseMaterial.find({ courseId: result.course._id }).sort({ createdAt: -1 });
  return NextResponse.json({ materials: materials.map(serializeCourseMaterial) });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const result = await requireEducatorCourse(slug);
  if (result.error) return result.error;
  const principalId = result.session.identityUserId?.trim();
  const accessToken = result.session.accessTokenError ? undefined : result.session.accessToken;
  if (!principalId || !accessToken) {
    return NextResponse.json(
      { error: "Reconnect your Commons account before uploading course materials." },
      { status: 409 },
    );
  }
  const form = await req.formData();
  const files = form.getAll("files").filter((item): item is File => item instanceof File).slice(0, 10);
  if (!files.length) return NextResponse.json({ error: "Choose a PDF or PowerPoint file." }, { status: 400 });
  const invalid = files.find((file) => !allowed.has(file.type) || file.size > maxSize);
  if (invalid) {
    return NextResponse.json({ error: `${invalid.name} must be a PDF or PowerPoint file smaller than 50 MB.` }, { status: 400 });
  }
  const uploaded = await uploadEducatorCopilotFiles(files, {
    accessToken,
    principalId,
    workspaceId: result.session.identityWorkspaceId,
    storageProvider: "s3",
  });
  if (uploaded.length !== files.length) {
    return NextResponse.json({ error: "One or more files could not be stored in Commons Library." }, { status: 502 });
  }
  const visibility = form.get("visibility") === "live" ? "live" : "course";
  const materials = await CourseMaterial.insertMany(uploaded.map((item, index) => ({
    courseId: result.course._id,
    courseSlug: result.course.slug,
    ownerUserId: result.session.userId,
    ownerPrincipalId: principalId,
    fileId: item.fileId,
    name: item.name || files[index].name,
    mimeType: item.mimeType || files[index].type,
    size: files[index].size,
    kind: files[index].type === "application/pdf" ? "pdf" : "presentation",
    visibility,
    status: item.status || "uploaded",
    textPreview: item.textPreview,
  })));
  return NextResponse.json({ materials: materials.map(serializeCourseMaterial) }, { status: 201 });
}

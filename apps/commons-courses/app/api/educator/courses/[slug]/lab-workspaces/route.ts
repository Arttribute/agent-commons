import { NextRequest, NextResponse } from "next/server";
import { parseLabArchive } from "@/lib/lab-archive";
import { serializeLabWorkspace } from "@/lib/lab-workspace-data";
import { deleteLabFiles, uploadLabFile } from "@/lib/lab-workspace-storage";
import { requireEducatorCourse } from "@/lib/educator-auth";
import LabWorkspace from "@/models/LabWorkspace";

const maxArchiveSize = 50 * 1024 * 1024;

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const result = await requireEducatorCourse(slug);
  if (result.error) return result.error;
  const workspaces = await LabWorkspace.find({
    courseId: result.course._id,
  }).sort({
    createdAt: -1,
  });
  return NextResponse.json({
    workspaces: workspaces.map((workspace) =>
      serializeLabWorkspace(workspace, { educator: true }),
    ),
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const result = await requireEducatorCourse(slug);
  if (result.error) return result.error;
  const form = await request.formData();
  const archive = form.get("archive");
  if (
    !(archive instanceof File) ||
    !archive.name.toLowerCase().endsWith(".zip")
  ) {
    return NextResponse.json(
      { error: "Choose a ZIP lab pack." },
      { status: 400 },
    );
  }
  if (archive.size > maxArchiveSize) {
    return NextResponse.json(
      { error: "Lab packs must be smaller than 50 MB." },
      { status: 400 },
    );
  }
  const title = String(form.get("title") || "")
    .trim()
    .slice(0, 140);
  if (!title)
    return NextResponse.json(
      { error: "Give this lab a title." },
      { status: 400 },
    );

  const sourceBytes = Buffer.from(await archive.arrayBuffer());
  let parsed: Awaited<ReturnType<typeof parseLabArchive>>;
  try {
    parsed = await parseLabArchive(sourceBytes);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "The ZIP file could not be read.",
      },
      { status: 400 },
    );
  }
  const uploadedIds: unknown[] = [];
  try {
    const sourcePackGridFsId = await uploadLabFile(
      sourceBytes,
      archive.name,
      "application/zip",
    );
    uploadedIds.push(sourcePackGridFsId);
    const learnerPackName = archive.name.replace(/\.zip$/i, "-learner.zip");
    const learnerPackGridFsId = await uploadLabFile(
      parsed.learnerPack,
      learnerPackName,
      "application/zip",
    );
    uploadedIds.push(learnerPackGridFsId);
    const files = [];
    for (const file of parsed.files) {
      const gridFsId = await uploadLabFile(
        file.bytes,
        file.name,
        file.mimeType,
      );
      uploadedIds.push(gridFsId);
      files.push({ ...file, bytes: undefined, gridFsId });
    }
    const workspace = await LabWorkspace.create({
      courseId: result.course._id,
      courseSlug: result.course.slug,
      ownerUserId: result.session.userId,
      title,
      description:
        String(form.get("description") || "")
          .trim()
          .slice(0, 1200) || undefined,
      instructions:
        String(form.get("instructions") || "")
          .trim()
          .slice(0, 5000) || undefined,
      visibility: form.get("visibility") === "live" ? "live" : "course",
      sourceFileName: archive.name,
      sourcePackGridFsId,
      sourcePackSize: sourceBytes.length,
      learnerPackGridFsId,
      learnerPackSize: parsed.learnerPack.length,
      files,
    });
    return NextResponse.json(
      { workspace: serializeLabWorkspace(workspace, { educator: true }) },
      { status: 201 },
    );
  } catch (error) {
    await deleteLabFiles(uploadedIds);
    console.error("Lab workspace upload failed", error);
    return NextResponse.json(
      { error: "The lab files could not be stored. Try again." },
      { status: 500 },
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { requireEducatorExperience, serializeExperienceProject } from "@/lib/experience-access";
import { normalizeExperienceDocument } from "@/lib/experience-schema";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const result = await requireEducatorExperience(id);
  if (!result.ok) return result.error;
  return NextResponse.json({
    experience: serializeExperienceProject(result.project),
  });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const result = await requireEducatorExperience(id);
  if (!result.ok) return result.error;

  const body = (await req.json().catch(() => ({}))) as {
    document?: unknown;
    baseVersion?: number;
    isFreePreview?: boolean;
  };
  if (
    typeof body.baseVersion === "number" &&
    body.baseVersion !== result.project.draftVersion
  ) {
    return NextResponse.json(
      {
        error:
          "This experience changed in another session. Reload before saving your edits.",
        experience: serializeExperienceProject(result.project),
      },
      { status: 409 },
    );
  }

  try {
    const document = normalizeExperienceDocument(body.document);
    result.project.draft = document;
    result.project.title = document.title;
    result.project.description = document.description;
    result.project.isFreePreview =
      typeof body.isFreePreview === "boolean"
        ? body.isFreePreview
        : result.project.isFreePreview;
    result.project.draftVersion += 1;
    result.project.updatedBy = result.session.userId as never;
    result.project.markModified("draft");
    await result.project.save();
    return NextResponse.json({
      experience: serializeExperienceProject(result.project),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "The experience document is invalid.",
      },
      { status: 400 },
    );
  }
}

import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireEducatorExperience, serializeExperienceProject } from "@/lib/experience-access";
import { normalizeExperienceDocument } from "@/lib/experience-schema";
import ExperienceRevision from "@/models/ExperienceRevision";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const result = await requireEducatorExperience(id);
  if (!result.ok) return result.error;

  try {
    const document = normalizeExperienceDocument(result.project.draft, {
      publish: true,
    });
    const version = (result.project.publishedVersion || 0) + 1;
    const contentHash = createHash("sha256")
      .update(JSON.stringify(document))
      .digest("hex");
    const revision = await ExperienceRevision.create({
      projectId: result.project._id,
      courseId: result.course._id,
      version,
      document,
      contentHash,
      publishedBy: result.session.userId,
    });

    result.project.status = "published";
    result.project.publishedRevisionId = revision._id;
    result.project.publishedVersion = version;
    result.project.publishedAt = new Date();
    result.project.updatedBy = result.session.userId as never;
    await result.project.save();

    return NextResponse.json({
      experience: serializeExperienceProject(result.project),
      revision: {
        id: String(revision._id),
        version,
        contentHash,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "The experience could not be published.",
      },
      { status: 400 },
    );
  }
}

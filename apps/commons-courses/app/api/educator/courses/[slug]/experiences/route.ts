import { NextRequest, NextResponse } from "next/server";
import { requireEducatorCourse } from "@/lib/educator-auth";
import {
  createStarterExperience,
  normalizeExperienceDocument,
} from "@/lib/experience-schema";
import { serializeExperienceProject } from "@/lib/experience-access";
import ExperienceProject from "@/models/ExperienceProject";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const result = await requireEducatorCourse(slug);
  if (result.error) return result.error;
  if (!result.course) {
    return NextResponse.json(
      { error: "Course access could not be resolved." },
      { status: 500 },
    );
  }

  const projects = await ExperienceProject.find({ courseId: result.course._id })
    .sort({ updatedAt: -1 })
    .lean();

  return NextResponse.json({
    experiences: projects.map((project) => {
      const serialized = serializeExperienceProject(project as never);
      return {
        ...serialized,
        draft: undefined,
        sceneCount: project.draft?.scenes?.length || 0,
        characterCount: project.draft?.characters?.length || 0,
      };
    }),
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const result = await requireEducatorCourse(slug);
  if (result.error) return result.error;
  if (!result.course || !result.session) {
    return NextResponse.json(
      { error: "Course access could not be resolved." },
      { status: 500 },
    );
  }

  const body = (await req.json().catch(() => ({}))) as {
    title?: string;
    template?: "guided_quest" | "case_investigation";
  };
  const title = body.title?.trim().slice(0, 160) || "New immersive experience";
  const draft = normalizeExperienceDocument(createStarterExperience(title));
  const project = await ExperienceProject.create({
    courseId: result.course._id,
    courseSlug: result.course.slug,
    title,
    description: draft.description,
    status: "draft",
    isFreePreview: false,
    draftVersion: 1,
    draft,
    createdBy: result.session.userId,
    updatedBy: result.session.userId,
  });

  return NextResponse.json(
    { experience: serializeExperienceProject(project) },
    { status: 201 },
  );
}

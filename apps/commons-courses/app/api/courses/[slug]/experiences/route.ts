import { NextRequest, NextResponse } from "next/server";
import type { Types } from "mongoose";
import { connectDB } from "@/lib/db";
import Course from "@/models/Course";
import ExperienceProject from "@/models/ExperienceProject";
import ExperienceRevision from "@/models/ExperienceRevision";
import type { ExperienceDocument } from "@/types/experience";

type CourseRecord = { _id: Types.ObjectId };
type ProjectRecord = {
  _id: Types.ObjectId;
  publishedRevisionId: Types.ObjectId;
  publishedVersion?: number;
  publishedAt?: Date;
  isFreePreview: boolean;
};
type RevisionRecord = {
  _id: Types.ObjectId;
  document: ExperienceDocument;
};

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  await connectDB();
  const course = (await Course.findOne({ slug, published: true })
    .select("_id")
    .lean()) as CourseRecord | null;
  if (!course) {
    return NextResponse.json({ error: "Course not found." }, { status: 404 });
  }
  const projects = (await ExperienceProject.find({
    courseId: course._id,
    status: "published",
    publishedRevisionId: { $exists: true },
  })
    .select(
      "_id publishedRevisionId publishedVersion publishedAt isFreePreview",
    )
    .sort({ publishedAt: -1 })
    .lean()) as ProjectRecord[];
  const revisions = (await ExperienceRevision.find({
    _id: { $in: projects.map((project) => project.publishedRevisionId) },
  })
    .select("_id document")
    .lean()) as RevisionRecord[];
  const revisionById = new Map(
    revisions.map((revision) => [String(revision._id), revision.document]),
  );

  return NextResponse.json({
    experiences: projects.flatMap((project) => {
      const document = revisionById.get(String(project.publishedRevisionId));
      return document
        ? [
            {
              id: String(project._id),
              title: document.title,
              description: document.description,
              estimatedMinutes: document.estimatedMinutes || 8,
              sceneCount: document.scenes.length,
              theme: document.theme,
              publishedVersion: project.publishedVersion,
              publishedAt: project.publishedAt,
              isFreePreview: project.isFreePreview,
            },
          ]
        : [];
    }),
  });
}

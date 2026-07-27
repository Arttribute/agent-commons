import { isValidObjectId, type Types } from "mongoose";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { connectDB } from "@/lib/db";
import Course from "@/models/Course";
import Enrollment from "@/models/Enrollment";
import ExperienceProject from "@/models/ExperienceProject";
import ExperienceRevision from "@/models/ExperienceRevision";
import type { ExperienceDocument } from "@/types/experience";

type CourseRecord = {
  _id: Types.ObjectId;
  title: string;
  slug: string;
  isFree: boolean;
};
type ProjectRecord = {
  _id: Types.ObjectId;
  title: string;
  description: string;
  isFreePreview: boolean;
  publishedRevisionId: Types.ObjectId;
  publishedVersion?: number;
};
type RevisionRecord = {
  _id: Types.ObjectId;
  version: number;
  document: ExperienceDocument;
  contentHash: string;
};

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> },
) {
  const { slug, id } = await params;
  if (!isValidObjectId(id)) {
    return NextResponse.json({ error: "Experience not found." }, { status: 404 });
  }
  await connectDB();
  const course = (await Course.findOne({ slug, published: true })
    .select("_id title slug isFree")
    .lean()) as CourseRecord | null;
  const project = course
    ? ((await ExperienceProject.findOne({
        _id: id,
        courseId: course._id,
        status: "published",
        publishedRevisionId: { $exists: true },
      })
        .select(
          "title description isFreePreview publishedRevisionId publishedVersion",
        )
        .lean()) as ProjectRecord | null)
    : null;
  if (!course || !project?.publishedRevisionId) {
    return NextResponse.json({ error: "Experience not found." }, { status: 404 });
  }

  if (!course.isFree && !project.isFreePreview) {
    const session = await auth();
    const enrollment = session?.user?.id
      ? await Enrollment.findOne({
          userId: session.user.id,
          courseId: course._id,
          status: { $in: ["active", "completed"] },
          paymentStatus: { $ne: "overdue" },
        })
          .select("_id")
          .lean()
      : null;
    if (!enrollment) {
      return NextResponse.json(
        { error: "Enroll in this course to access the experience." },
        { status: 403 },
      );
    }
  }

  const revision = (await ExperienceRevision.findOne({
    _id: project.publishedRevisionId,
    projectId: project._id,
  })
    .select("version document contentHash")
    .lean()) as RevisionRecord | null;
  if (!revision) {
    return NextResponse.json({ error: "Experience not found." }, { status: 404 });
  }

  return NextResponse.json({
    experience: {
      id: String(project._id),
      courseSlug: course.slug,
      courseTitle: course.title,
      title: revision.document.title,
      description: revision.document.description,
      revisionId: String(revision._id),
      version: revision.version,
      contentHash: revision.contentHash,
      document: revision.document,
    },
  });
}

import "server-only";

import { isValidObjectId } from "mongoose";
import { NextResponse } from "next/server";
import { buildManagedCoursesFilter, requireEducator } from "@/lib/educator-auth";
import Course from "@/models/Course";
import ExperienceProject from "@/models/ExperienceProject";

export async function requireEducatorExperience(id: string) {
  const authResult = await requireEducator();
  if (authResult.error || !authResult.session) {
    return {
      ok: false as const,
      error:
        authResult.error ||
        NextResponse.json({ error: "Unauthorized." }, { status: 401 }),
      session: null,
      project: null,
      course: null,
    };
  }
  if (!isValidObjectId(id)) {
    return {
      ok: false as const,
      error: NextResponse.json({ error: "Experience not found." }, { status: 404 }),
      session: null,
      project: null,
      course: null,
    };
  }

  const project = await ExperienceProject.findById(id);
  if (!project) {
    return {
      ok: false as const,
      error: NextResponse.json({ error: "Experience not found." }, { status: 404 }),
      session: null,
      project: null,
      course: null,
    };
  }

  const course = await Course.findOne({
    _id: project.courseId,
    ...buildManagedCoursesFilter(authResult.session),
  });
  if (!course) {
    return {
      ok: false as const,
      error: NextResponse.json({ error: "Forbidden." }, { status: 403 }),
      session: null,
      project: null,
      course: null,
    };
  }

  return {
    ok: true as const,
    error: null,
    session: authResult.session,
    project,
    course,
  };
}

export function serializeExperienceProject(project: {
  _id: unknown;
  courseId: unknown;
  courseSlug: string;
  title: string;
  description: string;
  status: "draft" | "published";
  draftVersion: number;
  publishedVersion?: number;
  publishedAt?: Date;
  isFreePreview: boolean;
  draft: unknown;
  updatedAt: Date;
  createdAt: Date;
}) {
  return {
    id: String(project._id),
    courseId: String(project.courseId),
    courseSlug: project.courseSlug,
    title: project.title,
    description: project.description,
    status: project.status,
    draftVersion: project.draftVersion,
    publishedVersion: project.publishedVersion,
    publishedAt: project.publishedAt?.toISOString(),
    isFreePreview: project.isFreePreview,
    draft: project.draft,
    updatedAt: project.updatedAt.toISOString(),
    createdAt: project.createdAt.toISOString(),
  };
}

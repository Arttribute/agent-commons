import { NextRequest, NextResponse } from "next/server";
import { normalizeCourseInput } from "@/lib/course-input";
import {
  canManageCourseCollaborators,
  requireEducatorCourse,
  slugifyCourseTitle,
} from "@/lib/educator-auth";
import { indexCourseForSearch } from "@/lib/search-indexers";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const result = await requireEducatorCourse(slug);
  if (result.error) return result.error;

  return NextResponse.json({ course: result.course });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const result = await requireEducatorCourse(slug);
  if (result.error) return result.error;

  const body = await req.json();
  const nextSlug = body.slug ? slugifyCourseTitle(body.slug) : result.course.slug;
  result.course.set({
    ...normalizeCourseInput(body),
    slug: nextSlug,
  });

  await result.course.save();
  await indexCourseForSearch(result.course);

  return NextResponse.json({ course: result.course });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const result = await requireEducatorCourse(slug);
  if (result.error) return result.error;
  if (!canManageCourseCollaborators(result.course, result.session)) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  await result.course.deleteOne();
  return NextResponse.json({ success: true });
}

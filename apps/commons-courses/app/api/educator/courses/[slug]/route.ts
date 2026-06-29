import { NextRequest, NextResponse } from "next/server";
import { normalizeCourseInput } from "@/lib/course-input";
import {
  canManageCourseCollaborators,
  requireEducatorCourse,
  slugifyCourseTitle,
} from "@/lib/educator-auth";
import { getSafeErrorMessage } from "@/lib/safe-error";
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
  try {
    const { slug } = await params;
    const result = await requireEducatorCourse(slug);
    if (result.error) return result.error;

    const body = await req.json();
    const nextSlug = body.slug ? slugifyCourseTitle(body.slug) : result.course.slug;
    const normalized = normalizeCourseBody(body);
    if (normalized instanceof NextResponse) return normalized;

    result.course.set({
      ...normalized,
      slug: nextSlug,
    });

    await result.course.save();
    await indexCourseForSearch(result.course);

    return NextResponse.json({ course: result.course });
  } catch (error) {
    console.error("Could not update educator course", error);
    const message = getValidationErrorMessage(error);
    return NextResponse.json(
      { error: message || getSafeErrorMessage(error, "Could not save course.") },
      { status: message ? 400 : 500 }
    );
  }
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

function normalizeCourseBody(body: unknown) {
  try {
    return normalizeCourseInput(body as Parameters<typeof normalizeCourseInput>[0]);
  } catch (error) {
    if (error instanceof Error && error.message.includes("stored in S3")) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}

function getValidationErrorMessage(error: unknown) {
  if (
    !error ||
    typeof error !== "object" ||
    !("name" in error) ||
    error.name !== "ValidationError"
  ) {
    return null;
  }

  const validationError = error as {
    errors?: Record<string, { message?: string }>;
    message?: string;
  };
  const details = Object.values(validationError.errors || {})
    .map((item) => item.message)
    .filter(Boolean);

  return details.length
    ? `Could not save course: ${details.join(" ")}`
    : validationError.message || "Could not save course.";
}

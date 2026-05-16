import { NextRequest, NextResponse } from "next/server";
import { normalizeAccessProgramInput } from "@/lib/course-input";
import { requireEducatorCourse } from "@/lib/educator-auth";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const result = await requireEducatorCourse(slug);
  if (result.error) return result.error;

  return NextResponse.json({
    accessProgram: result.course.accessProgram || {
      discounts: [],
      scholarships: [],
      passes: [],
      affiliates: [],
    },
  });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const result = await requireEducatorCourse(slug);
  if (result.error) return result.error;

  const body = await req.json();
  result.course.set({
    accessProgram: normalizeAccessProgramInput(body.accessProgram || body),
  });
  await result.course.save();

  return NextResponse.json({ accessProgram: result.course.accessProgram });
}

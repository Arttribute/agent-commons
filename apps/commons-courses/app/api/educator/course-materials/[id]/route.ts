import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import { requireEducatorCourse } from "@/lib/educator-auth";
import CourseMaterial from "@/models/CourseMaterial";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!Types.ObjectId.isValid(id)) return NextResponse.json({ error: "Material not found." }, { status: 404 });
  const material = await CourseMaterial.findById(id);
  if (!material) return NextResponse.json({ error: "Material not found." }, { status: 404 });
  const result = await requireEducatorCourse(material.courseSlug);
  if (result.error) return result.error;
  await material.deleteOne();
  return NextResponse.json({ ok: true, libraryRetained: true });
}

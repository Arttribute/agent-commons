import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import CourseMedia from "@/models/CourseMedia";
import type { ICourseMedia } from "@/models/CourseMedia";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!/^[a-f\d]{24}$/i.test(id)) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  await connectDB();
  const media = (await CourseMedia.findById(id).lean()) as ICourseMedia | null;
  if (!media) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(media.data), {
    headers: {
      "Content-Type": media.contentType,
      "Content-Length": String(media.size),
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}

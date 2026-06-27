import { NextRequest, NextResponse } from "next/server";
import { requireEducator } from "@/lib/educator-auth";
import {
  isS3MediaStorageConfigured,
  uploadCourseMediaToS3,
} from "@/lib/media-storage";

const maxImageSize = 4 * 1024 * 1024;
const allowedImageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function POST(req: NextRequest) {
  const authResult = await requireEducator();
  if (authResult.error) return authResult.error;

  const formData = await req.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Image file is required." }, { status: 400 });
  }
  if (!allowedImageTypes.has(file.type)) {
    return NextResponse.json(
      { error: "Upload a JPG, PNG, or WebP image." },
      { status: 400 }
    );
  }
  if (file.size > maxImageSize) {
    return NextResponse.json(
      { error: "Image must be smaller than 4 MB." },
      { status: 400 }
    );
  }

  const arrayBuffer = await file.arrayBuffer();
  const data = Buffer.from(arrayBuffer);

  if (!isS3MediaStorageConfigured()) {
    return NextResponse.json(
      {
        error:
          "Course media storage is not configured. Set COURSE_MEDIA_S3_BUCKET, COURSE_MEDIA_S3_REGION, and COURSE_MEDIA_CDN_URL.",
      },
      { status: 500 }
    );
  }

  const url = await uploadCourseMediaToS3({ file, data });
  return NextResponse.json({ url, storage: "s3" });
}

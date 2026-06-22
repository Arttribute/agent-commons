import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { getAppBaseUrl } from "@/lib/app-url";
import { connectDB } from "@/lib/db";
import { requireEducator } from "@/lib/educator-auth";
import {
  isS3MediaStorageConfigured,
  uploadCourseMediaToS3,
} from "@/lib/media-storage";
import CourseMedia from "@/models/CourseMedia";

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

  if (isS3MediaStorageConfigured()) {
    const url = await uploadCourseMediaToS3({ file, data });
    return NextResponse.json({ url, storage: "s3" });
  }

  await connectDB();
  const media = await CourseMedia.create({
    filename: file.name,
    contentType: file.type,
    size: file.size,
    data,
    uploadedBy: new mongoose.Types.ObjectId(authResult.session.userId),
  });

  const url = `${getAppBaseUrl()}/api/media/${media._id.toString()}`;
  return NextResponse.json({ url, storage: "mongodb" });
}

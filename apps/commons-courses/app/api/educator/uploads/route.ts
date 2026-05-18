import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { getAppBaseUrl } from "@/lib/app-url";
import { connectDB } from "@/lib/db";
import { requireEducator } from "@/lib/educator-auth";
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
  await connectDB();
  const media = await CourseMedia.create({
    filename: file.name,
    contentType: file.type,
    size: file.size,
    data: Buffer.from(arrayBuffer),
    uploadedBy: new mongoose.Types.ObjectId(authResult.session.userId),
  });

  const url = `${getAppBaseUrl()}/api/media/${media._id.toString()}`;
  return NextResponse.json({ url });
}

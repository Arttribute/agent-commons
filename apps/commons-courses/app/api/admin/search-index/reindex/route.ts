import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { ensureVectorSearchIndex } from "@/lib/mongodb-vector-index";
import { reindexCourseById } from "@/lib/search-indexers";
import Course from "@/models/Course";

function isAuthorized(req: NextRequest) {
  const secret = req.headers.get("x-admin-secret");
  return Boolean(secret) && secret === process.env.ADMIN_SECRET;
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as { courseSlug?: string };
  await connectDB();
  const vectorIndex = await ensureVectorSearchIndex();
  const filter = body.courseSlug ? { slug: body.courseSlug } : {};
  const courses = await Course.find(filter).select("_id").lean();

  for (const course of courses) {
    await reindexCourseById(course._id);
  }

  return NextResponse.json({
    vectorIndex,
    indexedCourses: courses.length,
    scope: body.courseSlug || "all",
  });
}

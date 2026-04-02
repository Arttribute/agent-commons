import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import Course from "@/models/Course";

function isAuthorized(req: NextRequest) {
  const secret = req.headers.get("x-admin-secret");
  return secret === process.env.ADMIN_SECRET;
}

// GET /api/admin/courses — list all (including unpublished)
export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  await connectDB();
  const courses = await Course.find().sort({ createdAt: -1 }).lean();
  return NextResponse.json(courses);
}

// POST /api/admin/courses — create a new course
export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  try {
    const body = await req.json();
    await connectDB();
    const existing = await Course.findOne({ slug: body.slug });
    if (existing) {
      return NextResponse.json(
        { error: "A course with this slug already exists." },
        { status: 409 }
      );
    }
    const course = await Course.create(body);
    return NextResponse.json(course, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Server error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

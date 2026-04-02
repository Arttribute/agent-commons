import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import Course from "@/models/Course";

function isAuthorized(req: NextRequest) {
  const secret = req.headers.get("x-admin-secret");
  return secret === process.env.ADMIN_SECRET;
}

// PUT /api/admin/courses/:slug — update a course
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  try {
    const { slug } = await params;
    const body = await req.json();
    await connectDB();
    const course = await Course.findOneAndUpdate({ slug }, body, {
      new: true,
      runValidators: true,
    });
    if (!course) {
      return NextResponse.json({ error: "Course not found." }, { status: 404 });
    }
    return NextResponse.json(course);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Server error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// DELETE /api/admin/courses/:slug — delete a course
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  try {
    const { slug } = await params;
    await connectDB();
    const course = await Course.findOneAndDelete({ slug });
    if (!course) {
      return NextResponse.json({ error: "Course not found." }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Server error." }, { status: 500 });
  }
}

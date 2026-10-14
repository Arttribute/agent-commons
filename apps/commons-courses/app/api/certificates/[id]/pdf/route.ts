import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { connectDB } from "@/lib/db";
import { requireEducatorCourse } from "@/lib/educator-auth";
import { certificateFilename } from "@/lib/certificate-policy";
import Certificate from "@/models/Certificate";
import Course from "@/models/Course";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[a-f0-9]{24}$/i.test(id)) return NextResponse.json({ error: "Certificate not found." }, { status: 404 });
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.redirect(new URL(`/auth/signin?callbackUrl=${encodeURIComponent(req.nextUrl.pathname)}`, req.url));
  }
  await connectDB();
  const certificate = await Certificate.findById(id);
  if (!certificate) return NextResponse.json({ error: "Certificate not found." }, { status: 404 });
  if (!certificate.awardedAt || String(certificate.userId) !== session.user.id) {
    const course = await Course.findById(certificate.courseId).select("slug");
    if (!course) return NextResponse.json({ error: "Certificate not found." }, { status: 404 });
    const result = await requireEducatorCourse(course.slug);
    if (result.error) return NextResponse.json({ error: "Certificate not found." }, { status: 404 });
  }
  const stored = await Certificate.findById(id).select("+pdf");
  return new NextResponse(new Uint8Array(stored!.pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${certificateFilename(certificate.filename)}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

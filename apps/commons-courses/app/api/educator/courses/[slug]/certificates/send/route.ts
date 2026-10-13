import { NextRequest, NextResponse } from "next/server";
import { requireEducatorCourse } from "@/lib/educator-auth";
import { certificateSendIds } from "@/lib/certificate-policy";
import { sendCourseCertificate } from "@/lib/certificates";
import Certificate from "@/models/Certificate";

export const maxDuration = 120;

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const result = await requireEducatorCourse(slug);
  if (result.error) return result.error;
  if (req.headers.get("origin") && req.headers.get("origin") !== req.nextUrl.origin) {
    return NextResponse.json({ error: "Send certificates from the course console." }, { status: 403 });
  }
  const body = await req.json().catch(() => null);
  let ids: string[];
  try { ids = certificateSendIds(body?.ids); }
  catch (error) { return NextResponse.json({ error: (error as Error).message }, { status: 400 }); }
  if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL) {
    return NextResponse.json({ error: "Certificate email is not configured." }, { status: 503 });
  }
  const count = await Certificate.countDocuments({ _id: { $in: ids }, courseId: result.course._id });
  if (count !== ids.length) return NextResponse.json({ error: "Choose certificates from this course." }, { status: 400 });
  const results = [];
  for (const id of ids) {
    results.push(await sendCourseCertificate(result.course, id, result.session.userId));
    // Resend's standard rate limit is two requests per second.
    if (id !== ids.at(-1)) await new Promise((resolve) => setTimeout(resolve, 650));
  }
  return NextResponse.json({ results });
}

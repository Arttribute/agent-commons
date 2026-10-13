import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireEducatorCourse } from "@/lib/educator-auth";
import { certificateFilename, MAX_CERTIFICATE_BYTES, serializeCertificate, validateCertificatePdf } from "@/lib/certificate-policy";
import Certificate from "@/models/Certificate";
import Enrollment from "@/models/Enrollment";
import User from "@/models/User";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const result = await requireEducatorCourse(slug);
  if (result.error) return result.error;
  const certificates = await Certificate.find({ courseId: result.course._id }).sort({ recipientName: 1 }).lean();
  return NextResponse.json({ certificates: certificates.map(serializeCertificate), emailConfigured: Boolean(process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL) });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const result = await requireEducatorCourse(slug);
  if (result.error) return result.error;
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  const userId = form?.get("userId");
  const recipientName = String(form?.get("recipientName") || "").trim();
  const completionPeriod = String(form?.get("completionPeriod") || "").trim();
  if (!(file instanceof File) || file.size > MAX_CERTIFICATE_BYTES || typeof userId !== "string" || !/^[a-f0-9]{24}$/i.test(userId) || !recipientName || recipientName.length > 160 || completionPeriod.length > 120) {
    return NextResponse.json({ error: "Choose a learner, a participant name and a PDF smaller than 2 MB." }, { status: 400 });
  }
  const [user, enrollment] = await Promise.all([
    User.findById(userId).select("email"),
    Enrollment.exists({ courseId: result.course._id, userId, status: { $ne: "cancelled" } }),
  ]);
  if (!user?.email || !enrollment) return NextResponse.json({ error: "Choose a learner enrolled in this course." }, { status: 400 });
  const pdf = Buffer.from(await file.arrayBuffer());
  try { validateCertificatePdf(pdf); }
  catch (error) { return NextResponse.json({ error: (error as Error).message }, { status: 400 }); }
  try {
    const certificate = await Certificate.create({
      courseId: result.course._id, userId, preparedBy: result.session.userId,
      recipientName, recipientEmail: user.email, completionPeriod,
      filename: certificateFilename(file.name), pdf,
      sha256: createHash("sha256").update(pdf).digest("hex"),
    });
    return NextResponse.json(serializeCertificate(certificate), { status: 201 });
  } catch (error) {
    if ((error as { code?: number }).code === 11000) return NextResponse.json({ error: "This learner already has a certificate. Open the existing record." }, { status: 409 });
    throw error;
  }
}

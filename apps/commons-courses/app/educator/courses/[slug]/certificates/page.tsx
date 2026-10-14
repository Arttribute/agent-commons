import { redirect } from "next/navigation";
import { requireEducatorCourse } from "@/lib/educator-auth";
import { serializeCertificate } from "@/lib/certificate-policy";
import { CertificateManager } from "@/components/educator/certificate-manager";
import Certificate from "@/models/Certificate";
import Enrollment from "@/models/Enrollment";

export default async function CourseCertificatesPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const result = await requireEducatorCourse(slug);
  if (result.error) redirect("/educator");
  const [certificates, enrollments] = await Promise.all([
    Certificate.find({ courseId: result.course._id }).sort({ recipientName: 1 }).lean(),
    Enrollment.find({ courseId: result.course._id, status: { $ne: "cancelled" } }).populate("userId", "name email").lean(),
  ]);
  const learners = enrollments.flatMap((enrollment) => {
    const user = enrollment.userId as unknown as { _id: { toString(): string }; name: string; email: string } | null;
    return user?.email ? [{ id: String(user._id), name: user.name, email: user.email }] : [];
  });
  return <CertificateManager slug={slug} courseTitle={result.course.title} initialCertificates={certificates.map(serializeCertificate)} learners={learners} emailConfigured={Boolean(process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL)} />;
}

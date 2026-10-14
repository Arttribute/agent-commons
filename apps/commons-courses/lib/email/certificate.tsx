import "server-only";
import { render } from "@react-email/render";
import { getAppBaseUrl } from "@/lib/app-url";
import { resolveCourseEmailBranding } from "@/lib/educator-entitlements";
import { CommonsEmail, DetailList, Paragraph } from "@/lib/email/templates";
import type { ICourse } from "@/models/Course";
import type { ICertificate } from "@/models/Certificate";

export async function buildCertificateEmail(course: ICourse, certificate: ICertificate) {
  const branding = await resolveCourseEmailBranding(String(course._id), course.emailSettings?.branding);
  const configuredFrom = process.env.RESEND_FROM_EMAIL;
  if (!configuredFrom) throw new Error("The certificate sender is not configured.");
  const address = configuredFrom.match(/<([^>]+)>/)?.[1] || configuredFrom;
  const from = branding?.senderName
    ? `${branding.senderName.replace(/[<>\r\n]/g, "")} <${address}>`
    : configuredFrom;
  const email = (
    <CommonsEmail
      preview={`Your certificate of completion for ${course.title} is ready.`}
      eyebrow="Certificate of completion"
      title={`Congratulations, ${certificate.recipientName}`}
      intro={`You have been awarded your certificate of completion for ${course.title}${certificate.completionPeriod ? ` (${certificate.completionPeriod})` : ""}. Thank you for taking part.`}
      action={{ label: "View certificate", href: new URL(`/api/certificates/${certificate._id}/pdf`, getAppBaseUrl()).toString() }}
      branding={branding}
    >
      <Paragraph>Your certificate is attached to this email as a PDF. You can also find it in your CommonLab dashboard.</Paragraph>
      <DetailList items={[["Participant", certificate.recipientName], ["Course", course.title], ["Completed", certificate.completionPeriod || undefined]]} />
    </CommonsEmail>
  );
  const [html, text] = await Promise.all([render(email), render(email, { plainText: true })]);
  return {
    from,
    to: [certificate.recipientEmail],
    subject: `Your certificate of completion: ${course.title}`,
    html,
    text,
    replyTo: course.emailSettings?.replyTo || process.env.RESEND_REPLY_TO_EMAIL,
  };
}

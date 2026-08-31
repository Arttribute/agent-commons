import "server-only";

import { render } from "@react-email/render";
import { Resend } from "resend";
import { getAppBaseUrl } from "@/lib/app-url";
import { Callout, CommonsEmail, DetailList, Paragraph } from "@/lib/email/templates";
import { truncateEmailText } from "@/lib/email/truncate";
import type { EmailBranding } from "@/lib/email/branding";
import { resolveCourseEmailBranding } from "@/lib/educator-entitlements";
import CheckInNotification from "@/models/CheckInNotification";

type Recipient = {
  userId?: string | null;
  email?: string | null;
  name?: string | null;
};

type CourseEmailSettings = {
  welcomeEnabled?: boolean;
  enrollmentEnabled?: boolean;
  assignmentCreatedEnabled?: boolean;
  assignmentUpdatedEnabled?: boolean;
  courseUpdateEnabled?: boolean;
  agentManaged?: boolean;
  replyTo?: string;
  customIntro?: string;
  branding?: EmailBranding;
};

type CourseEmailContext = {
  id?: string;
  title: string;
  slug: string;
  instructor?: string;
  duration?: string;
  settings?: CourseEmailSettings;
};

type AssignmentEmailContext = {
  id?: string;
  title: string;
  dueAt?: Date | string | null;
  points?: number;
  instructions?: string;
  context?: string;
  kind?: "coursework" | "follow_up";
  meetingSlotCount?: number;
  meetingTimezone?: string;
};

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

const appUrl = getAppBaseUrl();
const fromAddress =
  process.env.RESEND_FROM_EMAIL || "CommonLab <onboarding@resend.dev>";
const replyToAddress = process.env.RESEND_REPLY_TO_EMAIL;

function absoluteUrl(path: string) {
  return new URL(path, appUrl).toString();
}

function formatDate(value?: Date | string | null) {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

async function sendEmail({
  to,
  subject,
  react,
  replyTo,
  senderName,
}: {
  to: string[];
  subject: string;
  react: React.ReactElement;
  replyTo?: string;
  senderName?: string;
}) {
  const recipients = to.filter(Boolean);
  if (!recipients.length) return { skipped: true, reason: "missing_recipient" };
  if (!resend) {
    console.info(`[email] skipped "${subject}" because RESEND_API_KEY is not set.`);
    return { skipped: true, reason: "missing_resend_api_key" };
  }

  try {
    const [html, text] = await Promise.all([
      render(react, { pretty: true }),
      render(react, { plainText: true }),
    ]);
    const { data, error } = await resend.emails.send({
      from: getFromAddress(senderName),
      to: recipients,
      subject,
      html,
      text,
      replyTo: replyTo || replyToAddress,
    });

    if (error) {
      console.error("[email] resend failed", { subject, error });
      return { error };
    }

    return { data };
  } catch (error) {
    console.error("[email] resend threw", { subject, error });
    return { error };
  }
}

export async function sendWelcomeEmail(user: Recipient) {
  if (!user.email) return;

  await sendEmail({
    to: [user.email],
    subject: "Welcome to CommonLab",
    react: (
      <CommonsEmail
        preview="Your CommonLab account is ready."
        eyebrow="Welcome"
        title={`Welcome${user.name ? `, ${user.name}` : ""}`}
        intro="Your CommonLab account is ready. You can now explore courses, join learning paths, and work with guided course agents as you learn."
        action={{ label: "Explore courses", href: absoluteUrl("/courses") }}
      >
        <Paragraph>
          CommonLab is built for practical AI learning: structured courses,
          hands-on assignments, and sandboxes that help you turn ideas into
          working practice.
        </Paragraph>
      </CommonsEmail>
    ),
  });
}

export async function sendVerificationEmail({
  user,
  token,
  callbackUrl,
}: {
  user: Recipient;
  token: string;
  callbackUrl?: string;
}) {
  if (!user.email) return;
  const verifyUrl = new URL("/api/auth/verify-email", appUrl);
  verifyUrl.searchParams.set("token", token);
  if (callbackUrl) verifyUrl.searchParams.set("callbackUrl", callbackUrl);

  await sendEmail({
    to: [user.email],
    subject: "Verify your CommonLab email",
    react: (
      <CommonsEmail
        preview="Verify your email to finish setting up CommonLab."
        eyebrow="Email verification"
        title="Confirm your email"
        intro="One quick check and your CommonLab account is ready for course enrollment, assignments, and learning updates."
        action={{ label: "Verify email", href: verifyUrl.toString() }}
      >
        <Paragraph>
          This link expires soon. If you did not create a CommonLab account, you
          can ignore this email.
        </Paragraph>
      </CommonsEmail>
    ),
  });
}

export async function sendPasswordResetEmail({
  user,
  token,
}: {
  user: Recipient;
  token: string;
}) {
  if (!user.email) return;
  const resetUrl = new URL("/auth/reset-password", appUrl);
  resetUrl.searchParams.set("token", token);

  await sendEmail({
    to: [user.email],
    subject: "Reset your CommonLab password",
    react: (
      <CommonsEmail
        preview="Reset your CommonLab password."
        eyebrow="Password reset"
        title="Reset your password"
        intro="Use this secure link to choose a new password for your CommonLab account."
        action={{ label: "Reset password", href: resetUrl.toString() }}
      >
        <Paragraph>
          This link expires soon. If you did not request a password reset, you
          can ignore this email.
        </Paragraph>
      </CommonsEmail>
    ),
  });
}

export async function sendEnrollmentEmail(user: Recipient, course: CourseEmailContext) {
  if (!course.settings?.enrollmentEnabled || !user.email) return;
  const branding = await resolveCourseEmailBranding(
    course.id,
    course.settings.branding,
  );

  await sendEmail({
    to: [user.email],
    subject: `You're enrolled in ${course.title}`,
    replyTo: course.settings.replyTo,
    senderName: branding?.senderName,
    react: (
      <CommonsEmail
        preview={`You're enrolled in ${course.title}.`}
        eyebrow="Enrollment confirmed"
        title="You're in"
        intro={
          course.settings.customIntro ||
          `Your enrollment in ${course.title} is confirmed. The course space is ready when you are.`
        }
        action={{
          label: "Go to course",
          href: absoluteUrl(`/courses/${course.slug}/learn`),
        }}
        branding={branding}
      >
        <DetailList
          items={[
            ["Course", course.title],
            ["Instructor", course.instructor],
            ["Duration", course.duration],
          ]}
        />
      </CommonsEmail>
    ),
  });
}

export async function sendAssignmentNotification({
  recipients,
  course,
  assignment,
  event,
  force = false,
}: {
  recipients: Recipient[];
  course: CourseEmailContext;
  assignment: AssignmentEmailContext;
  event: "created" | "updated";
  force?: boolean;
}) {
  const enabled =
    event === "created"
      ? course.settings?.assignmentCreatedEnabled
      : course.settings?.assignmentUpdatedEnabled;
  if (!enabled && !force) return [];

  const isCheckIn = assignment.kind === "follow_up";
  const branding = await resolveCourseEmailBranding(
    course.id,
    course.settings?.branding,
  );
  const subjectPrefix = isCheckIn
    ? "Your check-in"
    : event === "created"
      ? "New assignment"
      : "Assignment updated";
  const deliverable = recipients.filter(
    (recipient): recipient is Recipient & { email: string } =>
      Boolean(recipient.email),
  );
  if (!deliverable.length) return [];

  return Promise.all(
    deliverable.map(async (recipient) => {
      const tracking =
        isCheckIn && assignment.id && course.id && recipient.userId
          ? await CheckInNotification.findOneAndUpdate(
              {
                assignmentId: assignment.id,
                userId: recipient.userId,
              },
              {
                $set: {
                  courseId: course.id,
                  email: recipient.email,
                  emailStatus: "pending",
                },
                $unset: { lastError: 1 },
              },
              { upsert: true, new: true, runValidators: true },
            )
          : null;
      const actionHref = absoluteUrl(
        isCheckIn
          ? `/courses/${course.slug}/check-ins${assignment.id ? `?checkIn=${assignment.id}` : ""}`
          : `/courses/${course.slug}/learn`,
      );
      const result = await sendEmail({
        to: [recipient.email],
        subject: `${subjectPrefix}: ${assignment.title}`,
        replyTo: course.settings?.replyTo,
        senderName: branding?.senderName,
        react: (
          <CommonsEmail
            preview={`${subjectPrefix} in ${course.title}: ${assignment.title}.`}
            eyebrow={isCheckIn ? "CommonLab follow-up" : course.title}
            title={isCheckIn ? "How is your commitment going?" : subjectPrefix}
            intro={
              isCheckIn
                ? `Your facilitators from ${course.title} are checking in on the next step you planned.`
                : `${assignment.title} is ${
                    event === "created" ? "now available" : "updated"
                  } in ${course.title}.`
            }
            action={{
              label: isCheckIn ? "Open your check-in" : "View assignment",
              href: actionHref,
            }}
            footerNote="You are receiving this course notification because you are enrolled in this CommonLab course."
            branding={branding}
          >
            <DetailList
              items={[
                [isCheckIn ? "Check-in" : "Assignment", assignment.title],
                ["Course", course.title],
                ["Due", formatDate(assignment.dueAt)],
                [
                  "One-on-one",
                  isCheckIn && assignment.meetingSlotCount
                    ? `Choose from ${assignment.meetingSlotCount} available times · ${assignment.meetingTimezone || "course time"}`
                    : undefined,
                ],
                [
                  "Points",
                  !isCheckIn && assignment.points
                    ? String(assignment.points)
                    : undefined,
                ],
              ]}
            />
            {isCheckIn && assignment.context ? (
              <Callout label="What you committed to">
                {truncateEmailText(assignment.context)}
              </Callout>
            ) : null}
            {assignment.instructions ? (
              <Paragraph>{truncateEmailText(assignment.instructions, 320)}</Paragraph>
            ) : null}
          </CommonsEmail>
        ),
      });

      if (tracking) {
        const providerMessageId =
          "data" in result && result.data?.id ? result.data.id : undefined;
        const skipped = "skipped" in result && result.skipped;
        const errorMessage =
          "error" in result && result.error
            ? getErrorMessage(result.error)
            : undefined;
        await CheckInNotification.updateOne(
          { _id: tracking._id },
          providerMessageId
            ? {
                $set: {
                  emailStatus: "sent",
                  providerMessageId,
                  sentAt: new Date(),
                },
                $unset: { lastError: 1 },
              }
            : {
                $set: {
                  emailStatus: skipped ? "skipped" : "failed",
                  lastError: errorMessage,
                },
              },
        );
      }

      return {
        userId: recipient.userId,
        email: recipient.email,
        sent: "data" in result && Boolean(result.data?.id),
      };
    }),
  );
}

function getErrorMessage(value: unknown) {
  if (value instanceof Error) return value.message;
  if (value && typeof value === "object" && "message" in value) {
    return String(value.message);
  }
  return "Email could not be sent.";
}

export async function sendCourseCollaboratorInvite({
  recipient,
  course,
  inviterName,
  role,
}: {
  recipient: Recipient;
  course: CourseEmailContext;
  inviterName?: string | null;
  role: "co_owner" | "editor";
}) {
  if (!recipient.email) return;
  const branding = await resolveCourseEmailBranding(
    course.id,
    course.settings?.branding,
  );

  await sendEmail({
    to: [recipient.email],
    subject: `You're invited to collaborate on ${course.title}`,
    replyTo: course.settings?.replyTo,
    senderName: branding?.senderName,
    react: (
      <CommonsEmail
        preview={`You've been invited to help manage ${course.title} on CommonLab.`}
        eyebrow="Course collaboration"
        title="You're invited to collaborate"
        intro={`${inviterName || "A course owner"} invited you to help manage ${course.title} on CommonLab.`}
        action={{
          label: "Open course",
          href: absoluteUrl(`/educator/courses/${course.slug}/edit`),
        }}
        branding={branding}
      >
        <DetailList
          items={[
            ["Course", course.title],
            ["Role", role === "co_owner" ? "Co-owner" : "Editor"],
            ["Instructor", course.instructor],
          ]}
        />
        <Paragraph>
          Sign in with this email address to access the course from your
          educator console.
        </Paragraph>
      </CommonsEmail>
    ),
  });
}

function getFromAddress(senderName?: string) {
  if (!senderName) return fromAddress;
  const address = fromAddress.match(/<([^>]+)>/)?.[1] || fromAddress.trim();
  const safeName = senderName.replace(/[<>\r\n]/g, "").trim();
  return safeName ? `${safeName} <${address}>` : fromAddress;
}

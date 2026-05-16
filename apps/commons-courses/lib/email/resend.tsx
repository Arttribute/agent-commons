import "server-only";

import { Resend } from "resend";
import { CommonsEmail, DetailList, Paragraph } from "@/lib/email/templates";

type Recipient = {
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
};

type CourseEmailContext = {
  title: string;
  slug: string;
  instructor?: string;
  duration?: string;
  settings?: CourseEmailSettings;
};

type AssignmentEmailContext = {
  title: string;
  dueAt?: Date | string | null;
  points?: number;
  instructions?: string;
};

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

const appUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
const fromAddress =
  process.env.RESEND_FROM_EMAIL || "CommonLab <onboarding@resend.dev>";

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
}: {
  to: string[];
  subject: string;
  react: React.ReactElement;
  replyTo?: string;
}) {
  const recipients = to.filter(Boolean);
  if (!recipients.length) return { skipped: true, reason: "missing_recipient" };
  if (!resend) {
    console.info(`[email] skipped "${subject}" because RESEND_API_KEY is not set.`);
    return { skipped: true, reason: "missing_resend_api_key" };
  }

  try {
    const { data, error } = await resend.emails.send({
      from: fromAddress,
      to: recipients,
      subject,
      react,
      replyTo,
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

  await sendEmail({
    to: [user.email],
    subject: `You're enrolled in ${course.title}`,
    replyTo: course.settings.replyTo,
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
}: {
  recipients: Recipient[];
  course: CourseEmailContext;
  assignment: AssignmentEmailContext;
  event: "created" | "updated";
}) {
  const enabled =
    event === "created"
      ? course.settings?.assignmentCreatedEnabled
      : course.settings?.assignmentUpdatedEnabled;
  if (!enabled) return;

  const subjectPrefix = event === "created" ? "New assignment" : "Assignment updated";
  const to = recipients
    .map((recipient) => recipient.email)
    .filter((email): email is string => Boolean(email));
  if (!to.length) return;

  await Promise.all(
    to.map((email) =>
      sendEmail({
        to: [email],
        subject: `${subjectPrefix}: ${assignment.title}`,
        replyTo: course.settings?.replyTo,
        react: (
          <CommonsEmail
            preview={`${subjectPrefix} in ${course.title}: ${assignment.title}.`}
            eyebrow={course.title}
            title={subjectPrefix}
            intro={`${assignment.title} is ${
              event === "created" ? "now available" : "updated"
            } in ${course.title}.`}
            action={{
              label: "View assignment",
              href: absoluteUrl(`/courses/${course.slug}/learn`),
            }}
            footerNote="You are receiving this course notification because you are enrolled in this CommonLab course."
          >
            <DetailList
              items={[
                ["Assignment", assignment.title],
                ["Due", formatDate(assignment.dueAt)],
                ["Points", assignment.points ? String(assignment.points) : undefined],
              ]}
            />
            {assignment.instructions ? (
              <Paragraph>{assignment.instructions.slice(0, 320)}</Paragraph>
            ) : null}
          </CommonsEmail>
        ),
      })
    )
  );
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

  await sendEmail({
    to: [recipient.email],
    subject: `You're invited to collaborate on ${course.title}`,
    replyTo: course.settings?.replyTo,
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

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { connectDB } from "@/lib/db";
import { checkInContextForUser } from "@/lib/check-in-context";
import { getCourseThemeStyle } from "@/lib/course-theme";
import { Nav } from "@/components/nav";
import { LearnerCheckIns } from "@/components/courses/learner-check-ins";
import Assignment from "@/models/Assignment";
import CheckInNotification from "@/models/CheckInNotification";
import Course from "@/models/Course";
import Enrollment from "@/models/Enrollment";
import LiveResponse from "@/models/LiveResponse";
import LiveSession from "@/models/LiveSession";
import Submission from "@/models/Submission";
import type { LiveActivity, LiveResponseValue } from "@/types/live-session";
import {
  isPrioritizationResponse,
  isWorksheetResponse,
} from "@/lib/live-response-policy";

export default async function CourseCheckInsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ checkIn?: string }>;
}) {
  const { slug } = await params;
  const { checkIn } = await searchParams;
  const currentUser = await auth();
  if (!currentUser?.user?.id) {
    redirect(`/auth/signin?callbackUrl=${encodeURIComponent(`/courses/${slug}/check-ins${checkIn ? `?checkIn=${checkIn}` : ""}`)}`);
  }

  await connectDB();
  const course = await Course.findOne({ slug, published: true }).select(
    "_id title slug theme",
  );
  if (!course) redirect("/courses");
  const enrolled = await Enrollment.exists({
    courseId: course._id,
    userId: currentUser.user.id,
    status: { $ne: "cancelled" },
  });
  if (!enrolled) redirect(`/courses/${slug}`);

  const assignments = await Assignment.find({
    courseId: course._id,
    published: true,
    kind: "follow_up",
    $or: [
      { targetUserIds: { $exists: false } },
      { targetUserIds: { $size: 0 } },
      { targetUserIds: currentUser.user.id },
    ],
  })
    .sort({ dueAt: 1, createdAt: -1 })
    .lean();
  const assignmentIds = assignments.map((assignment) => assignment._id);
  const openedAssignmentId =
    assignmentIds.find((assignmentId) => String(assignmentId) === checkIn) ||
    assignmentIds[0];
  if (openedAssignmentId) {
    await CheckInNotification.findOneAndUpdate(
      {
        assignmentId: openedAssignmentId,
        userId: currentUser.user.id,
      },
      {
        $min: { openedAt: new Date() },
        $setOnInsert: {
          courseId: course._id,
          email: currentUser.user.email,
          emailStatus: "not_sent",
        },
      },
      { upsert: true, runValidators: true },
    );
  }
  const submissions = assignmentIds.length
    ? await Submission.find({
        assignmentId: { $in: assignmentIds },
        userId: currentUser.user.id,
      }).lean()
    : [];
  const meetingReservations = assignmentIds.length
    ? await Submission.find({
        assignmentId: { $in: assignmentIds },
        selectedMeetingSlotId: { $exists: true, $ne: "" },
      })
        .select("assignmentId userId selectedMeetingSlotId")
        .lean()
    : [];
  const sourceSessionIds = assignments
    .map((assignment) => assignment.sourceLiveSessionId)
    .filter(Boolean);
  const [sourceSessions, sourceResponses] = sourceSessionIds.length
    ? await Promise.all([
        LiveSession.find({ _id: { $in: sourceSessionIds } })
          .select("_id activities")
          .lean(),
        LiveResponse.find({
          sessionId: { $in: sourceSessionIds },
          userId: currentUser.user.id,
        })
          .sort({ submittedAt: -1 })
          .lean(),
      ])
    : [[], []];

  const serialized = assignments.map((assignment) => {
    const sourceSession = sourceSessions.find(
      (session) => String(session._id) === String(assignment.sourceLiveSessionId),
    );
    const activities = (sourceSession?.activities || []) as LiveActivity[];
    const reflectionIds = new Set(
      activities
        .filter((activity) => activity.type === "reflection")
        .map((activity) => activity.id),
    );
    const reflection = sourceResponses.find(
      (response) =>
        String(response.sessionId) === String(assignment.sourceLiveSessionId) &&
        reflectionIds.has(response.activityId),
    );
    const ownSubmission = submissions.find(
      (submission) => String(submission.assignmentId) === String(assignment._id),
    );
    return {
      id: String(assignment._id),
      title: assignment.title,
      instructions: assignment.instructions,
      context:
        checkInContextForUser(
          assignment.targetContexts,
          currentUser.user.id,
        )?.context ||
        assignment.context ||
        (reflection ? formatResponseValue(reflection.value) : undefined),
      dueAt: assignment.dueAt
        ? new Date(assignment.dueAt).toISOString()
        : undefined,
      meetingSlotRequired: assignment.meetingSlotRequired,
      meetingSlots: (assignment.meetingSlots || []).map((slot: {
        id: string;
        startAt: Date | string;
        endAt: Date | string;
        timezone: string;
        capacity: number;
      }) => {
        const reservations = meetingReservations.filter(
          (reservation) =>
            String(reservation.assignmentId) === String(assignment._id) &&
            reservation.selectedMeetingSlotId === slot.id,
        );
        const selectedByCurrentLearner =
          ownSubmission?.selectedMeetingSlotId === slot.id;
        return {
          id: slot.id,
          startAt: new Date(slot.startAt).toISOString(),
          endAt: new Date(slot.endAt).toISOString(),
          timezone: slot.timezone,
          available:
            selectedByCurrentLearner || reservations.length < slot.capacity,
        };
      }),
    };
  });
  const serializedSubmissions = submissions.map((submission) => ({
    id: String(submission._id),
    assignmentId: String(submission.assignmentId),
    text: submission.text,
    url: submission.url,
    status: submission.status,
    checkInStatus: submission.checkInStatus,
    selectedMeetingSlotId: submission.selectedMeetingSlotId,
    feedback: submission.feedback,
    submittedAt: new Date(submission.submittedAt).toISOString(),
  }));

  return (
    <div
      className="min-h-screen bg-slate-50"
      style={getCourseThemeStyle(course.theme)}
    >
      <Nav />
      <LearnerCheckIns
        course={{ title: course.title, slug: course.slug }}
        checkIns={serialized}
        submissions={serializedSubmissions}
        initialCheckInId={checkIn}
      />
    </div>
  );
}

function formatResponseValue(value: LiveResponseValue) {
  if (isPrioritizationResponse(value)) {
    const selected = value.items
      .filter((item) => item.selected)
      .map((item) => item.text);
    return selected.length ? selected.join(", ") : value.items.map((item) => item.text).join(", ");
  }
  if (isWorksheetResponse(value)) {
    return Object.values(value.values).map(String).join(", ");
  }
  const values = Array.isArray(value) ? value : [value];
  return values
    .map((item) =>
      String(item).startsWith("__other__:")
        ? String(item).slice("__other__:".length)
        : String(item),
    )
    .join(", ");
}

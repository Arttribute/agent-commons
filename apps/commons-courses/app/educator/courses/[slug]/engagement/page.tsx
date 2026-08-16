import { redirect } from "next/navigation";
import { requireEducatorCourse } from "@/lib/educator-auth";
import {
  buildCourseEngagement,
  type CourseEngagementParticipant,
  type CourseEngagementResponse,
} from "@/lib/course-engagement";
import { CourseEngagementWorkspace } from "@/components/educator/course-engagement-workspace";
import Assignment from "@/models/Assignment";
import LiveParticipant from "@/models/LiveParticipant";
import LiveResponse from "@/models/LiveResponse";
import LiveSession from "@/models/LiveSession";
import Submission from "@/models/Submission";
import type { LiveActivity } from "@/types/live-session";

export default async function CourseEngagementPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ session?: string }>;
}) {
  const { slug } = await params;
  const requestedSession = (await searchParams).session;
  const result = await requireEducatorCourse(slug);
  if (result.error) redirect("/educator");

  const sessionDocuments = await LiveSession.find({ courseId: result.course._id })
    .sort({ updatedAt: -1 })
    .select("title status scheduledStart activities updatedAt")
    .lean();
  const sessionIds = sessionDocuments.map((session) => session._id);
  const [participantCounts, responseCounts] = await Promise.all([
    LiveParticipant.aggregate([
      { $match: { sessionId: { $in: sessionIds } } },
      { $group: { _id: "$sessionId", count: { $sum: 1 } } },
    ]),
    LiveResponse.aggregate([
      { $match: { sessionId: { $in: sessionIds } } },
      { $group: { _id: "$sessionId", count: { $sum: 1 } } },
    ]),
  ]);
  const participantCountMap = new Map(participantCounts.map((item) => [String(item._id), item.count]));
  const responseCountMap = new Map(responseCounts.map((item) => [String(item._id), item.count]));
  const sessions = sessionDocuments.map((session) => ({
    id: String(session._id),
    title: session.title,
    status: session.status,
    date: new Date(session.scheduledStart || session.updatedAt).toISOString(),
    participantCount: participantCountMap.get(String(session._id)) || 0,
    responseCount: responseCountMap.get(String(session._id)) || 0,
  }));
  const selected =
    sessionDocuments.find((session) => String(session._id) === requestedSession) ||
    sessionDocuments.find((session) => (responseCountMap.get(String(session._id)) || 0) > 0) ||
    sessionDocuments[0];

  if (!selected) {
    return (
      <CourseEngagementWorkspace
        slug={slug}
        sessions={[]}
        activities={[]}
        learners={[]}
        followUps={[]}
      />
    );
  }

  const [participants, responses, followUpDocuments] = await Promise.all([
    LiveParticipant.find({ sessionId: selected._id }).sort({ joinedAt: 1 }).lean(),
    LiveResponse.find({ sessionId: selected._id }).sort({ submittedAt: 1 }).lean(),
    Assignment.find({
      courseId: result.course._id,
      kind: "follow_up",
      sourceLiveSessionId: selected._id,
    })
      .sort({ createdAt: -1 })
      .lean(),
  ]);
  const engagement = buildCourseEngagement({
    activities: selected.activities as LiveActivity[],
    participants: participants as unknown as CourseEngagementParticipant[],
    responses: responses as unknown as CourseEngagementResponse[],
  });
  const assignmentIds = followUpDocuments.map((item) => item._id);
  const submissionCounts = assignmentIds.length
    ? await Submission.aggregate([
        { $match: { assignmentId: { $in: assignmentIds } } },
        {
          $group: {
            _id: "$assignmentId",
            count: { $sum: 1 },
            reviewed: { $sum: { $cond: [{ $eq: ["$status", "reviewed"] }, 1, 0] } },
          },
        },
      ])
    : [];
  const submissionMap = new Map(submissionCounts.map((item) => [String(item._id), item]));
  const followUps = followUpDocuments.map((item) => ({
    id: String(item._id),
    title: item.title,
    dueAt: item.dueAt ? new Date(item.dueAt).toISOString() : undefined,
    targetCount: item.targetUserIds?.length || 0,
    submissionCount: submissionMap.get(String(item._id))?.count || 0,
    reviewedCount: submissionMap.get(String(item._id))?.reviewed || 0,
  }));

  return (
    <CourseEngagementWorkspace
      key={String(selected._id)}
      slug={slug}
      sessions={sessions}
      selectedSessionId={String(selected._id)}
      summary={engagement.summary}
      activities={engagement.activities}
      learners={engagement.learners}
      followUps={followUps}
    />
  );
}

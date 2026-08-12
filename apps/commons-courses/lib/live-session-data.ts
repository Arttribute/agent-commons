import type { Types } from "mongoose";
import LiveParticipant from "@/models/LiveParticipant";
import LiveResponse from "@/models/LiveResponse";
import type { ILiveSession } from "@/models/LiveSession";
import type {
  LiveActivity,
  LiveActivityResults,
  LiveParticipantRecord,
  LiveResponseRecord,
  LiveSessionRecord,
} from "@/types/live-session";

type LiveSessionDocumentLike = ILiveSession & {
  _id: Types.ObjectId;
  courseId: Types.ObjectId;
};

export async function serializeEducatorLiveSession(
  session: LiveSessionDocumentLike,
  courseTitle: string,
): Promise<LiveSessionRecord> {
  const [participantCount, responseCountRows] = await Promise.all([
    LiveParticipant.countDocuments({ sessionId: session._id }),
    LiveResponse.aggregate([
      { $match: { sessionId: session._id } },
      { $group: { _id: "$activityId", count: { $sum: 1 } } },
    ]),
  ]);
  const responseCounts = Object.fromEntries(
    responseCountRows.map((row: { _id: string; count: number }) => [row._id, row.count]),
  );
  return serializeBase(session, courseTitle, participantCount, responseCounts);
}

export async function getParticipants(sessionId: Types.ObjectId) {
  const participants = await LiveParticipant.find({ sessionId })
    .sort({ joinedAt: 1 })
    .lean();
  return participants.map(
    (participant): LiveParticipantRecord => ({
      id: String(participant._id),
      displayName: participant.displayName,
      status: participant.status,
      joinedAt: participant.joinedAt.toISOString(),
      lastSeenAt: participant.lastSeenAt.toISOString(),
    }),
  );
}

export async function getSessionResults(
  session: LiveSessionDocumentLike,
  revealNames: boolean,
) {
  const responses = await LiveResponse.find({ sessionId: session._id })
    .populate("participantId", "displayName")
    .sort({ submittedAt: 1 })
    .lean();
  const results: Record<string, LiveActivityResults> = {};
  for (const activity of session.activities) {
    const activityResponses = responses.filter(
      (response) => response.activityId === activity.id,
    );
    results[activity.id] = buildActivityResults(
      activity,
      activityResponses as unknown as Array<{
        _id: Types.ObjectId;
        value: string | string[];
        correct?: boolean;
        participantId?: { displayName?: string };
      }>,
      revealNames,
    );
  }
  return results;
}

export async function getLearnerResponses(
  sessionId: Types.ObjectId,
  participantId: Types.ObjectId,
) {
  const responses = await LiveResponse.find({ sessionId, participantId }).lean();
  return Object.fromEntries(
    responses.map((response) => [
      response.activityId,
      {
        activityId: response.activityId,
        value: response.value as string | string[],
        correct: response.correct,
        pointsAwarded: response.pointsAwarded,
        submittedAt: response.submittedAt.toISOString(),
      } satisfies LiveResponseRecord,
    ]),
  );
}

export function learnerSafeActivities(activities: LiveActivity[]) {
  return activities.map((activity) => ({
    ...activity,
    facilitatorNotes: undefined,
    options: activity.options.map((option) => ({
      id: option.id,
      label: option.label,
      isCorrect:
        activity.status === "closed" && activity.showResults
          ? Boolean(option.isCorrect)
          : undefined,
    })),
  }));
}

function serializeBase(
  session: LiveSessionDocumentLike,
  courseTitle: string,
  participantCount: number,
  responseCounts: Record<string, number>,
): LiveSessionRecord {
  return {
    id: String(session._id),
    courseId: String(session.courseId),
    courseSlug: session.courseSlug,
    courseTitle,
    title: session.title,
    description: session.description,
    joinCode: session.joinCode,
    status: session.status,
    pace: session.pace,
    access: session.access,
    invitedEmails: session.invitedEmails || [],
    scheduledStart: session.scheduledStart?.toISOString(),
    currentActivityId: session.currentActivityId,
    activities: session.activities || [],
    settings: session.settings,
    participantCount,
    responseCounts,
    createdAt: session.createdAt.toISOString(),
    updatedAt: session.updatedAt.toISOString(),
  };
}

function buildActivityResults(
  activity: LiveActivity,
  responses: Array<{
    _id: Types.ObjectId;
    value: string | string[];
    correct?: boolean;
    participantId?: { displayName?: string };
  }>,
  revealNames: boolean,
): LiveActivityResults {
  if (activity.options.length) {
    return {
      total: responses.length,
      correct:
        activity.type === "quiz"
          ? responses.filter((response) => response.correct).length
          : undefined,
      options: activity.options.map((option) => ({
        id: option.id,
        label: option.label,
        count: responses.filter((response) => {
          const values = Array.isArray(response.value) ? response.value : [response.value];
          return values.includes(option.id);
        }).length,
      })),
    };
  }
  return {
    total: responses.length,
    textResponses: responses.map((response) => ({
      id: String(response._id),
      participantName: revealNames
        ? response.participantId?.displayName || "Learner"
        : undefined,
      value: Array.isArray(response.value)
        ? response.value.join(", ")
        : String(response.value),
    })),
  };
}


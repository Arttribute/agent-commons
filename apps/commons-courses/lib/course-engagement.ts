import type { LiveActivity } from "../types/live-session";
import type {
  EngagementActivity,
  EngagementLearner,
  EngagementSummary,
} from "../types/course-engagement";

const OTHER_RESPONSE_PREFIX = "__other__:";

export type CourseEngagementParticipant = {
  _id: unknown;
  userId: unknown;
  displayName: string;
  email: string;
  status: string;
  joinedAt: Date | string;
  lastSeenAt: Date | string;
};

export type CourseEngagementResponse = {
  participantId: unknown;
  userId: unknown;
  activityId: string;
  value: string | string[];
  correct?: boolean;
  submittedAt: Date | string;
};

function id(value: unknown) {
  return String(value ?? "");
}

function percent(value: number, total: number) {
  return total ? Math.round((value / total) * 100) : 0;
}

function responseLabel(activity: LiveActivity, value: string | string[]) {
  const values = Array.isArray(value) ? value : [value];
  return values
    .map((item) => {
      const other = item.startsWith(OTHER_RESPONSE_PREFIX)
        ? item.slice(OTHER_RESPONSE_PREFIX.length)
        : undefined;
      if (other !== undefined) return other;
      if (item === "complete") return "Completed";
      return activity.options.find((option) => option.id === item)?.label || item;
    })
    .join(", ");
}

export function buildCourseEngagement(args: {
  activities: LiveActivity[];
  participants: CourseEngagementParticipant[];
  responses: CourseEngagementResponse[];
}) {
  const { activities, participants, responses } = args;
  const participantById = new Map(participants.map((item) => [id(item._id), item]));
  const responseActivities = activities.filter(
    (activity) => activity.status !== "draft" && activity.type !== "content" && activity.type !== "break",
  );
  const responseActivityIds = new Set(responseActivities.map((activity) => activity.id));
  const meaningfulResponses = responses.filter((response) => responseActivityIds.has(response.activityId));
  const engaged = new Set(meaningfulResponses.map((response) => id(response.userId)));
  const quizResponses = responses.filter((response) =>
    activities.some((activity) => activity.id === response.activityId && activity.type === "quiz"),
  );
  const quizCorrect = quizResponses.filter((response) => response.correct).length;

  const summary: EngagementSummary = {
    attendees: participants.length,
    engagedLearners: engaged.size,
    participationRate: percent(engaged.size, participants.length),
    responseCount: responses.length,
    quizAccuracy: quizResponses.length ? percent(quizCorrect, quizResponses.length) : undefined,
  };

  const activityInsights: EngagementActivity[] = activities.map((activity, index) => {
    const activityResponses = responses.filter((response) => response.activityId === activity.id);
    const correct = activityResponses.filter((response) => response.correct).length;
    const values = activityResponses.flatMap((response) =>
      Array.isArray(response.value) ? response.value : [response.value],
    );
    return {
      id: activity.id,
      index: index + 1,
      title: activity.title,
      type: activity.type,
      responseCount: activityResponses.length,
      responseRate: percent(activityResponses.length, participants.length),
      correctRate:
        activity.type === "quiz" && activityResponses.length
          ? percent(correct, activityResponses.length)
          : undefined,
      options: activity.options.map((option) => {
        const count = values.filter((value) => value === option.id).length;
        return { label: option.label, count, percent: percent(count, activityResponses.length) };
      }),
      responses: activityResponses.map((response) => ({
        participantName:
          participantById.get(id(response.participantId))?.displayName || "Learner",
        userId: id(response.userId),
        value: responseLabel(activity, response.value),
        submittedAt: new Date(response.submittedAt).toISOString(),
      })),
    };
  });

  const learners: EngagementLearner[] = participants.map((participant) => {
    const learnerResponses = meaningfulResponses.filter(
      (response) => id(response.userId) === id(participant.userId),
    );
    const learnerQuiz = quizResponses.filter(
      (response) => id(response.userId) === id(participant.userId),
    );
    return {
      participantId: id(participant._id),
      userId: id(participant.userId),
      name: participant.displayName,
      email: participant.email,
      status: participant.status,
      joinedAt: new Date(participant.joinedAt).toISOString(),
      lastSeenAt: new Date(participant.lastSeenAt).toISOString(),
      responseCount: learnerResponses.length,
      responseRate: percent(learnerResponses.length, responseActivities.length),
      quizCorrect: learnerQuiz.filter((response) => response.correct).length,
      quizTotal: learnerQuiz.length,
    };
  });

  learners.sort((a, b) => b.responseCount - a.responseCount || a.name.localeCompare(b.name));
  return { summary, activities: activityInsights, learners };
}

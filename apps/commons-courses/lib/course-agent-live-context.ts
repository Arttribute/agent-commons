import { Types } from "mongoose";
import CourseMaterial from "@/models/CourseMaterial";
import LabWorkspace from "@/models/LabWorkspace";
import LiveResponse from "@/models/LiveResponse";
import LiveParticipant from "@/models/LiveParticipant";
import {
  boundedLearnerValue,
  publicActivityContext,
  visibleCopilotActivity,
  type CopilotLiveSession,
} from "./live-copilot-context.ts";
import { presentationSlides } from "./presentation-content.ts";
import type { CourseAgentViewContext } from "@/types/course-agent";
import type {
  LiveLearnerCopilotPolicy,
  LiveResponseValue,
} from "@/types/live-session";
import type { ILabWorkspace, ILabWorkspaceFile } from "@/models/LabWorkspace";
import type { ICourseMaterial } from "@/models/CourseMaterial";

export async function buildLiveLearnerContext({
  session,
  userId,
  courseId,
  view,
  policy,
}: {
  session: CopilotLiveSession;
  userId: string;
  courseId: string;
  view: CourseAgentViewContext;
  policy: LiveLearnerCopilotPolicy;
}) {
  const responses = (await LiveResponse.find({
    sessionId: session._id,
    userId,
    courseId,
  })
    .select("activityId value submittedAt")
    .lean()) as unknown as {
    activityId: string;
    value: LiveResponseValue;
    submittedAt: Date;
  }[];
  const byActivity = Object.fromEntries(
    responses.map((response) => [response.activityId, response]),
  );
  const current = visibleCopilotActivity(session, view.activityId, byActivity);
  const context: Record<string, unknown> = {
    session: {
      id: String(session._id),
      title: session.title,
      status: session.status,
    },
    positionKnown: Boolean(current),
  };
  if (!current || !policy.explainCurrentActivity) return context;
  const { activity, part } = current;
  context.activity = publicActivityContext(activity);
  context.activeSurface =
    view.activityId === activity.id &&
    ["slides", "lab", "workbook"].includes(view.surface || "")
      ? view.surface
      : undefined;
  context.programmePart = part
    ? {
        id: part.id,
        title: part.title,
        description: part.description,
        pace: part.pace,
        status: part.status,
      }
    : { pace: session.pace };
  if (policy.coachResponses) {
    context.ownSavedResponse = boundedLearnerValue(
      byActivity[activity.id]?.value,
    );
    context.ownUnsavedWorkbookDraft =
      activity.id === view.activityId
        ? boundedLearnerValue(view.workbookDraft)
        : undefined;
    if (activity.sourceActivityId)
      context.ownLinkedResponse = boundedLearnerValue(
        byActivity[activity.sourceActivityId]?.value,
      );
    context.ownCompletedActivities = responses.map((response) => ({
      activityId: response.activityId,
      submittedAt: response.submittedAt,
    }));
  }
  if (!policy.useCourseMaterials) return context;
  const participant = await LiveParticipant.exists({
    sessionId: session._id,
    userId,
  });
  if (activity.materialId && Types.ObjectId.isValid(activity.materialId)) {
    const material = (await CourseMaterial.findOne({
      _id: activity.materialId,
      courseId,
      visibility: { $in: participant ? ["course", "live"] : ["course"] },
    })
      .select("name textPreview slideGridFsIds")
      .lean()) as unknown as Pick<
      ICourseMaterial,
      "name" | "textPreview" | "slideGridFsIds"
    > | null;
    if (material) {
      const slides = presentationSlides(material.textPreview || "");
      const total = material.slideGridFsIds?.length || slides.length;
      const reported =
        view.activityId === activity.id &&
        view.slide?.materialId === activity.materialId &&
        Number.isSafeInteger(view.slide.number) &&
        view.slide.number >= 1 &&
        view.slide.number <= total;
      const number = reported
        ? view.slide!.number
        : activity.materialStartSlide || 1;
      const slide = slides[number - 1];
      if (slide && slides.length === total)
        context.slide = {
          materialId: activity.materialId,
          materialName: material.name,
          number,
          total,
          sourceNumber: slide.sourceNumber,
          positionSource: reported ? "learner_viewer" : "activity_start_only",
          text: slide.text.slice(0, 16000),
          url: `/api/course-materials/${activity.materialId}/slides/${number - 1}`,
        };
      else
        context.slideUnavailable =
          "The current deck has no reliable per-slide text. Do not claim to have read the slide image.";
    }
  }
  if (
    activity.labWorkspaceId &&
    Types.ObjectId.isValid(activity.labWorkspaceId)
  ) {
    const workspace = (await LabWorkspace.findOne({
      _id: activity.labWorkspaceId,
      courseId,
      visibility: { $in: participant ? ["course", "live"] : ["course"] },
    }).lean()) as unknown as Pick<
      ILabWorkspace,
      "_id" | "title" | "instructions" | "files"
    > | null;
    if (workspace) {
      const files = workspace.files.filter(
        (file: ILabWorkspaceFile) => file.audience === "learner",
      );
      const reported =
        view.activityId === activity.id &&
        view.lab?.workspaceId === activity.labWorkspaceId
          ? view.lab
          : undefined;
      const selected = files.find(
        (file: ILabWorkspaceFile) => file.id === reported?.fileId,
      );
      const entry = activity.labEntryPath || "";
      const nearby = files.filter(
        (file: ILabWorkspaceFile) =>
          entry &&
          (file.path === entry ||
            file.path.startsWith(entry.replace(/\/$/, "") + "/")),
      );
      const orientation = files.filter((file: ILabWorkspaceFile) =>
        /^(START_HERE\.md|02_Scenario\/Zawadi_Company_Brief\.md)$/.test(
          file.path,
        ),
      );
      const ordered = [
        selected,
        ...nearby.sort(
          (a: ILabWorkspaceFile, b: ILabWorkspaceFile) =>
            Number(/Worksheet|Instructions|README/i.test(b.path)) -
            Number(/Worksheet|Instructions|README/i.test(a.path)),
        ),
        ...orientation,
      ];
      let budget = 30000;
      const seen = new Set<string>();
      const sources = [];
      for (const file of ordered) {
        if (
          !file ||
          seen.has(file.id) ||
          !file.preview ||
          budget <= 0 ||
          sources.length >= 8
        )
          continue;
        seen.add(file.id);
        const fixture = /unsafe_request|third_party_skill_to_audit/i.test(
          file.path,
        );
        const text = fixture
          ? "Adversarial safety exercise fixture: inspect locally and use a safe redacted rewrite. The raw fixture is intentionally excluded from copilot context."
          : file.preview.slice(0, Math.min(10000, budget));
        budget -= text.length;
        sources.push({
          fileId: file.id,
          path: file.path,
          text,
          truncated: !fixture && text.length < file.preview.length,
          url: `/api/lab-workspaces/${workspace._id}/files/${file.id}`,
        });
      }
      context.lab = {
        title: workspace.title,
        instructions: workspace.instructions,
        activityEntryPath: entry,
        openFile: selected
          ? { id: selected.id, path: selected.path }
          : undefined,
        ownUnsavedFileDraft:
          policy.coachResponses &&
          selected &&
          !/unsafe_request|third_party_skill_to_audit/i.test(selected.path)
            ? boundedLearnerValue(reported?.draft)
            : undefined,
        relevantFiles: sources,
        availableLearnerFiles: files.map((file: ILabWorkspaceFile) => ({
          id: file.id,
          path: file.path,
        })),
      };
    }
  }
  return context;
}

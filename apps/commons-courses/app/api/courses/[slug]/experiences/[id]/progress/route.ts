import { isValidObjectId, type Types } from "mongoose";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { connectDB } from "@/lib/db";
import { trackAnalyticsEvent } from "@/lib/analytics";
import {
  evaluateExperienceScene,
  type ExperienceInteractionAnswer,
} from "@/lib/experience-evaluation";
import Course from "@/models/Course";
import Enrollment from "@/models/Enrollment";
import ExperienceProgress from "@/models/ExperienceProgress";
import ExperienceProject from "@/models/ExperienceProject";
import ExperienceRevision from "@/models/ExperienceRevision";
import type { ExperienceDocument, ExperienceProgressDTO } from "@/types/experience";
import { normalizeExperienceDocument } from "@/lib/experience-schema";

type ProgressBody = {
  action?: "advance" | "answer" | "reset";
  sceneId?: string;
  answerId?: string;
  answer?: ExperienceInteractionAnswer;
};

type CourseRecord = {
  _id: Types.ObjectId;
  slug: string;
  isFree: boolean;
};
type ProjectRecord = {
  _id: Types.ObjectId;
  publishedRevisionId: Types.ObjectId;
  isFreePreview: boolean;
};
type RevisionRecord = {
  _id: Types.ObjectId;
  version: number;
  document: ExperienceDocument;
};

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ slug: string; id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }
  const loaded = await loadPublishedExperience(context.params, session.user.id);
  if (loaded.error) return loaded.error;
  const { project, revision, document, course } = loaded;

  let progress = await ExperienceProgress.findOne({
    userId: session.user.id,
    projectId: project._id,
  });
  if (!progress || String(progress.revisionId) !== String(revision._id)) {
    progress = await ExperienceProgress.findOneAndUpdate(
      { userId: session.user.id, projectId: project._id },
      {
        $set: {
          courseId: course._id,
          revisionId: revision._id,
          revisionVersion: revision.version,
          currentSceneId: document.startSceneId,
          completedSceneIds: [],
          score: 0,
          attempts: {},
          completed: false,
        },
        $unset: { completedAt: 1 },
      },
      { upsert: true, new: true },
    );
  }
  if (!progress) {
    return NextResponse.json(
      { error: "Could not initialize experience progress." },
      { status: 500 },
    );
  }
  return NextResponse.json(serializeProgress(progress, true));
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ slug: string; id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in to save progress." }, { status: 401 });
  }
  const loaded = await loadPublishedExperience(context.params, session.user.id);
  if (loaded.error) return loaded.error;
  const { project, revision, document, course, slug } = loaded;
  const body = (await req.json().catch(() => ({}))) as ProgressBody;

  let progress = await ExperienceProgress.findOne({
    userId: session.user.id,
    projectId: project._id,
  });
  if (
    !progress ||
    String(progress.revisionId) !== String(revision._id) ||
    body.action === "reset"
  ) {
    progress = await ExperienceProgress.findOneAndUpdate(
      { userId: session.user.id, projectId: project._id },
      {
        $set: {
          courseId: course._id,
          revisionId: revision._id,
          revisionVersion: revision.version,
          currentSceneId: document.startSceneId,
          completedSceneIds: [],
          score: 0,
          attempts: {},
          completed: false,
        },
        $unset: { completedAt: 1 },
      },
      { upsert: true, new: true },
    );
    if (body.action === "reset") {
      if (!progress) {
        return NextResponse.json(
          { error: "Could not reset experience progress." },
          { status: 500 },
        );
      }
      return NextResponse.json(serializeProgress(progress, true));
    }
  }
  if (!progress) {
    return NextResponse.json(
      { error: "Could not initialize experience progress." },
      { status: 500 },
    );
  }

  if (!body.sceneId || progress.currentSceneId !== body.sceneId) {
    return NextResponse.json(
      { error: "This scene is no longer current. Refresh the experience." },
      { status: 409 },
    );
  }
  const scene = document.scenes.find((item) => item.id === body.sceneId);
  if (!scene) {
    return NextResponse.json({ error: "Scene not found." }, { status: 404 });
  }

  const evaluation = evaluateExperienceScene(
    scene,
    body.answerId,
    body.answer,
  );
  const attempts = progress.attempts || new Map<string, number>();
  attempts.set(scene.id, (attempts.get(scene.id) || 0) + 1);
  progress.attempts = attempts;
  if (!evaluation.correct) {
    await progress.save();
    return NextResponse.json({
      ...serializeProgress(progress, true),
      correct: false,
      feedback: scene.retryFeedback || "Try again.",
    } satisfies ExperienceProgressDTO);
  }

  if (!progress.completedSceneIds.includes(scene.id)) {
    progress.completedSceneIds.push(scene.id);
    progress.score += scene.points || 0;
  }
  progress.currentSceneId = evaluation.nextSceneId || scene.id;
  if (scene.type === "completion" || !evaluation.nextSceneId) {
    progress.completed = true;
    progress.completedAt = new Date();
  }
  await progress.save();

  await trackAnalyticsEvent({
    eventType:
      scene.type === "completion" ? "experience_completed" : "experience_scene_completed",
    userId: session.user.id,
    courseId: String(course._id),
    courseSlug: slug,
    page: "course.experience",
    metadata: {
      experienceId: String(project._id),
      revisionVersion: revision.version,
      sceneId: scene.id,
      sceneType: scene.type,
      score: progress.score,
    },
  });

  return NextResponse.json({
    ...serializeProgress(progress, true),
    correct: true,
    feedback: scene.successFeedback,
  } satisfies ExperienceProgressDTO);
}

async function loadPublishedExperience(
  paramsPromise: Promise<{ slug: string; id: string }>,
  userId: string,
) {
  const { slug, id } = await paramsPromise;
  if (!isValidObjectId(id)) {
    return {
      error: NextResponse.json({ error: "Experience not found." }, { status: 404 }),
    } as const;
  }
  await connectDB();
  const course = (await Course.findOne({ slug, published: true })
    .select("_id slug isFree")
    .lean()) as CourseRecord | null;
  const project = course
    ? ((await ExperienceProject.findOne({
        _id: id,
        courseId: course._id,
        status: "published",
        publishedRevisionId: { $exists: true },
      }).lean()) as ProjectRecord | null)
    : null;
  if (!course || !project?.publishedRevisionId) {
    return {
      error: NextResponse.json({ error: "Experience not found." }, { status: 404 }),
    } as const;
  }
  if (!course.isFree && !project.isFreePreview) {
    const enrollment = await Enrollment.findOne({
      userId,
      courseId: course._id,
      status: { $in: ["active", "completed"] },
      paymentStatus: { $ne: "overdue" },
    })
      .select("_id")
      .lean();
    if (!enrollment) {
      return {
        error: NextResponse.json(
          { error: "Enroll in this course to save progress." },
          { status: 403 },
        ),
      } as const;
    }
  }
  const revision = (await ExperienceRevision.findById(
    project.publishedRevisionId,
  ).lean()) as RevisionRecord | null;
  if (!revision) {
    return {
      error: NextResponse.json({ error: "Experience not found." }, { status: 404 }),
    } as const;
  }
  return {
    error: null,
    slug,
    course,
    project,
    revision,
    document: normalizeExperienceDocument(revision.document),
  } as const;
}

function serializeProgress(
  progress: {
    currentSceneId: string;
    completedSceneIds: string[];
    score: number;
    attempts?: Map<string, number>;
    completed: boolean;
  },
  authenticated: boolean,
): ExperienceProgressDTO {
  return {
    authenticated,
    currentSceneId: progress.currentSceneId,
    completedSceneIds: progress.completedSceneIds || [],
    score: progress.score || 0,
    attempts: Object.fromEntries(progress.attempts || []),
    completed: progress.completed,
  };
}

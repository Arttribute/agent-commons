import type mongoose from "mongoose";
import Assignment from "@/models/Assignment";
import Course from "@/models/Course";
import Submission from "@/models/Submission";
import { stripRichTextHtml } from "@/lib/rich-text";
import { upsertSearchIndexItem } from "@/lib/vector-search";

type CourseDocument = {
  _id: mongoose.Types.ObjectId;
  title: string;
  slug: string;
  tagline?: string;
  description?: string;
  longDescription?: string;
  modules?: Array<{
    title: string;
    description?: string;
    assignment?: string;
    lessons?: Array<{
      title: string;
      duration?: string;
      description?: string;
      isFree?: boolean;
    }>;
  }>;
};

type AssignmentDocument = {
  _id: mongoose.Types.ObjectId;
  courseId: mongoose.Types.ObjectId;
  educatorId?: mongoose.Types.ObjectId;
  title: string;
  instructions: string;
  moduleIndex?: number;
  lessonIndex?: number;
  published?: boolean;
};

type SubmissionDocument = {
  _id: mongoose.Types.ObjectId;
  assignmentId: mongoose.Types.ObjectId;
  courseId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  text?: string;
  url?: string;
  feedback?: string;
  status?: string;
};

export async function indexCourseForSearch(course: CourseDocument) {
  await upsertSearchIndexItem({
    courseId: course._id,
    sourceKind: "course",
    sourceId: String(course._id),
    sourcePath: "overview",
    title: course.title,
    text: [course.tagline, course.description, course.longDescription]
      .filter(Boolean)
      .map((item) => stripRichTextHtml(item))
      .join("\n\n"),
    visibility: "course_enrolled",
    metadata: { slug: course.slug },
  });

  for (const [moduleIndex, module] of (course.modules || []).entries()) {
    await upsertSearchIndexItem({
      courseId: course._id,
      sourceKind: "module",
      sourceId: String(course._id),
      sourcePath: `modules.${moduleIndex}`,
      title: module.title,
      text: [module.description, module.assignment]
        .filter(Boolean)
        .map((item) => stripRichTextHtml(item))
        .join("\n\n"),
      visibility: "course_enrolled",
      metadata: { slug: course.slug, moduleIndex },
    });

    for (const [lessonIndex, lesson] of (module.lessons || []).entries()) {
      await upsertSearchIndexItem({
        courseId: course._id,
        sourceKind: "lesson",
        sourceId: String(course._id),
        sourcePath: `modules.${moduleIndex}.lessons.${lessonIndex}`,
        title: lesson.title,
        text: [lesson.duration, lesson.description]
          .filter(Boolean)
          .map((item) => stripRichTextHtml(item))
          .join("\n\n"),
        visibility: lesson.isFree ? "course_public" : "course_enrolled",
        metadata: { slug: course.slug, moduleIndex, lessonIndex },
      });
    }
  }
}

export async function indexAssignmentForSearch(assignment: AssignmentDocument) {
  if (!assignment.published) return;

  await upsertSearchIndexItem({
    courseId: assignment.courseId,
    sourceKind: "assignment",
    sourceId: String(assignment._id),
    title: assignment.title,
    text: assignment.instructions,
    visibility: "course_enrolled",
    educatorId: assignment.educatorId,
    metadata: {
      assignmentId: String(assignment._id),
      moduleIndex: assignment.moduleIndex,
      lessonIndex: assignment.lessonIndex,
    },
  });
}

export async function indexSubmissionForSearch(submission: SubmissionDocument) {
  if (submission.text || submission.url) {
    await upsertSearchIndexItem({
      courseId: submission.courseId,
      sourceKind: "submission",
      sourceId: String(submission._id),
      title: "Learner submission",
      text: [submission.text, submission.url].filter(Boolean).join("\n"),
      url: submission.url,
      mediaType: submission.url ? "url" : "text",
      visibility: "learner_private",
      userId: submission.userId,
      metadata: {
        assignmentId: String(submission.assignmentId),
        status: submission.status,
      },
    });
  }

  if (submission.feedback) {
    await upsertSearchIndexItem({
      courseId: submission.courseId,
      sourceKind: "feedback",
      sourceId: String(submission._id),
      sourcePath: "feedback",
      title: "Educator feedback",
      text: submission.feedback,
      visibility: "learner_private",
      userId: submission.userId,
      metadata: {
        assignmentId: String(submission.assignmentId),
        status: submission.status,
      },
    });
  }
}

export async function reindexCourseById(courseId: unknown) {
  const course = (await Course.findById(courseId).lean()) as CourseDocument | null;
  if (!course) return;

  await indexCourseForSearch(course);

  const assignments = (await Assignment.find({
    courseId: course._id,
  }).lean()) as unknown as AssignmentDocument[];
  for (const assignment of assignments || []) {
    await indexAssignmentForSearch(assignment);
  }

  const submissions = (await Submission.find({
    courseId: course._id,
  }).lean()) as unknown as SubmissionDocument[];
  for (const submission of submissions || []) {
    await indexSubmissionForSearch(submission);
  }
}

"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { CourseAgentEditor } from "@/components/educator/course-agent-editor";
import { CourseCollaborators } from "@/components/educator/course-collaborators";
import {
  AccessProgramEditor,
  normalizeAccessProgramForm,
  type AccessProgramForm,
} from "@/components/educator/access-program-editor";
import { useToast } from "@/components/toast-provider";
import { defaultCourseAgents } from "@/lib/course-agent-defaults";
import type { LiveSchedule } from "@/lib/course-schedule";
import { cn } from "@/lib/utils";
import type { CourseAgentConfig } from "@/types/course-agent";
import type { SkillChallenge, SkillPack, SkillQuestion } from "@/types/skills";

type Lesson = {
  title: string;
  duration: string;
  description?: string;
  assetUrl?: string;
  assetAlt?: string;
  isFree?: boolean;
};

type Module = {
  title: string;
  description?: string;
  assignment?: string;
  lessons: Lesson[];
};

type CourseForm = {
  title: string;
  slug?: string;
  tagline: string;
  description: string;
  longDescription: string;
  price: number;
  currency: string;
  isFree: boolean;
  published: boolean;
  level: "beginner" | "intermediate" | "advanced";
  courseType: "self-paced" | "live";
  startDate?: string;
  nextSessionDate?: string;
  sessionDatesText: string;
  liveSchedule: LiveSchedule;
  maxEnrollments?: number;
  liveSessionUrl?: string;
  duration: string;
  instructor: string;
  tagsText: string;
  imageUrl?: string;
  bannerImageUrl?: string;
  previewImageUrl?: string;
  paymentProviders: ("stripe" | "paystack")[];
  installmentPlan: {
    enabled: boolean;
    installmentAmount?: number;
    installmentCount: number;
    releaseAccess:
      | "full_after_first_payment"
      | "module_by_module"
      | "full_after_completion";
  };
  accessProgram: AccessProgramForm;
  emailSettings: {
    welcomeEnabled: boolean;
    enrollmentEnabled: boolean;
    assignmentCreatedEnabled: boolean;
    assignmentUpdatedEnabled: boolean;
    courseUpdateEnabled: boolean;
    agentManaged: boolean;
    replyTo?: string;
    customIntro?: string;
  };
  modules: Module[];
  skillPack: SkillPack;
  agents: CourseAgentConfig[];
};

type CourseResponse = Partial<CourseForm> & {
  tags?: string[];
  startDate?: string | Date | null;
  nextSessionDate?: string | Date | null;
  sessionDates?: Array<string | Date>;
  liveSchedule?: LiveSchedule;
};

export type CourseEditorSection =
  | "all"
  | "info"
  | "access"
  | "notifications"
  | "agents"
  | "content"
  | "skills"
  | "collaborators";

const emptyCourse: CourseForm = {
  title: "",
  tagline: "",
  description: "",
  longDescription: "",
  price: 0,
  currency: "USD",
  isFree: true,
  published: false,
  level: "beginner",
  courseType: "self-paced",
  startDate: "",
  nextSessionDate: "",
  sessionDatesText: "",
  liveSchedule: {
    cadence: "weekly",
    dayOfWeek: "thursday",
    time: "",
    timezone: "",
    sessionsCount: undefined,
    description: "",
  },
  maxEnrollments: undefined,
  liveSessionUrl: "",
  duration: "Self-paced",
  instructor: "",
  tagsText: "",
  imageUrl: "",
  bannerImageUrl: "",
  previewImageUrl: "",
  paymentProviders: ["stripe"],
  installmentPlan: {
    enabled: false,
    installmentCount: 4,
    releaseAccess: "module_by_module",
  },
  accessProgram: normalizeAccessProgramForm(),
  emailSettings: {
    welcomeEnabled: true,
    enrollmentEnabled: true,
    assignmentCreatedEnabled: true,
    assignmentUpdatedEnabled: true,
    courseUpdateEnabled: false,
    agentManaged: false,
    replyTo: "",
    customIntro: "",
  },
  modules: [
    {
      title: "Module 1",
      lessons: [{ title: "Lesson 1", duration: "15", isFree: true }],
    },
  ],
  agents: defaultCourseAgents,
  skillPack: {
    enabled: false,
    title: "Daily skill challenges",
    subtitle: "",
    learnerPromise: "",
    challenges: [],
  },
};

export function CourseEditor({
  slug,
  section = "all",
}: {
  slug?: string;
  section?: CourseEditorSection;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { toast } = useToast();
  const [course, setCourse] = useState<CourseForm>(emptyCourse);
  const [savedSectionSnapshot, setSavedSectionSnapshot] = useState(() =>
    stringifySectionSnapshot(emptyCourse, section)
  );
  const [saving, setSaving] = useState(false);
  const [uploadingMedia, setUploadingMedia] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [draftSavedAt, setDraftSavedAt] = useState<Date | null>(null);
  const isFullEditor = section === "all";
  const show = (name: CourseEditorSection) => isFullEditor || section === name;
  const sectionLabel = getSectionLabel(section);
  const currentSectionSnapshot = useMemo(
    () => stringifySectionSnapshot(course, section),
    [course, section]
  );
  const hasUnsavedChanges = currentSectionSnapshot !== savedSectionSnapshot;

  useEffect(() => {
    if (!slug) return;
    fetch(`/api/educator/courses/${slug}`)
      .then((res) => res.json())
      .then((data) => {
        const c = data.course;
        if (!c) return;
        const nextCourse = hydrateCourse(c);
        setCourse(nextCourse);
        setSavedSectionSnapshot(stringifySectionSnapshot(nextCourse, section));
      })
      .catch(() => setError("Could not load course."));
  }, [section, slug]);

  useEffect(() => {
    if (!hasUnsavedChanges || !slug || section === "collaborators") return;
    const timeout = window.setTimeout(() => {
      localStorage.setItem(
        `commonlab-course-draft:${slug}:${section}`,
        JSON.stringify({
          savedAt: new Date().toISOString(),
          snapshot: getSectionSnapshot(course, section),
        })
      );
      setDraftSavedAt(new Date());
    }, 1800);

    return () => window.clearTimeout(timeout);
  }, [course, hasUnsavedChanges, section, slug]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!course.isFree && course.paymentProviders.length === 0) {
      setError("Choose at least one payment provider for a paid course.");
      return;
    }
    setSaving(true);
    setError("");
    const courseForPayload = { ...course } as CourseForm & {
      collaborators?: unknown;
    };
    delete courseForPayload.collaborators;
    const payload = {
      ...courseForPayload,
      tags: course.tagsText
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean),
    };
    const res = await fetch(slug ? `/api/educator/courses/${slug}` : "/api/educator/courses", {
      method: slug ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) {
      setError(data.error || "Could not save course.");
      toast({
        tone: "error",
        title: "Could not save",
        description: data.error || "Please check the form and try again.",
      });
      return;
    }
    const nextCourse = data.course ? hydrateCourse(data.course) : course;
    setCourse(nextCourse);
    setSavedSectionSnapshot(stringifySectionSnapshot(nextCourse, section));
    setDraftSavedAt(null);
    if (slug) {
      localStorage.removeItem(`commonlab-course-draft:${slug}:${section}`);
    }
    toast({
      tone: "success",
      title: `${sectionLabel} saved`,
      description: "Your changes are now live for this course.",
    });
    if (slug) {
      const savedSlug = data.course?.slug || slug;
      if (savedSlug !== slug) {
        router.push(pathname.replace(`/educator/courses/${slug}`, `/educator/courses/${savedSlug}`));
        return;
      }
      router.refresh();
      router.push(pathname);
      return;
    }
    if (data.course?.slug) {
      router.push(`/educator/courses/${data.course.slug}`);
      return;
    }
    router.push("/educator");
  }

  function setProvider(provider: "stripe" | "paystack", enabled: boolean) {
    setCourse({
      ...course,
      paymentProviders: enabled
        ? Array.from(new Set([...course.paymentProviders, provider]))
        : course.paymentProviders.filter((item) => item !== provider),
    });
  }

  async function uploadMedia(
    field: "imageUrl" | "bannerImageUrl" | "previewImageUrl" | `skillPack.${number}.assetUrl`,
    file?: File
  ) {
    if (!file) return;
    setUploadingMedia(field);
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch("/api/educator/uploads", {
      method: "POST",
      body: formData,
    });
    const data = await res.json();
    setUploadingMedia(null);
    if (!res.ok) {
      toast({
        tone: "error",
        title: "Upload failed",
        description: data.error || "Could not upload this image.",
      });
      return;
    }
    if (field.startsWith("skillPack.")) {
      const challengeIndex = Number(field.split(".")[1]);
      setCourse((current) =>
        updateSkillChallengeValue(current, challengeIndex, { assetUrl: data.url })
      );
    } else {
      setCourse((current) => ({ ...current, [field]: data.url }));
    }
    toast({
      tone: "success",
      title: "Image uploaded",
      description: "Save course info to publish this image.",
    });
  }

  if (section === "collaborators") {
    return <CourseCollaborators slug={slug} />;
  }

  return (
    <form onSubmit={onSubmit} className="space-y-8">
      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {show("info") && (
        <EditorPanel
          title="Course info"
          description="Core identity, positioning, publish status, and public course details."
        >
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Title" value={course.title} required onChange={(value) => setCourse({ ...course, title: value })} />
            <Field label="Slug" value={course.slug || ""} onChange={(value) => setCourse({ ...course, slug: value })} />
            <Field label="Tagline" value={course.tagline} required onChange={(value) => setCourse({ ...course, tagline: value })} />
            <Field label="Instructor" value={course.instructor} onChange={(value) => setCourse({ ...course, instructor: value })} />
            <Field label="Duration" value={course.duration} onChange={(value) => setCourse({ ...course, duration: value })} />
            <Field label="Tags" value={course.tagsText} onChange={(value) => setCourse({ ...course, tagsText: value })} />
            <Field
              label="Start date"
              type="date"
              value={course.startDate || ""}
              onChange={(value) => setCourse({ ...course, startDate: value })}
            />
            <Field
              label="Next live session"
              type="datetime-local"
              value={course.nextSessionDate || ""}
              onChange={(value) => setCourse({ ...course, nextSessionDate: value })}
            />
          </div>

          <TextArea label="Short description" value={course.description} onChange={(value) => setCourse({ ...course, description: value })} />
          <TextArea label="Long description" value={course.longDescription} onChange={(value) => setCourse({ ...course, longDescription: value })} />

          <div className="grid gap-4 md:grid-cols-3">
            <MediaField
              label="Card image URL"
              value={course.imageUrl || ""}
              onChange={(value) => setCourse({ ...course, imageUrl: value })}
              onUpload={(file) => uploadMedia("imageUrl", file)}
              uploading={uploadingMedia === "imageUrl"}
            />
            <MediaField
              label="Banner image URL"
              value={course.bannerImageUrl || ""}
              onChange={(value) => setCourse({ ...course, bannerImageUrl: value })}
              onUpload={(file) => uploadMedia("bannerImageUrl", file)}
              uploading={uploadingMedia === "bannerImageUrl"}
            />
            <MediaField
              label="Link preview image URL"
              value={course.previewImageUrl || ""}
              onChange={(value) => setCourse({ ...course, previewImageUrl: value })}
              onUpload={(file) => uploadMedia("previewImageUrl", file)}
              uploading={uploadingMedia === "previewImageUrl"}
            />
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <label>
              <span className="text-sm font-bold text-slate-700">Level</span>
              <select className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={course.level} onChange={(event) => setCourse({ ...course, level: event.target.value as CourseForm["level"] })}>
                <option value="beginner">Beginner</option>
                <option value="intermediate">Intermediate</option>
                <option value="advanced">Advanced</option>
              </select>
            </label>
            <label>
              <span className="text-sm font-bold text-slate-700">Course type</span>
              <select className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={course.courseType} onChange={(event) => setCourse({ ...course, courseType: event.target.value as CourseForm["courseType"] })}>
                <option value="self-paced">Self-paced</option>
                <option value="live">Live</option>
              </select>
            </label>
            <label className="flex items-center gap-3 pt-7 text-sm font-bold text-slate-700">
              <input type="checkbox" checked={course.published} onChange={(event) => setCourse({ ...course, published: event.target.checked })} />
              Published
            </label>
          </div>

          {course.courseType === "live" && (
            <div className="grid gap-4 md:grid-cols-3">
              <TextArea
                label="Live session dates"
                value={course.sessionDatesText}
                onChange={(value) =>
                  setCourse({ ...course, sessionDatesText: value })
                }
              />
              <Field
                label="Max enrollments"
                type="number"
                value={String(course.maxEnrollments || "")}
                onChange={(value) =>
                  setCourse({
                    ...course,
                    maxEnrollments: Number(value) || undefined,
                  })
                }
              />
              <Field
                label="Live session URL"
                type="url"
                value={course.liveSessionUrl || ""}
                onChange={(value) => setCourse({ ...course, liveSessionUrl: value })}
              />
              <label>
                <span className="text-sm font-bold text-slate-700">Live cadence</span>
                <select
                  className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  value={course.liveSchedule.cadence || "weekly"}
                  onChange={(event) =>
                    setCourse({
                      ...course,
                      liveSchedule: {
                        ...course.liveSchedule,
                        cadence: event.target.value as LiveSchedule["cadence"],
                      },
                    })
                  }
                >
                  <option value="weekly">Weekly</option>
                  <option value="biweekly">Every other week</option>
                  <option value="monthly">Monthly</option>
                  <option value="custom">Custom</option>
                </select>
              </label>
              <label>
                <span className="text-sm font-bold text-slate-700">Live day</span>
                <select
                  className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  value={course.liveSchedule.dayOfWeek || ""}
                  onChange={(event) =>
                    setCourse({
                      ...course,
                      liveSchedule: {
                        ...course.liveSchedule,
                        dayOfWeek: event.target.value,
                      },
                    })
                  }
                >
                  <option value="">Choose day</option>
                  <option value="monday">Monday</option>
                  <option value="tuesday">Tuesday</option>
                  <option value="wednesday">Wednesday</option>
                  <option value="thursday">Thursday</option>
                  <option value="friday">Friday</option>
                  <option value="saturday">Saturday</option>
                  <option value="sunday">Sunday</option>
                </select>
              </label>
              <Field
                label="Live class time"
                type="time"
                value={course.liveSchedule.time || ""}
                onChange={(value) =>
                  setCourse({
                    ...course,
                    liveSchedule: { ...course.liveSchedule, time: value },
                  })
                }
              />
              <Field
                label="Timezone"
                value={course.liveSchedule.timezone || ""}
                onChange={(value) =>
                  setCourse({
                    ...course,
                    liveSchedule: { ...course.liveSchedule, timezone: value },
                  })
                }
              />
              <Field
                label="Live classes"
                type="number"
                value={String(course.liveSchedule.sessionsCount || "")}
                onChange={(value) =>
                  setCourse({
                    ...course,
                    liveSchedule: {
                      ...course.liveSchedule,
                      sessionsCount: Number(value) || undefined,
                    },
                  })
                }
              />
              <TextArea
                label="Learner-facing live schedule note"
                value={course.liveSchedule.description || ""}
                onChange={(value) =>
                  setCourse({
                    ...course,
                    liveSchedule: {
                      ...course.liveSchedule,
                      description: value,
                    },
                  })
                }
              />
              <p className="text-xs leading-5 text-slate-500 md:col-span-3">
                Learners can enroll before the start date, but lessons stay
                locked until that day. Use the live schedule fields to clarify
                how meetings relate to the course lessons.
              </p>
            </div>
          )}
        </EditorPanel>
      )}

      {show("access") && (
      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <div className="mb-5">
          <h2 className="text-lg font-bold text-slate-900">Payments</h2>
          <p className="mt-1 text-sm text-slate-500">
            Choose which checkout options learners can use for this course.
            Paystack is recommended for KES courses and M-Pesa/mobile money.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-4">
          <Field label="Price" type="number" value={String(course.price)} onChange={(value) => setCourse({ ...course, price: Number(value), isFree: Number(value) <= 0 })} />
          <Field label="Currency" value={course.currency} onChange={(value) => setCourse({ ...course, currency: value.toUpperCase() })} />
          <label className="flex items-center gap-3 pt-7 text-sm font-bold text-slate-700">
            <input type="checkbox" checked={course.paymentProviders.includes("stripe")} onChange={(event) => setProvider("stripe", event.target.checked)} />
            Stripe
          </label>
          <label className="flex items-center gap-3 pt-7 text-sm font-bold text-slate-700">
            <input type="checkbox" checked={course.paymentProviders.includes("paystack")} onChange={(event) => setProvider("paystack", event.target.checked)} />
            Paystack
          </label>
        </div>
        {!course.isFree && course.currency.toUpperCase() === "KES" && !course.paymentProviders.includes("paystack") && (
          <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
            This is a KES course without Paystack enabled. Learners will not see
            M-Pesa/mobile money unless Paystack is selected.
          </p>
        )}
        {!course.isFree && course.paymentProviders.length === 0 && (
          <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">
            Paid courses need at least one checkout provider.
          </p>
        )}
        <div className="mt-4 grid gap-4 md:grid-cols-4">
          <label className="flex items-center gap-3 pt-7 text-sm font-bold text-slate-700">
            <input type="checkbox" checked={course.installmentPlan.enabled} onChange={(event) => setCourse({ ...course, installmentPlan: { ...course.installmentPlan, enabled: event.target.checked } })} />
            Lipa mdogo mdogo
          </label>
          <Field label="Installment amount" type="number" value={String(course.installmentPlan.installmentAmount || "")} onChange={(value) => setCourse({ ...course, installmentPlan: { ...course.installmentPlan, installmentAmount: Number(value) || undefined } })} />
          <Field label="Installments" type="number" value={String(course.installmentPlan.installmentCount)} onChange={(value) => setCourse({ ...course, installmentPlan: { ...course.installmentPlan, installmentCount: Number(value) || 4 } })} />
          <label>
            <span className="text-sm font-bold text-slate-700">Access release</span>
            <select
              className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              value={course.installmentPlan.releaseAccess}
              onChange={(event) =>
                setCourse({
                  ...course,
                  installmentPlan: {
                    ...course.installmentPlan,
                    releaseAccess: event.target.value as CourseForm["installmentPlan"]["releaseAccess"],
                  },
                })
              }
            >
              <option value="module_by_module">Module by module</option>
              <option value="full_after_first_payment">Full after first payment</option>
              <option value="full_after_completion">Full after completion</option>
            </select>
          </label>
        </div>
      </section>
      )}

      {show("access") && (
        <AccessProgramEditor
          value={course.accessProgram}
          currency={course.currency}
          onChange={(accessProgram) => setCourse({ ...course, accessProgram })}
        />
      )}

      {show("notifications") && (
      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <div className="mb-5">
          <h2 className="text-lg font-bold text-slate-900">Email notifications</h2>
          <p className="mt-1 text-sm text-slate-500">
            Configure automated CommonLab emails for enrollments and course work.
          </p>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <Toggle
            label="Send enrollment confirmations"
            checked={course.emailSettings.enrollmentEnabled}
            onChange={(checked) =>
              setCourse({
                ...course,
                emailSettings: {
                  ...course.emailSettings,
                  enrollmentEnabled: checked,
                },
              })
            }
          />
          <Toggle
            label="Send new assignment emails"
            checked={course.emailSettings.assignmentCreatedEnabled}
            onChange={(checked) =>
              setCourse({
                ...course,
                emailSettings: {
                  ...course.emailSettings,
                  assignmentCreatedEnabled: checked,
                },
              })
            }
          />
          <Toggle
            label="Send assignment update emails"
            checked={course.emailSettings.assignmentUpdatedEnabled}
            onChange={(checked) =>
              setCourse({
                ...course,
                emailSettings: {
                  ...course.emailSettings,
                  assignmentUpdatedEnabled: checked,
                },
              })
            }
          />
          <Toggle
            label="Allow course update emails"
            checked={course.emailSettings.courseUpdateEnabled}
            onChange={(checked) =>
              setCourse({
                ...course,
                emailSettings: {
                  ...course.emailSettings,
                  courseUpdateEnabled: checked,
                },
              })
            }
          />
          <Toggle
            label="Let course agents manage emails"
            checked={course.emailSettings.agentManaged}
            onChange={(checked) =>
              setCourse({
                ...course,
                emailSettings: {
                  ...course.emailSettings,
                  agentManaged: checked,
                },
              })
            }
          />
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <Field
            label="Reply-to email"
            value={course.emailSettings.replyTo || ""}
            onChange={(value) =>
              setCourse({
                ...course,
                emailSettings: { ...course.emailSettings, replyTo: value },
              })
            }
          />
          <TextArea
            label="Enrollment email intro"
            value={course.emailSettings.customIntro || ""}
            onChange={(value) =>
              setCourse({
                ...course,
                emailSettings: { ...course.emailSettings, customIntro: value },
              })
            }
          />
        </div>
      </section>
      )}

      {show("agents") && (
        <CourseAgentEditor
          courseSlug={slug}
          agents={course.agents}
          onChange={(agents) => setCourse({ ...course, agents })}
        />
      )}

      {isFullEditor && <CourseCollaborators slug={slug} />}

      {show("content") && (
      <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Modules and lessons</h2>
            <p className="mt-1 text-sm text-slate-500">
              Manage the learning path, lesson timing, prompts, and free previews.
            </p>
          </div>
          <button type="button" onClick={() => {
            setCourse({ ...course, modules: [...course.modules, { title: `Module ${course.modules.length + 1}`, lessons: [] }] });
            toast({ title: "Module added", description: "Save content to apply this change.", tone: "info" });
          }} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold">
            Add module
          </button>
        </div>
        {course.modules.map((module, moduleIndex) => (
          <div key={moduleIndex} className="rounded-lg border border-slate-200 p-4">
            <div className="grid gap-4 md:grid-cols-[1fr_auto]">
              <Field label="Module title" value={module.title} onChange={(value) => updateModule(course, setCourse, moduleIndex, { ...module, title: value })} />
              <button
                type="button"
                onClick={() => {
                  setCourse({ ...course, modules: course.modules.filter((_, index) => index !== moduleIndex) });
                  toast({ title: "Module removed", description: "Save content to apply this change.", tone: "info" });
                }}
                className="self-end rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50"
              >
                Remove module
              </button>
            </div>
            <TextArea label="Module description" value={module.description || ""} onChange={(value) => updateModule(course, setCourse, moduleIndex, { ...module, description: value })} />
            <TextArea label="Module assignment prompt" value={module.assignment || ""} onChange={(value) => updateModule(course, setCourse, moduleIndex, { ...module, assignment: value })} />
            <div className="mt-4 max-h-[420px] space-y-3 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-3">
              {module.lessons.map((lesson, lessonIndex) => (
                <div key={lessonIndex} className="grid gap-3 rounded-lg border border-slate-200 bg-white p-3 md:grid-cols-[1fr_120px_auto_auto]">
                  <input aria-label="Lesson title" className="rounded-lg border border-slate-200 px-3 py-2 text-sm" value={lesson.title} onChange={(event) => updateLesson(course, setCourse, moduleIndex, lessonIndex, { ...lesson, title: event.target.value })} />
                  <input aria-label="Lesson duration" className="rounded-lg border border-slate-200 px-3 py-2 text-sm" value={lesson.duration} onChange={(event) => updateLesson(course, setCourse, moduleIndex, lessonIndex, { ...lesson, duration: event.target.value })} />
                  <label className="flex items-center gap-2 text-xs font-bold text-slate-600">
                    <input type="checkbox" checked={Boolean(lesson.isFree)} onChange={(event) => updateLesson(course, setCourse, moduleIndex, lessonIndex, { ...lesson, isFree: event.target.checked })} />
                    Free preview
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      updateModule(course, setCourse, moduleIndex, { ...module, lessons: module.lessons.filter((_, index) => index !== lessonIndex) });
                      toast({ title: "Lesson removed", description: "Save content to apply this change.", tone: "info" });
                    }}
                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50"
                  >
                    Remove
                  </button>
                  <textarea
                    aria-label="Lesson description"
                    placeholder="Lesson notes, video link, document references, or prep instructions"
                    value={lesson.description || ""}
                    onChange={(event) => updateLesson(course, setCourse, moduleIndex, lessonIndex, { ...lesson, description: event.target.value })}
                    className="min-h-20 rounded-lg border border-slate-200 px-3 py-2 text-sm md:col-span-4"
                  />
                  <input
                    aria-label="Lesson asset URL"
                    placeholder="Lesson asset URL"
                    value={lesson.assetUrl || ""}
                    onChange={(event) => updateLesson(course, setCourse, moduleIndex, lessonIndex, { ...lesson, assetUrl: event.target.value })}
                    className="rounded-lg border border-slate-200 px-3 py-2 text-sm md:col-span-2"
                  />
                  <input
                    aria-label="Lesson asset alt text"
                    placeholder="Asset alt text"
                    value={lesson.assetAlt || ""}
                    onChange={(event) => updateLesson(course, setCourse, moduleIndex, lessonIndex, { ...lesson, assetAlt: event.target.value })}
                    className="rounded-lg border border-slate-200 px-3 py-2 text-sm md:col-span-2"
                  />
                </div>
              ))}
              <button type="button" onClick={() => {
                updateModule(course, setCourse, moduleIndex, { ...module, lessons: [...module.lessons, { title: "New lesson", duration: "15" }] });
                toast({ title: "Lesson added", description: "Save content to apply this change.", tone: "info" });
              }} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold">
                Add lesson
              </button>
            </div>
          </div>
        ))}
      </section>
      )}

      {show("skills") && (
        <SkillPackEditor
          skillPack={course.skillPack}
          uploadingMedia={uploadingMedia}
          onChange={(skillPack) => setCourse({ ...course, skillPack })}
          onUpload={(challengeIndex, file) =>
            uploadMedia(`skillPack.${challengeIndex}.assetUrl`, file)
          }
        />
      )}

      <div className="sticky bottom-4 z-10 flex flex-wrap items-center justify-end gap-3">
        <div className="rounded-lg border border-slate-200 bg-white/95 px-3 py-2 text-xs font-bold text-slate-500 shadow-sm backdrop-blur">
          {hasUnsavedChanges
            ? draftSavedAt
              ? `Unsaved changes · local draft ${formatDraftTime(draftSavedAt)}`
              : "Unsaved changes"
            : "All changes saved"}
        </div>
        <button
          disabled={saving || !hasUnsavedChanges}
          className={cn(
            "rounded-lg px-5 py-2.5 text-sm font-bold shadow-lg transition-all disabled:cursor-not-allowed disabled:opacity-50",
            hasUnsavedChanges
              ? "border border-[#A6E45E] bg-[#B8F56D] text-slate-950 shadow-lime-100 hover:-translate-y-0.5"
              : "bg-slate-950 text-white shadow-slate-200"
          )}
        >
          {saving ? "Saving..." : `Save ${sectionLabel.toLowerCase()}`}
        </button>
      </div>
    </form>
  );
}

function getSectionLabel(section: CourseEditorSection) {
  const labels: Record<CourseEditorSection, string> = {
    all: "Course",
    info: "Course info",
    access: "Access programs",
    notifications: "Notifications",
    agents: "Course agents",
    content: "Content",
    skills: "Skill badges",
    collaborators: "Collaborators",
  };
  return labels[section];
}

function hydrateCourse(course: CourseResponse): CourseForm {
  return {
    ...emptyCourse,
    ...course,
    startDate: toDateInputValue(course.startDate),
    nextSessionDate: toDateTimeInputValue(course.nextSessionDate),
    liveSchedule: {
      ...emptyCourse.liveSchedule,
      ...(course.liveSchedule || {}),
    },
    sessionDatesText: Array.isArray(course.sessionDates)
      ? course.sessionDates
          .map((value) => toDateTimeInputValue(value) || toDateInputValue(value))
          .filter(Boolean)
          .join("\n")
      : "",
    tagsText: Array.isArray(course.tags) ? course.tags.join(", ") : "",
    modules: course.modules?.length ? course.modules : emptyCourse.modules,
    skillPack: {
      ...emptyCourse.skillPack,
      ...(course.skillPack || {}),
      challenges: course.skillPack?.challenges || [],
    },
    agents: course.agents?.length ? course.agents : emptyCourse.agents,
    installmentPlan: {
      ...emptyCourse.installmentPlan,
      ...(course.installmentPlan || {}),
    },
    accessProgram: normalizeAccessProgramForm(course.accessProgram),
    emailSettings: {
      ...emptyCourse.emailSettings,
      ...(course.emailSettings || {}),
    },
  };
}

function getCoursePayload(course: CourseForm) {
  return {
    ...course,
    startDate: course.startDate || undefined,
    nextSessionDate: course.nextSessionDate || undefined,
    sessionDates: course.sessionDatesText
      .split(/\n|,/)
      .map((value) => value.trim())
      .filter(Boolean),
    liveSchedule: {
      ...course.liveSchedule,
      description: course.liveSchedule.description?.trim() || undefined,
      timezone: course.liveSchedule.timezone?.trim() || undefined,
      time: course.liveSchedule.time || undefined,
    },
    tags: course.tagsText
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean),
  };
}

function getSectionSnapshot(course: CourseForm, section: CourseEditorSection) {
  const payload = getCoursePayload(course);
  switch (section) {
    case "info":
      return {
        title: payload.title,
        slug: payload.slug,
        tagline: payload.tagline,
        description: payload.description,
        longDescription: payload.longDescription,
        published: payload.published,
        level: payload.level,
        courseType: payload.courseType,
        startDate: payload.startDate,
        nextSessionDate: payload.nextSessionDate,
        sessionDates: payload.sessionDates,
        liveSchedule: payload.liveSchedule,
        maxEnrollments: payload.maxEnrollments,
        liveSessionUrl: payload.liveSessionUrl,
        duration: payload.duration,
        instructor: payload.instructor,
        tags: payload.tags,
        imageUrl: payload.imageUrl,
        bannerImageUrl: payload.bannerImageUrl,
        previewImageUrl: payload.previewImageUrl,
      };
    case "access":
      return {
        price: payload.price,
        currency: payload.currency,
        isFree: payload.isFree,
        paymentProviders: payload.paymentProviders,
        installmentPlan: payload.installmentPlan,
        accessProgram: payload.accessProgram,
      };
    case "notifications":
      return payload.emailSettings;
    case "agents":
      return payload.agents;
    case "content":
      return payload.modules;
    case "skills":
      return payload.skillPack;
    case "collaborators":
      return {};
    case "all":
    default:
      return payload;
  }
}

function stringifySectionSnapshot(course: CourseForm, section: CourseEditorSection) {
  return JSON.stringify(getSectionSnapshot(course, section));
}

function formatDraftTime(value: Date) {
  return value.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function toDateInputValue(value?: string | Date | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function toDateTimeInputValue(value?: string | Date | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 16);
}

function EditorPanel({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-5 rounded-lg border border-slate-200 bg-white p-5">
      <div>
        <h2 className="text-lg font-bold text-slate-900">{title}</h2>
        <p className="mt-1 text-sm text-slate-500">{description}</p>
      </div>
      {children}
    </section>
  );
}

function SkillPackEditor({
  skillPack,
  uploadingMedia,
  onChange,
  onUpload,
}: {
  skillPack: SkillPack;
  uploadingMedia: string | null;
  onChange: (skillPack: SkillPack) => void;
  onUpload: (challengeIndex: number, file?: File) => void;
}) {
  const challenges = skillPack.challenges || [];

  return (
    <EditorPanel
      title="Skill badges"
      description="Create atomic daily challenges that can stand alone on the Skills page or reinforce this course."
    >
      <div className="grid gap-4 md:grid-cols-[auto_1fr_1fr]">
        <Toggle
          label="Publish skill path"
          checked={skillPack.enabled}
          onChange={(enabled) => onChange({ ...skillPack, enabled })}
        />
        <Field
          label="Skill path title"
          value={skillPack.title || ""}
          onChange={(title) => onChange({ ...skillPack, title })}
        />
        <Field
          label="Short subtitle"
          value={skillPack.subtitle || ""}
          onChange={(subtitle) => onChange({ ...skillPack, subtitle })}
        />
      </div>
      <TextArea
        label="Learner promise"
        value={skillPack.learnerPromise || ""}
        onChange={(learnerPromise) => onChange({ ...skillPack, learnerPromise })}
      />

      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-black text-slate-950">Daily challenges</h3>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            A completed full path counts as one earned skill.
          </p>
        </div>
        <button
          type="button"
          onClick={() =>
            onChange({
              ...skillPack,
              challenges: [...challenges, createSkillChallenge(challenges.length)],
            })
          }
          className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold hover:bg-slate-50"
        >
          Add challenge
        </button>
      </div>

      <div className="space-y-4">
        {challenges.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 p-5 text-sm leading-6 text-slate-600">
            Add the first daily challenge to make this skill path appear once the
            course is published.
          </div>
        ) : null}

        {challenges.map((challenge, challengeIndex) => (
          <div key={challenge.id || challengeIndex} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-slate-500">
                  Day {challengeIndex + 1}
                </p>
                <h4 className="mt-1 text-base font-black text-slate-950">
                  {challenge.title || "Untitled challenge"}
                </h4>
              </div>
              <button
                type="button"
                onClick={() =>
                  onChange({
                    ...skillPack,
                    challenges: challenges.filter((_, index) => index !== challengeIndex),
                  })
                }
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 hover:bg-white"
              >
                Remove
              </button>
            </div>

            <div className="grid gap-3 md:grid-cols-4">
              <Field
                label="Title"
                value={challenge.title}
                onChange={(title) =>
                  onChange(updateSkillPackChallenge(skillPack, challengeIndex, { title }))
                }
              />
              <Field
                label="Short title"
                value={challenge.shortTitle || ""}
                onChange={(shortTitle) =>
                  onChange(updateSkillPackChallenge(skillPack, challengeIndex, { shortTitle }))
                }
              />
              <Field
                label="Minutes"
                type="number"
                value={String(challenge.minutes || 5)}
                onChange={(minutes) =>
                  onChange(
                    updateSkillPackChallenge(skillPack, challengeIndex, {
                      minutes: Number(minutes) || 5,
                    })
                  )
                }
              />
              <Field
                label="Points"
                type="number"
                value={String(challenge.points || 50)}
                onChange={(points) =>
                  onChange(
                    updateSkillPackChallenge(skillPack, challengeIndex, {
                      points: Number(points) || 50,
                    })
                  )
                }
              />
            </div>

            <div className="mt-3 grid gap-3 md:grid-cols-[1fr_1fr_120px]">
              <MediaField
                label="Challenge image URL"
                value={challenge.assetUrl || ""}
                onChange={(assetUrl) =>
                  onChange(updateSkillPackChallenge(skillPack, challengeIndex, { assetUrl }))
                }
                onUpload={(file) => onUpload(challengeIndex, file)}
                uploading={uploadingMedia === `skillPack.${challengeIndex}.assetUrl`}
              />
              <Field
                label="Image alt text"
                value={challenge.assetAlt || ""}
                onChange={(assetAlt) =>
                  onChange(updateSkillPackChallenge(skillPack, challengeIndex, { assetAlt }))
                }
              />
              <Field
                label="Accent"
                value={challenge.accentColor || "#B8F56D"}
                onChange={(accentColor) =>
                  onChange(updateSkillPackChallenge(skillPack, challengeIndex, { accentColor }))
                }
              />
            </div>

            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <TextArea
                label="Hook"
                value={challenge.hook || ""}
                onChange={(hook) =>
                  onChange(updateSkillPackChallenge(skillPack, challengeIndex, { hook }))
                }
              />
              <TextArea
                label="Key ideas"
                value={(challenge.keyIdeas || []).join("\n")}
                onChange={(value) =>
                  onChange(
                    updateSkillPackChallenge(skillPack, challengeIndex, {
                      keyIdeas: value
                        .split(/\n|,/)
                        .map((item) => item.trim())
                        .filter(Boolean),
                    })
                  )
                }
              />
            </div>
            <TextArea
              label="Explanatory lesson"
              value={challenge.lesson}
              onChange={(lesson) =>
                onChange(updateSkillPackChallenge(skillPack, challengeIndex, { lesson }))
              }
            />

            <div className="mt-4 rounded-lg border border-slate-200 bg-white p-3">
              <div className="mb-3 flex items-center justify-between gap-3">
                <p className="text-sm font-black text-slate-950">Quiz questions</p>
                <button
                  type="button"
                  onClick={() =>
                    onChange(
                      updateSkillPackChallenge(skillPack, challengeIndex, {
                        questions: [
                          ...(challenge.questions || []),
                          createSkillQuestion(challenge.questions?.length || 0),
                        ],
                      })
                    )
                  }
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold hover:bg-slate-50"
                >
                  Add question
                </button>
              </div>
              <div className="space-y-3">
                {(challenge.questions || []).map((question, questionIndex) => (
                  <QuestionEditor
                    key={question.id || questionIndex}
                    question={question}
                    onChange={(nextQuestion) =>
                      onChange(
                        updateSkillPackChallenge(skillPack, challengeIndex, {
                          questions: updateQuestionList(
                            challenge.questions || [],
                            questionIndex,
                            nextQuestion
                          ),
                        })
                      )
                    }
                    onRemove={() =>
                      onChange(
                        updateSkillPackChallenge(skillPack, challengeIndex, {
                          questions: (challenge.questions || []).filter(
                            (_, index) => index !== questionIndex
                          ),
                        })
                      )
                    }
                  />
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </EditorPanel>
  );
}

function QuestionEditor({
  question,
  onChange,
  onRemove,
}: {
  question: SkillQuestion;
  onChange: (question: SkillQuestion) => void;
  onRemove: () => void;
}) {
  const options = question.options.length ? question.options : ["", ""];

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="grid gap-3 md:grid-cols-[1fr_auto]">
        <Field
          label="Question"
          value={question.prompt}
          onChange={(prompt) => onChange({ ...question, prompt })}
        />
        <button
          type="button"
          onClick={onRemove}
          className="self-end rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50"
        >
          Remove
        </button>
      </div>
      <div className="mt-3 grid gap-2 md:grid-cols-2">
        {options.map((option, optionIndex) => (
          <label key={optionIndex} className="block">
            <span className="text-xs font-bold text-slate-600">
              Option {optionIndex + 1}
            </span>
            <div className="mt-1 flex gap-2">
              <input
                value={option}
                onChange={(event) => {
                  const nextOptions = [...options];
                  nextOptions[optionIndex] = event.target.value;
                  onChange({ ...question, options: nextOptions });
                }}
                className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
              />
              <input
                type="radio"
                checked={question.answerIndex === optionIndex}
                onChange={() => onChange({ ...question, answerIndex: optionIndex })}
                aria-label={`Mark option ${optionIndex + 1} correct`}
              />
            </div>
          </label>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onChange({ ...question, options: [...options, ""] })}
          className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold hover:bg-slate-50"
        >
          Add option
        </button>
        {options.length > 2 ? (
          <button
            type="button"
            onClick={() =>
              onChange({
                ...question,
                options: options.slice(0, -1),
                answerIndex: Math.min(question.answerIndex, options.length - 2),
              })
            }
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold hover:bg-slate-50"
          >
            Remove option
          </button>
        ) : null}
      </div>
      <TextArea
        label="Explanation"
        value={question.explanation || ""}
        onChange={(explanation) => onChange({ ...question, explanation })}
      />
    </div>
  );
}

function createSkillChallenge(index: number): SkillChallenge {
  return {
    id: `day-${index + 1}`,
    day: index + 1,
    title: `Day ${index + 1}`,
    shortTitle: "",
    minutes: 6,
    points: 60,
    streakBoost: 1,
    assetUrl: "",
    assetAlt: "",
    accentColor: "#B8F56D",
    audioCue: "focus",
    hook: "",
    lesson: "",
    keyIdeas: [],
    questions: [createSkillQuestion(0)],
  };
}

function createSkillQuestion(index: number): SkillQuestion {
  return {
    id: `q${index + 1}`,
    prompt: "",
    options: ["", ""],
    answerIndex: 0,
    explanation: "",
  };
}

function updateSkillPackChallenge(
  skillPack: SkillPack,
  challengeIndex: number,
  patch: Partial<SkillChallenge>
): SkillPack {
  const challenges = [...(skillPack.challenges || [])];
  challenges[challengeIndex] = {
    ...challenges[challengeIndex],
    ...patch,
    day: challengeIndex + 1,
  };
  return { ...skillPack, challenges };
}

function updateSkillChallengeValue(
  course: CourseForm,
  challengeIndex: number,
  patch: Partial<SkillChallenge>
): CourseForm {
  return {
    ...course,
    skillPack: updateSkillPackChallenge(course.skillPack, challengeIndex, patch),
  };
}

function updateQuestionList(
  questions: SkillQuestion[],
  questionIndex: number,
  question: SkillQuestion
) {
  const nextQuestions = [...questions];
  nextQuestions[questionIndex] = question;
  return nextQuestions;
}

function updateModule(course: CourseForm, setCourse: (course: CourseForm) => void, index: number, module: Module) {
  const modules = [...course.modules];
  modules[index] = module;
  setCourse({ ...course, modules });
}

function updateLesson(course: CourseForm, setCourse: (course: CourseForm) => void, moduleIndex: number, lessonIndex: number, lesson: Lesson) {
  const modules = [...course.modules];
  const lessons = [...modules[moduleIndex].lessons];
  lessons[lessonIndex] = lesson;
  modules[moduleIndex] = { ...modules[moduleIndex], lessons };
  setCourse({ ...course, modules });
}

function Field({ label, value, onChange, required, type = "text" }: { label: string; value: string; onChange: (value: string) => void; required?: boolean; type?: string }) {
  return (
    <label className="block">
      <span className="text-sm font-bold text-slate-700">{label}</span>
      <input type={type} required={required} value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400" />
    </label>
  );
}

function MediaField({
  label,
  value,
  onChange,
  onUpload,
  uploading,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onUpload: (file?: File) => void;
  uploading: boolean;
}) {
  return (
    <label className="block">
      <span className="text-sm font-bold text-slate-700">{label}</span>
      <input
        type="url"
        value={value}
        placeholder="https://..."
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
      />
      <span className="mt-2 block">
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          disabled={uploading}
          onChange={(event) => onUpload(event.target.files?.[0])}
          className="w-full text-xs text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-slate-950 file:px-3 file:py-2 file:text-xs file:font-bold file:text-white disabled:opacity-50"
        />
      </span>
      <span className="mt-1 block text-xs leading-5 text-slate-500">
        {uploading
          ? "Uploading..."
          : "Upload or paste a public 1200x630 image for best sharing results."}
      </span>
      {value ? (
        <div className="mt-3 aspect-[1200/630] overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={value} alt="" className="h-full w-full object-cover" />
        </div>
      ) : null}
    </label>
  );
}

function TextArea({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="text-sm font-bold text-slate-700">{label}</span>
      <textarea value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 min-h-24 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400" />
    </label>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex min-h-12 items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold text-slate-700">
      <span>{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
    </label>
  );
}

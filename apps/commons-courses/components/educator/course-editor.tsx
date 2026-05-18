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
import { cn } from "@/lib/utils";
import type { CourseAgentConfig } from "@/types/course-agent";

type Lesson = {
  title: string;
  duration: string;
  description?: string;
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
  agents: CourseAgentConfig[];
};

type CourseResponse = Partial<CourseForm> & {
  tags?: string[];
};

export type CourseEditorSection =
  | "all"
  | "info"
  | "access"
  | "notifications"
  | "agents"
  | "content"
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
    field: "imageUrl" | "bannerImageUrl" | "previewImageUrl",
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
    setCourse((current) => ({ ...current, [field]: data.url }));
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
    collaborators: "Collaborators",
  };
  return labels[section];
}

function hydrateCourse(course: CourseResponse): CourseForm {
  return {
    ...emptyCourse,
    ...course,
    tagsText: Array.isArray(course.tags) ? course.tags.join(", ") : "",
    modules: course.modules?.length ? course.modules : emptyCourse.modules,
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

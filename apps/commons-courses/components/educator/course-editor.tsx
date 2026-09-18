"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { CourseCollaborators } from "@/components/educator/course-collaborators";
import { normalizeAccessProgramForm } from "@/components/educator/access-program-types";
import { useToast } from "@/components/toast-provider";
import { Button } from "@/components/ui/button";
import { Field, FieldGrid, Input, Select, Textarea } from "@/components/ui/field";
import { Card } from "@/components/ui/surface";
import { SaveBar } from "@/components/ui/save-bar";
import { defaultCourseAgents } from "@/lib/course-agent-defaults";
import { defaultCourseTheme } from "@/lib/course-theme";
import type { LiveSchedule } from "@/lib/course-schedule";
import type { LabWorkspaceRecord } from "@/types/lab-workspace";
import { AgentsView } from "@/components/educator/course-editor-views/agents-view";
import { DetailsView } from "@/components/educator/course-editor-views/details-view";
import { ModulesView } from "@/components/educator/course-editor-views/modules-view";
import { NotificationsView } from "@/components/educator/course-editor-views/notifications-view";
import { SalesView } from "@/components/educator/course-editor-views/sales-view";
import { SkillsView } from "@/components/educator/course-editor-views/skills-view";
import type {
  CourseForm,
  CourseViewProps,
  UploadField,
} from "@/components/educator/course-editor-views/types";

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
  catalogVisibility: "public",
  theme: defaultCourseTheme,
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
    branding: {
      enabled: false,
      senderName: "",
      logoUrl: "",
      accentColor: "#020617",
      footerText: "",
    },
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
    coverUrl: "",
    learnerPromise: "",
    challenges: [],
  },
  skillPacks: [],
};

/**
 * Loads one course, keeps the working copy, and saves it. Each section of
 * the course console renders one focused view of that working copy.
 */
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
  const [loaded, setLoaded] = useState(!slug);
  const [savedSectionSnapshot, setSavedSectionSnapshot] = useState(() =>
    stringifySectionSnapshot(emptyCourse, section)
  );
  const [saving, setSaving] = useState(false);
  const [uploadingMedia, setUploadingMedia] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [draftSavedAt, setDraftSavedAt] = useState<Date | null>(null);
  const [labWorkspaces, setLabWorkspaces] = useState<LabWorkspaceRecord[]>([]);
  const [customEmailBranding, setCustomEmailBranding] = useState(false);
  const sectionLabel = getSectionLabel(section);
  const currentSectionSnapshot = useMemo(
    () => stringifySectionSnapshot(course, section),
    [course, section]
  );
  const hasUnsavedChanges = currentSectionSnapshot !== savedSectionSnapshot;

  useEffect(() => {
    if (!slug) {
      void fetch("/api/educator/profile")
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          const profile = data?.profile;
          setCustomEmailBranding(
            profile?.status === "active" &&
              ["starter", "growth", "institution"].includes(profile?.plan),
          );
        });
      return;
    }
    fetch(`/api/educator/courses/${slug}`)
      .then((res) => res.json())
      .then((data) => {
        const c = data.course;
        if (!c) return;
        setCustomEmailBranding(Boolean(data.entitlements?.customEmailBranding));
        const nextCourse = hydrateCourse(c);
        setCourse(nextCourse);
        setSavedSectionSnapshot(stringifySectionSnapshot(nextCourse, section));
      })
      .catch(() => setError("Could not load course."))
      .finally(() => setLoaded(true));
  }, [section, slug]);

  useEffect(() => {
    if (!slug) return;
    void fetch(`/api/educator/courses/${slug}/lab-workspaces`, { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((body) => setLabWorkspaces(body?.workspaces || []));
  }, [slug]);

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

  // Warn before leaving with unsaved edits.
  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [hasUnsavedChanges]);

  async function onSubmit(event?: FormEvent) {
    event?.preventDefault();
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
    const data = await readJsonResponse<{ error?: string; course?: CourseResponse }>(res);
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
      title: slug ? `${sectionLabel} saved` : "Course created",
      description: slug ? "Your changes are live for this course." : "Keep building from the course overview.",
    });
    if (slug) {
      const savedSlug = data.course?.slug || slug;
      if (savedSlug !== slug) {
        router.push(pathname.replace(`/educator/courses/${slug}`, `/educator/courses/${savedSlug}`));
        return;
      }
      router.refresh();
      return;
    }
    if (data.course?.slug) {
      router.push(`/educator/courses/${data.course.slug}`);
      router.refresh();
      return;
    }
    router.push("/educator/courses");
  }

  async function uploadMedia(field: UploadField, file?: File) {
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
    setCourse((current) => applyUploadedUrl(current, field, data.url));
    toast({
      tone: "success",
      title: "Image uploaded",
      description: "Save to publish this image.",
    });
  }

  if (section === "collaborators") {
    return <CourseCollaborators slug={slug} />;
  }

  if (!slug) {
    return (
      <NewCourseForm
        course={course}
        setCourse={setCourse}
        saving={saving}
        error={error}
        onSubmit={onSubmit}
      />
    );
  }

  const viewProps: CourseViewProps = { course, setCourse, uploadingMedia, uploadMedia };
  const notice = (title: string) =>
    toast({ title, description: "Save to apply this change.", tone: "info" });

  return (
    <form onSubmit={onSubmit}>
      {error ? <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
      {!loaded ? (
        <div className="h-64 animate-pulse rounded-xl border border-border bg-white" />
      ) : section === "info" ? (
        <DetailsView {...viewProps} />
      ) : section === "content" ? (
        <ModulesView course={course} setCourse={setCourse} labWorkspaces={labWorkspaces} onNotice={notice} />
      ) : section === "skills" ? (
        <SkillsView {...viewProps} onNotice={notice} />
      ) : section === "access" ? (
        <SalesView course={course} setCourse={setCourse} />
      ) : section === "notifications" ? (
        <NotificationsView {...viewProps} customEmailBranding={customEmailBranding} />
      ) : section === "agents" ? (
        <AgentsView course={course} setCourse={setCourse} courseSlug={slug} />
      ) : null}
      <SaveBar
        type="submit"
        dirty={hasUnsavedChanges}
        saving={saving}
        status={
          hasUnsavedChanges && draftSavedAt
            ? `Unsaved · draft kept ${formatDraftTime(draftSavedAt)}`
            : undefined
        }
      />
    </form>
  );
}

/** Creating a course only asks for the essentials; everything else lives in the course console. */
function NewCourseForm({
  course,
  setCourse,
  saving,
  error,
  onSubmit,
}: {
  course: CourseForm;
  setCourse: CourseViewProps["setCourse"];
  saving: boolean;
  error: string;
  onSubmit: (event?: FormEvent) => void;
}) {
  const patch = (value: Partial<CourseForm>) => setCourse((current) => ({ ...current, ...value }));
  return (
    <form onSubmit={onSubmit}>
      <Card className="space-y-5">
        <Field label="Course title">
          <Input
            required
            autoFocus
            placeholder="e.g. AI for everyday work"
            value={course.title}
            onChange={(event) => patch({ title: event.target.value })}
          />
        </Field>
        <Field label="Tagline" info="One line that says what learners will be able to do.">
          <Input required value={course.tagline} onChange={(event) => patch({ tagline: event.target.value })} />
        </Field>
        <Field label="Short description">
          <Textarea
            required
            rows={3}
            value={course.description}
            onChange={(event) => patch({ description: event.target.value })}
          />
        </Field>
        <FieldGrid>
          <Field label="Format">
            <Select
              value={course.courseType}
              onChange={(event) => patch({ courseType: event.target.value as CourseForm["courseType"] })}
            >
              <option value="self-paced">Self-paced</option>
              <option value="live">Live</option>
            </Select>
          </Field>
          <Field label="Level">
            <Select
              value={course.level}
              onChange={(event) => patch({ level: event.target.value as CourseForm["level"] })}
            >
              <option value="beginner">Beginner</option>
              <option value="intermediate">Intermediate</option>
              <option value="advanced">Advanced</option>
            </Select>
          </Field>
        </FieldGrid>
        {error ? <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
      </Card>
      <div className="mt-5 flex justify-end">
        <Button type="submit" variant="primary" loading={saving} icon={ArrowRight}>
          Create course
        </Button>
      </div>
    </form>
  );
}

function applyUploadedUrl(course: CourseForm, field: UploadField, url: string): CourseForm {
  if (field === "emailSettings.logoUrl") {
    return {
      ...course,
      emailSettings: {
        ...course.emailSettings,
        branding: { ...course.emailSettings.branding, logoUrl: url },
      },
    };
  }
  if (field === "skillPack.coverUrl") {
    return { ...course, skillPack: { ...course.skillPack, coverUrl: url } };
  }
  if (field.startsWith("skillPack.")) {
    const challengeIndex = Number(field.split(".")[1]);
    const challenges = [...(course.skillPack.challenges || [])];
    challenges[challengeIndex] = { ...challenges[challengeIndex], assetUrl: url, day: challengeIndex + 1 };
    return { ...course, skillPack: { ...course.skillPack, challenges } };
  }
  if (field.startsWith("skillPacks.")) {
    const [, packIndexText, coverOrChallenge, maybeField] = field.split(".");
    const packIndex = Number(packIndexText);
    const skillPacks = [...course.skillPacks];
    const pack = skillPacks[packIndex];
    if (!pack) return course;
    if (coverOrChallenge === "coverUrl") {
      skillPacks[packIndex] = { ...pack, coverUrl: url };
    } else if (maybeField === "assetUrl") {
      const challengeIndex = Number(coverOrChallenge);
      const challenges = [...(pack.challenges || [])];
      challenges[challengeIndex] = { ...challenges[challengeIndex], assetUrl: url, day: challengeIndex + 1 };
      skillPacks[packIndex] = { ...pack, challenges };
    }
    return { ...course, skillPacks };
  }
  return { ...course, [field]: url };
}

async function readJsonResponse<T>(res: Response): Promise<T> {
  return res.json().catch(() => ({} as T));
}

function getSectionLabel(section: CourseEditorSection) {
  const labels: Record<CourseEditorSection, string> = {
    all: "Course",
    info: "Details",
    access: "Sales",
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
    skillPacks: Array.isArray(course.skillPacks) ? course.skillPacks : [],
    agents: course.agents?.length ? course.agents : emptyCourse.agents,
    installmentPlan: {
      ...emptyCourse.installmentPlan,
      ...(course.installmentPlan || {}),
    },
    accessProgram: normalizeAccessProgramForm(course.accessProgram),
    emailSettings: {
      ...emptyCourse.emailSettings,
      ...(course.emailSettings || {}),
      branding: {
        ...emptyCourse.emailSettings.branding,
        ...(course.emailSettings?.branding || {}),
      },
    },
    theme: { ...defaultCourseTheme, ...(course.theme || {}) },
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
        catalogVisibility: payload.catalogVisibility,
        theme: payload.theme,
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
      return {
        skillPack: payload.skillPack,
        skillPacks: payload.skillPacks,
      };
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


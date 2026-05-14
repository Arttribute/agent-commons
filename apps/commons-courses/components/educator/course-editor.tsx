"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

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
  modules: Module[];
};

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
  paymentProviders: ["stripe"],
  installmentPlan: {
    enabled: false,
    installmentCount: 4,
    releaseAccess: "module_by_module",
  },
  modules: [
    {
      title: "Module 1",
      lessons: [{ title: "Lesson 1", duration: "15", isFree: true }],
    },
  ],
};

export function CourseEditor({ slug }: { slug?: string }) {
  const router = useRouter();
  const [course, setCourse] = useState<CourseForm>(emptyCourse);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!slug) return;
    fetch(`/api/educator/courses/${slug}`)
      .then((res) => res.json())
      .then((data) => {
        const c = data.course;
        if (!c) return;
        setCourse({
          ...emptyCourse,
          ...c,
          tagsText: Array.isArray(c.tags) ? c.tags.join(", ") : "",
          modules: c.modules?.length ? c.modules : emptyCourse.modules,
          installmentPlan: {
            ...emptyCourse.installmentPlan,
            ...(c.installmentPlan || {}),
          },
        });
      })
      .catch(() => setError("Could not load course."));
  }, [slug]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    const payload = {
      ...course,
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

  return (
    <form onSubmit={onSubmit} className="space-y-8">
      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      <section className="grid gap-4 md:grid-cols-2">
        <Field label="Title" value={course.title} required onChange={(value) => setCourse({ ...course, title: value })} />
        <Field label="Slug" value={course.slug || ""} onChange={(value) => setCourse({ ...course, slug: value })} />
        <Field label="Tagline" value={course.tagline} required onChange={(value) => setCourse({ ...course, tagline: value })} />
        <Field label="Instructor" value={course.instructor} onChange={(value) => setCourse({ ...course, instructor: value })} />
        <Field label="Duration" value={course.duration} onChange={(value) => setCourse({ ...course, duration: value })} />
        <Field label="Tags" value={course.tagsText} onChange={(value) => setCourse({ ...course, tagsText: value })} />
      </section>

      <TextArea label="Short description" value={course.description} onChange={(value) => setCourse({ ...course, description: value })} />
      <TextArea label="Long description" value={course.longDescription} onChange={(value) => setCourse({ ...course, longDescription: value })} />

      <section className="grid gap-4 md:grid-cols-3">
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
      </section>

      <section className="rounded-xl border border-slate-200 p-5">
        <h2 className="mb-4 text-lg font-bold text-slate-900">Payments</h2>
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
        <div className="mt-4 grid gap-4 md:grid-cols-4">
          <label className="flex items-center gap-3 pt-7 text-sm font-bold text-slate-700">
            <input type="checkbox" checked={course.installmentPlan.enabled} onChange={(event) => setCourse({ ...course, installmentPlan: { ...course.installmentPlan, enabled: event.target.checked } })} />
            Lipa mdogo mdogo
          </label>
          <Field label="Installment amount" type="number" value={String(course.installmentPlan.installmentAmount || "")} onChange={(value) => setCourse({ ...course, installmentPlan: { ...course.installmentPlan, installmentAmount: Number(value) || undefined } })} />
          <Field label="Installments" type="number" value={String(course.installmentPlan.installmentCount)} onChange={(value) => setCourse({ ...course, installmentPlan: { ...course.installmentPlan, installmentCount: Number(value) || 4 } })} />
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900">Modules and lessons</h2>
          <button type="button" onClick={() => setCourse({ ...course, modules: [...course.modules, { title: `Module ${course.modules.length + 1}`, lessons: [] }] })} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold">
            Add module
          </button>
        </div>
        {course.modules.map((module, moduleIndex) => (
          <div key={moduleIndex} className="rounded-xl border border-slate-200 p-4">
            <Field label="Module title" value={module.title} onChange={(value) => updateModule(course, setCourse, moduleIndex, { ...module, title: value })} />
            <TextArea label="Module assignment prompt" value={module.assignment || ""} onChange={(value) => updateModule(course, setCourse, moduleIndex, { ...module, assignment: value })} />
            <div className="mt-4 space-y-3">
              {module.lessons.map((lesson, lessonIndex) => (
                <div key={lessonIndex} className="grid gap-3 rounded-lg bg-slate-50 p-3 md:grid-cols-[1fr_100px_auto]">
                  <input className="rounded-lg border border-slate-200 px-3 py-2 text-sm" value={lesson.title} onChange={(event) => updateLesson(course, setCourse, moduleIndex, lessonIndex, { ...lesson, title: event.target.value })} />
                  <input className="rounded-lg border border-slate-200 px-3 py-2 text-sm" value={lesson.duration} onChange={(event) => updateLesson(course, setCourse, moduleIndex, lessonIndex, { ...lesson, duration: event.target.value })} />
                  <label className="flex items-center gap-2 text-xs font-bold text-slate-600">
                    <input type="checkbox" checked={Boolean(lesson.isFree)} onChange={(event) => updateLesson(course, setCourse, moduleIndex, lessonIndex, { ...lesson, isFree: event.target.checked })} />
                    Free preview
                  </label>
                </div>
              ))}
              <button type="button" onClick={() => updateModule(course, setCourse, moduleIndex, { ...module, lessons: [...module.lessons, { title: "New lesson", duration: "15" }] })} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold">
                Add lesson
              </button>
            </div>
          </div>
        ))}
      </section>

      <button disabled={saving} className="rounded-lg bg-slate-950 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50">
        {saving ? "Saving..." : "Save course"}
      </button>
    </form>
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

function TextArea({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="text-sm font-bold text-slate-700">{label}</span>
      <textarea value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 min-h-24 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400" />
    </label>
  );
}

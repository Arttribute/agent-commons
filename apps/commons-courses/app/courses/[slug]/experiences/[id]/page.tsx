"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { ExperiencePlayer } from "@/components/experiences/experience-player";
import type { ExperienceDocument } from "@/types/experience";

type ExperiencePayload = {
  id: string;
  courseSlug: string;
  courseTitle: string;
  title: string;
  description: string;
  version: number;
  document: ExperienceDocument;
};

export default function LearnerExperiencePage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = use(params);
  const [experience, setExperience] = useState<ExperiencePayload | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`/api/courses/${slug}/experiences/${id}`)
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Experience unavailable.");
        return data.experience as ExperiencePayload;
      })
      .then(setExperience)
      .catch((reason) =>
        setError(
          reason instanceof Error ? reason.message : "Experience unavailable.",
        ),
      );
  }, [id, slug]);

  if (error) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-slate-950 px-6 text-center text-white">
        <div>
          <h1 className="text-2xl font-bold">This experience is unavailable</h1>
          <p className="mt-2 text-sm text-white/55">{error}</p>
          <Link
            href={`/courses/${slug}`}
            className="mt-6 inline-flex rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-slate-950"
          >
            Back to course
          </Link>
        </div>
      </main>
    );
  }
  if (!experience) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-[#091421] text-white">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Loading experience…
      </main>
    );
  }
  return (
    <main className="min-h-dvh bg-[#091421]">
      <ExperiencePlayer
        document={experience.document}
        courseSlug={slug}
        experienceId={id}
      />
    </main>
  );
}

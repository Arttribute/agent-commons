"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

export type CourseDetailSection = { id: string; label: string; content: ReactNode };

/**
 * One course section at a time. The tab bar sticks under the site nav, and
 * the section id is mirrored in the URL hash so links like #curriculum work.
 */
export function CourseDetailTabs({ sections }: { sections: CourseDetailSection[] }) {
  const [active, setActive] = useState(sections[0]?.id || "");

  useEffect(() => {
    const fromHash = () => {
      const id = window.location.hash.replace("#", "");
      if (sections.some((section) => section.id === id)) setActive(id);
    };
    const timer = window.setTimeout(fromHash, 0);
    window.addEventListener("hashchange", fromHash);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("hashchange", fromHash);
    };
  }, [sections]);

  const current = sections.find((section) => section.id === active) || sections[0];

  return (
    <>
      <nav aria-label="Course sections" className="sticky top-16 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center gap-1 overflow-x-auto px-4 sm:px-6 lg:px-8">
          {sections.map((section) => (
            <button
              key={section.id}
              type="button"
              onClick={() => {
                setActive(section.id);
                window.history.replaceState(null, "", `#${section.id}`);
              }}
              aria-current={section.id === current?.id ? "page" : undefined}
              className={cn(
                "relative flex h-12 shrink-0 items-center px-3 text-sm transition-colors",
                section.id === current?.id
                  ? "font-medium text-slate-950 after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:bg-slate-950"
                  : "text-slate-500 hover:text-slate-950",
              )}
            >
              {section.label}
            </button>
          ))}
          <a
            href="#enroll"
            onClick={(event) => {
              event.preventDefault();
              document.getElementById("enroll")?.scrollIntoView({ behavior: "smooth", block: "start" });
            }}
            className="ml-auto hidden h-8 shrink-0 items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 text-sm font-medium text-white transition-colors hover:bg-slate-800 sm:flex"
          >
            Enroll <ArrowRight className="h-4 w-4" />
          </a>
        </div>
      </nav>
      <div key={current?.id} className="ui-fade-in">
        {current?.content}
      </div>
    </>
  );
}

import Link from "next/link";
import { FlaskConical } from "lucide-react";
import { Nav } from "@/components/nav";
import type { LegalDocument } from "./legal-content";

export function LegalPage({
  document,
  current,
}: {
  document: LegalDocument;
  current: "privacy" | "terms";
}) {
  return (
    <div className="min-h-screen bg-white">
      <Nav />

      <main className="mx-auto max-w-3xl px-6 pb-24 pt-28 lg:px-8">
        <div className="mb-12">
          <p className="mb-3 text-xs uppercase tracking-[0.2em] text-slate-400">
            Legal
          </p>
          <h1 className="mb-3 text-4xl font-bold text-slate-900">
            {document.title}
          </h1>
          <p className="max-w-2xl text-sm leading-6 text-slate-500">
            {document.description}
          </p>
          <p className="mt-4 text-sm text-slate-400">
            Effective date: {document.effectiveDate}
          </p>
        </div>

        <div className="space-y-5 text-base leading-relaxed text-slate-600">
          {document.intro.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </div>

        <div className="mt-12 space-y-10">
          {document.sections.map((section) => (
            <section key={section.title}>
              <h2 className="mb-3 text-base font-bold text-slate-900">
                {section.title}
              </h2>
              <div className="space-y-3 text-sm leading-relaxed text-slate-600">
                {section.body?.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
                {section.bullets ? (
                  <ul className="list-disc space-y-2 pl-5">
                    {section.bullets.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </section>
          ))}
        </div>
      </main>

      <footer className="flex flex-col items-center justify-between gap-4 border-t border-slate-200 bg-white px-6 py-8 text-xs text-slate-400 sm:flex-row lg:px-12">
        <div className="flex items-center gap-2.5">
          <div className="flex h-5 w-5 items-center justify-center rounded bg-slate-900">
            <FlaskConical className="h-3 w-3 text-white" />
          </div>
          <span>© 2026 CommonLab</span>
        </div>
        <div className="flex gap-6">
          <Link href="/courses" className="transition-colors hover:text-slate-700">
            Courses
          </Link>
          <Link
            href="/privacy"
            className={current === "privacy" ? "text-slate-700" : "transition-colors hover:text-slate-700"}
          >
            Privacy
          </Link>
          <Link
            href="/terms"
            className={current === "terms" ? "text-slate-700" : "transition-colors hover:text-slate-700"}
          >
            Terms
          </Link>
        </div>
      </footer>
    </div>
  );
}

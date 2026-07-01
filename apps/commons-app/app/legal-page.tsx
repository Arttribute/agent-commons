import Link from "next/link";
import AppBar from "@/components/layout/app-bar";
import type { LegalDocument } from "./legal-content";

export function LegalPage({
  document,
  current,
}: {
  document: LegalDocument;
  current: "privacy" | "terms";
}) {
  return (
    <div className="h-screen overflow-y-auto bg-background text-foreground">
      <AppBar />
      <main className="mx-auto max-w-4xl px-6 pb-24 pt-28 lg:px-8">
        <div className="mb-10 border-b border-border pb-8">
          <p className="mb-3 text-xs uppercase tracking-[0.2em] text-muted-foreground">
            Legal
          </p>
          <h1 className="text-4xl font-bold tracking-tight">{document.title}</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
            {document.description}
          </p>
          <p className="mt-4 text-xs text-muted-foreground">
            Effective date: {document.effectiveDate}
          </p>
        </div>

        <div className="space-y-5 text-sm leading-7 text-muted-foreground">
          {document.intro.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </div>

        <div className="mt-12 space-y-10">
          {document.sections.map((section) => (
            <section key={section.title}>
              <h2 className="mb-3 text-lg font-semibold text-foreground">
                {section.title}
              </h2>
              <div className="space-y-3 text-sm leading-7 text-muted-foreground">
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

      <footer className="border-t border-border px-6 py-8 text-xs text-muted-foreground lg:px-12">
        <div className="mx-auto flex max-w-4xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <span>© 2026 Agent Commons</span>
          <div className="flex gap-6">
            <Link
              href="/privacy"
              className={current === "privacy" ? "text-foreground" : "hover:text-foreground"}
            >
              Privacy
            </Link>
            <Link
              href="/terms"
              className={current === "terms" ? "text-foreground" : "hover:text-foreground"}
            >
              Terms
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

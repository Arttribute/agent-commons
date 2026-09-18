import Link from "next/link";
import { FlaskConical } from "lucide-react";

export function SiteFooter() {
  return (
    <footer className="border-t border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 py-8 text-sm text-slate-500 sm:flex-row sm:px-6 lg:px-8">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-slate-900">
            <FlaskConical className="h-3 w-3 text-white" strokeWidth={1.75} />
          </span>
          <span>© 2026 CommonLab</span>
        </div>
        <nav className="flex gap-6">
          <Link href="/courses" className="hover:text-slate-900">
            Courses
          </Link>
          <Link href="/skills" className="hover:text-slate-900">
            Skills
          </Link>
          <Link href="/privacy" className="hover:text-slate-900">
            Privacy
          </Link>
          <Link href="/terms" className="hover:text-slate-900">
            Terms
          </Link>
        </nav>
      </div>
    </footer>
  );
}

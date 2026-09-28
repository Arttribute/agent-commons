import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * Shared frame for sign-in, desktop approval, and connection screens so they
 * look like the rest of Agent Commons and like Commons Identity.
 */
export function AuthShell({ children, className, corner, footer = true }: {
  children: React.ReactNode;
  className?: string;
  /** Small control pinned to the top-right corner, e.g. the Cloud/Local switch. */
  corner?: React.ReactNode;
  footer?: boolean;
}) {
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-y-auto bg-page px-4 py-10 text-stone-950">
      {corner && <div className="absolute right-4 top-4">{corner}</div>}
      <Link href="/" className="mb-5 flex items-center gap-2 text-sm font-semibold tracking-tight" aria-label="Agent Commons home">
        <Image src="/ac-icon.svg" alt="" width={26} height={26} className="h-[26px] w-[26px] rounded-[7px]" priority />
        Agent Commons
      </Link>
      <section className={cn("w-full max-w-[400px] rounded-2xl border border-stone-200 bg-white p-7 shadow-card", className)}>
        {children}
      </section>
      {footer && (
        <p className="mt-5 text-center text-xs text-stone-400">
          <Link className="hover:text-stone-700" href="/privacy">Privacy</Link> · <Link className="hover:text-stone-700" href="/terms">Terms</Link>
        </p>
      )}
    </main>
  );
}

export function AuthTitle({ children, description }: { children: React.ReactNode; description?: React.ReactNode }) {
  return (
    <div className="mb-5">
      <h1 className="text-[21px] font-semibold leading-tight tracking-[-0.025em]">{children}</h1>
      {description && <p className="mt-1.5 text-sm leading-6 text-stone-500">{description}</p>}
    </div>
  );
}

export const authInputClass =
  "h-10 w-full rounded-[10px] border border-stone-300 bg-white px-3 text-sm text-stone-950 outline-none transition focus:border-stone-400 focus:ring-4 focus:ring-stone-100";
export const authPrimaryButtonClass =
  "flex w-full items-center justify-center gap-2 rounded-[10px] bg-stone-950 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-stone-700 disabled:opacity-50";
export const authSecondaryButtonClass =
  "flex w-full items-center justify-center gap-2 rounded-[10px] border border-stone-300 bg-white px-4 py-2.5 text-sm font-medium text-stone-900 transition-colors hover:bg-stone-50 disabled:opacity-50";

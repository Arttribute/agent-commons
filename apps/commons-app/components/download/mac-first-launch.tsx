import type { ReactNode } from "react";
import { ShieldCheck } from "lucide-react";
import { TrafficLights } from "@/components/computers/desktop-window";

/** A macOS button label, styled so people can spot it on screen. */
function MacButton({ children }: { children: ReactNode }) {
  return (
    <span className="whitespace-nowrap rounded-md border border-stone-200 bg-stone-50 px-1.5 py-px text-[12px] font-medium text-stone-800">
      {children}
    </span>
  );
}

const STEPS: ReactNode[] = [
  <>Open Agent Commons from Applications. When macOS says it can&apos;t verify the app, click <MacButton>Done</MacButton>.</>,
  <>Open System Settings, then Privacy &amp; Security.</>,
  <>Scroll to Security and click <MacButton>Open Anyway</MacButton> next to the Agent Commons message.</>,
  <>Confirm with <MacButton>Open Anyway</MacButton> and your Mac password. You only do this once.</>,
];

/** The Privacy & Security row people look for in step 3. */
function SecurityRowPreview() {
  return (
    <div aria-hidden className="overflow-hidden rounded-lg border border-stone-200 bg-stone-50/60">
      <div className="flex h-8 items-center gap-2 border-b border-stone-200 bg-white px-3">
        <TrafficLights tone="light" />
        <span className="text-[11px] font-medium text-stone-600">Privacy &amp; Security</span>
      </div>
      <div className="p-3">
        <p className="text-[11px] font-medium text-stone-500">Security</p>
        <div className="mt-2 rounded-md border border-stone-200 bg-white p-3">
          <p className="text-[12px] leading-5 text-stone-700">
            &ldquo;Agent Commons&rdquo; was blocked to protect your Mac.
          </p>
          <div className="mt-2 flex justify-end">
            <span className="rounded-md bg-white px-2.5 py-1 text-[12px] font-medium text-stone-900 shadow-card ring-2 ring-stone-900/80 ring-offset-2">
              Open Anyway
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

/** First-launch steps for the macOS build, which is not notarized yet. */
export function MacFirstLaunch({ id }: { id?: string }) {
  return (
    <section id={id} className="mx-auto max-w-3xl scroll-mt-6 px-5 pt-10">
      <div className="rounded-xl border border-stone-200 bg-white p-5 shadow-card">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-stone-500" strokeWidth={1.75} />
          <div>
            <h2 className="text-sm font-medium text-stone-900">Opening it on a Mac</h2>
            <p className="mt-1 text-xs leading-5 text-stone-500">
              This early release is not notarized by Apple yet, so macOS asks you to approve it the first time you open it.
            </p>
          </div>
        </div>

        <div className="mt-5 grid gap-5 sm:grid-cols-[1fr_15rem] sm:items-center">
          <ol className="space-y-3">
            {STEPS.map((step, index) => (
              <li key={index} className="flex gap-3 text-[13px] leading-6 text-stone-700">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-stone-100 text-[11px] font-medium text-stone-600">
                  {index + 1}
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
          <SecurityRowPreview />
        </div>

        <p className="mt-5 border-t border-stone-100 pt-3 text-xs leading-5 text-stone-500">
          On macOS 14 or earlier you can also Control-click the app in Applications and choose Open.
        </p>
      </div>
    </section>
  );
}

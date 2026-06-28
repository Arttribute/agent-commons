import { FlaskConical, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type LoadingScreenProps = {
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
  tone?: "lime" | "sky" | "amber";
  compact?: boolean;
};

const tones = {
  lime: {
    glow: "bg-lime-200",
    accent: "bg-[#B8F56D]",
    text: "text-lime-700",
  },
  sky: {
    glow: "bg-sky-200",
    accent: "bg-sky-300",
    text: "text-sky-700",
  },
  amber: {
    glow: "bg-amber-200",
    accent: "bg-amber-300",
    text: "text-amber-700",
  },
};

export function LoadingScreen({
  title,
  subtitle,
  icon: Icon = FlaskConical,
  tone = "lime",
  compact = false,
}: LoadingScreenProps) {
  const theme = tones[tone];

  return (
    <main
      className={cn(
        "flex min-h-screen items-center justify-center bg-white px-4 text-slate-950",
        compact && "min-h-[420px]"
      )}
    >
      <div className="w-full max-w-sm text-center">
        <div className="relative mx-auto mb-6 flex h-20 w-20 items-center justify-center">
          <div className={cn("absolute inset-0 rounded-full opacity-60 blur-2xl", theme.glow)} />
          <div className="absolute inset-0 rounded-full border border-slate-200" />
          <div className="absolute h-14 w-14 animate-ping rounded-full border border-slate-200 opacity-40" />
          <div className={cn("relative flex h-12 w-12 items-center justify-center rounded-xl", theme.accent)}>
            <Icon className="h-5 w-5 text-slate-950" />
          </div>
        </div>
        <p className={cn("text-xs font-black uppercase tracking-widest", theme.text)}>
          CommonLab
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle ? (
          <p className="mx-auto mt-3 max-w-xs text-sm leading-6 text-slate-600">{subtitle}</p>
        ) : null}
        <div className="mx-auto mt-6 flex w-40 items-center gap-1.5">
          <span className={cn("h-1.5 flex-1 animate-pulse rounded-full", theme.accent)} />
          <span className="h-1.5 flex-1 animate-pulse rounded-full bg-slate-200 [animation-delay:160ms]" />
          <span className="h-1.5 flex-1 animate-pulse rounded-full bg-slate-300 [animation-delay:320ms]" />
        </div>
      </div>
    </main>
  );
}

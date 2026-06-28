import { Loader2, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type LoadingScreenProps = {
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
  tone?: "lime" | "sky" | "amber";
  compact?: boolean;
};

export function LoadingScreen({
  title,
  subtitle,
  icon: Icon = Loader2,
  compact = false,
}: LoadingScreenProps) {
  return (
    <main
      className={cn(
        "flex min-h-screen items-center justify-center bg-white px-4 text-center",
        compact && "min-h-[320px]"
      )}
    >
      <div className="w-full max-w-xs">
        <Icon className="mx-auto h-5 w-5 animate-spin text-slate-400" />
        <h1 className="mt-4 text-sm font-semibold text-slate-500">{title}</h1>
        {subtitle ? (
          <p className="mx-auto mt-2 text-sm leading-6 text-slate-400">{subtitle}</p>
        ) : null}
      </div>
    </main>
  );
}

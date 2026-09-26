"use client";

import { useState, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * One learning surface, laid out the same way everywhere.
 *
 * The page itself never scrolls. A stage (slides, image, lab) holds its own
 * space and stays put, the reading column scrolls on its own, and the action
 * bar stays reachable.
 *
 * `split` puts the stage beside the reading column on wide screens, for when
 * the learner reads or answers briefly while looking at something.
 * `tabs` gives each surface the full width, for when the task itself is a
 * workspace. Either way, small screens show one surface at a time.
 */
export type StudyStage = {
  key: string;
  label: string;
  icon?: LucideIcon;
  node: ReactNode;
  /** Stage fills its pane edge to edge instead of being padded. */
  flush?: boolean;
};

export function StudyShell({
  rail,
  stage = [],
  layout = "split",
  contentLabel = "Lesson",
  contentIcon: ContentIcon,
  contentHeader,
  footer,
  children,
  contentWidth = "md",
}: {
  rail?: ReactNode;
  stage?: StudyStage[];
  layout?: "split" | "tabs";
  contentLabel?: string;
  contentIcon?: LucideIcon;
  contentHeader?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  contentWidth?: "md" | "wide" | "full";
}) {
  const stages = stage.filter(Boolean);
  const [stageKey, setStageKey] = useState(stages[0]?.key || "");
  const [view, setView] = useState("content");
  const split = layout === "split" && stages.length > 0;
  const activeStageKey = stages.some((item) => item.key === stageKey)
    ? stageKey
    : stages[0]?.key || "";

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden">
      {rail ? (
        <div className="hidden w-64 shrink-0 flex-col border-r border-border bg-white lg:flex">{rail}</div>
      ) : null}

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {stages.length ? (
          <nav
            aria-label="Views"
            className={cn(
              "flex shrink-0 items-center gap-1 overflow-x-auto border-b border-border bg-white px-3",
              split && "lg:hidden",
            )}
          >
            <ViewTab
              active={view === "content"}
              onClick={() => setView("content")}
              icon={ContentIcon}
              label={contentLabel}
            />
            {stages.map((item) => (
              <ViewTab
                key={item.key}
                active={view === item.key}
                onClick={() => setView(item.key)}
                icon={item.icon}
                label={item.label}
              />
            ))}
          </nav>
        ) : null}

        <div className={cn("flex min-h-0 flex-1 flex-col", split && "lg:flex-row")}>
          {stages.map((item) => (
            <section
              key={item.key}
              aria-label={item.label}
              className={cn(
                "min-h-0 min-w-0 flex-1 flex-col border-border bg-page",
                split && "lg:border-r",
                item.flush ? "" : "p-4 sm:p-6",
                view === item.key ? "flex" : "hidden",
                split && (activeStageKey === item.key ? "lg:flex" : "lg:hidden"),
              )}
            >
              {split && stages.length > 1 ? (
                <div className="mb-3 hidden shrink-0 items-center gap-1 lg:flex">
                  {stages.map((option) => (
                    <button
                      key={option.key}
                      type="button"
                      onClick={() => setStageKey(option.key)}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs transition-colors",
                        option.key === activeStageKey
                          ? "bg-white text-foreground shadow-card"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {option.icon ? <option.icon className="h-3.5 w-3.5" strokeWidth={1.75} /> : null}
                      {option.label}
                    </button>
                  ))}
                </div>
              ) : null}
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{item.node}</div>
            </section>
          ))}

          <div
            className={cn(
              "min-h-0 min-w-0 flex-col bg-white",
              split
                ? contentWidth === "wide"
                  ? "lg:w-[34rem] lg:shrink-0"
                  : "lg:w-[26rem] lg:shrink-0"
                : "flex-1",
              view === "content" || !stages.length ? "flex" : "hidden",
              split && "lg:flex",
            )}
          >
            {contentHeader ? (
              <div className="shrink-0 border-b border-border px-5 py-3">{contentHeader}</div>
            ) : null}
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
              <div
                className={cn(
                  "px-5 py-6",
                  !split && contentWidth !== "full" && "mx-auto w-full max-w-3xl",
                  !split && contentWidth === "full" && "mx-auto w-full max-w-6xl",
                )}
              >
                {children}
              </div>
            </div>
            {footer ? (
              <div className="shrink-0 border-t border-border bg-white px-5 py-3">{footer}</div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function ViewTab({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon?: LucideIcon;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative flex h-11 shrink-0 items-center gap-1.5 px-3 text-sm transition-colors",
        active
          ? "font-medium text-foreground after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:bg-foreground"
          : "text-muted-foreground",
      )}
    >
      {Icon ? <Icon className="h-4 w-4" strokeWidth={1.75} /> : null}
      {label}
    </button>
  );
}

/** Image that keeps its place while the reading column scrolls. */
export function StageMedia({
  src,
  alt,
  caption,
}: {
  src: string;
  alt?: string;
  caption?: string;
}) {
  return (
    <figure className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3">
      <div className="flex min-h-0 w-full flex-1 items-center justify-center overflow-hidden rounded-xl border border-border bg-white">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={alt || ""} className="max-h-full w-full object-contain" />
      </div>
      {caption ? (
        <figcaption className="shrink-0 text-xs text-muted-foreground">{caption}</figcaption>
      ) : null}
    </figure>
  );
}

import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeft, ChevronRight, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { InfoTip } from "@/components/ui/tooltip";

/**
 * Brand page title: the text sits inside a soft highlight block, matching
 * the Agent Commons page headers.
 */
export function PageTitle({ title, className }: { title: string; className?: string }) {
  return (
    <h1 className={cn("text-base font-medium tracking-tight", className)}>
      <span className="inline-block rounded-md bg-highlight px-1.5 py-0.5 leading-snug text-stone-900">
        {title}
      </span>
    </h1>
  );
}

/**
 * Page header: one title, an optional info tip for anything that needs
 * explaining, and a small actions slot. Deliberately no paragraph copy.
 */
export function PageHeader({
  title,
  info,
  actions,
  back,
  meta,
  highlight = true,
  className,
}: {
  title: string;
  info?: ReactNode;
  actions?: ReactNode;
  back?: { href: string; label: string };
  meta?: ReactNode;
  highlight?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("mb-5 flex flex-wrap items-center justify-between gap-3", className)}>
      <div className="min-w-0">
        {back ? (
          <Link
            href={back.href}
            className="mb-2 inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.75} />
            {back.label}
          </Link>
        ) : null}
        <div className="flex min-w-0 items-center gap-1.5">
          {highlight ? (
            <PageTitle title={title} />
          ) : (
            <h1 className="truncate text-lg font-medium tracking-tight text-foreground">{title}</h1>
          )}
          {info ? <InfoTip label={`About ${title}`}>{info}</InfoTip> : null}
        </div>
        {meta ? <div className="mt-1.5 text-sm text-muted-foreground">{meta}</div> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}

/** White bordered surface. */
export function Card({
  children,
  className,
  padded = true,
}: {
  children: ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return (
    <section
      className={cn(
        "rounded-xl border border-border bg-white shadow-card",
        padded && "p-5",
        className,
      )}
    >
      {children}
    </section>
  );
}

/** Card with a compact title row. */
export function Panel({
  title,
  info,
  action,
  children,
  className,
  bodyClassName,
}: {
  title: ReactNode;
  info?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={cn("rounded-xl border border-border bg-white shadow-card", className)}>
      <div className="flex min-h-11 items-center justify-between gap-3 border-b border-border/70 px-4">
        <div className="flex min-w-0 items-center gap-1">
          <h2 className="truncate text-sm font-medium text-foreground">{title}</h2>
          {info ? <InfoTip>{info}</InfoTip> : null}
        </div>
        {action}
      </div>
      <div className={cn("p-4", bodyClassName)}>{children}</div>
    </section>
  );
}

/** Title row used above a group of fields inside a view. */
export function SectionTitle({
  title,
  info,
  action,
  className,
}: {
  title: string;
  info?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-3 flex items-center justify-between gap-3", className)}>
      <div className="flex items-center gap-1">
        <h3 className="text-sm font-medium text-foreground">{title}</h3>
        {info ? <InfoTip label={`About ${title}`}>{info}</InfoTip> : null}
      </div>
      {action}
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-white px-6 py-14 text-center",
        className,
      )}
    >
      {Icon ? (
        <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <Icon className="h-5 w-5" strokeWidth={1.75} />
        </span>
      ) : null}
      <p className="text-sm font-medium text-foreground">{title}</p>
      {description ? (
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>
      ) : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

type Tone = "neutral" | "success" | "warning" | "danger" | "info" | "live";

const tones: Record<Tone, string> = {
  neutral: "bg-muted text-stone-600",
  success: "bg-emerald-50 text-emerald-700",
  warning: "bg-amber-50 text-amber-700",
  danger: "bg-red-50 text-red-700",
  info: "bg-sky-50 text-sky-700",
  live: "bg-red-50 text-red-600",
};

export function Badge({
  tone = "neutral",
  children,
  dot,
  className,
}: {
  tone?: Tone;
  children: ReactNode;
  dot?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium",
        tones[tone],
        className,
      )}
    >
      {dot ? (
        <span
          className={cn(
            "h-1.5 w-1.5 rounded-full bg-current",
            tone === "live" && "animate-pulse",
          )}
        />
      ) : null}
      {children}
    </span>
  );
}

/** A single quiet row of key numbers. */
export function StatStrip({
  items,
  className,
}: {
  items: Array<{ label: string; value: ReactNode; info?: ReactNode }>;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid divide-y divide-border overflow-hidden rounded-xl border border-border bg-white shadow-card sm:divide-x sm:divide-y-0",
        items.length >= 4 ? "sm:grid-cols-4" : items.length === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2",
        className,
      )}
    >
      {items.map((item) => (
        <div key={item.label} className="min-w-0 px-4 py-3">
          <div className="flex items-center gap-1">
            <p className="truncate text-xs text-muted-foreground">{item.label}</p>
            {item.info ? <InfoTip>{item.info}</InfoTip> : null}
          </div>
          <p className="mt-1 truncate text-lg font-medium tracking-tight text-foreground">
            {item.value}
          </p>
        </div>
      ))}
    </div>
  );
}

/** Bordered list container for rows. */
export function List({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "divide-y divide-border overflow-hidden rounded-xl border border-border bg-white shadow-card",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** One clickable row. Details open elsewhere; the row stays a summary. */
export function ListRow({
  href,
  onClick,
  leading,
  title,
  meta,
  trailing,
  active,
  chevron = true,
  className,
}: {
  href?: string;
  onClick?: () => void;
  leading?: ReactNode;
  title: ReactNode;
  meta?: ReactNode;
  trailing?: ReactNode;
  active?: boolean;
  chevron?: boolean;
  className?: string;
}) {
  const content = (
    <>
      {leading ? <span className="shrink-0">{leading}</span> : null}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-foreground">{title}</span>
        {meta ? <span className="mt-0.5 block truncate text-xs text-muted-foreground">{meta}</span> : null}
      </span>
      {trailing ? <span className="flex shrink-0 items-center gap-2">{trailing}</span> : null}
      {chevron && (href || onClick) ? (
        <ChevronRight className="h-4 w-4 shrink-0 text-stone-300" strokeWidth={1.75} />
      ) : null}
    </>
  );
  const classes = cn(
    "flex w-full items-center gap-3 px-4 py-3 text-left transition-colors",
    (href || onClick) && "hover:bg-page",
    active && "bg-accent",
    className,
  );
  if (href) {
    return (
      <Link href={href} className={classes}>
        {content}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={classes}>
        {content}
      </button>
    );
  }
  return <div className={classes}>{content}</div>;
}

/** Two-pane layout: a narrow navigator list and the focused detail view. */
export function MasterDetail({
  list,
  detail,
  className,
}: {
  list: ReactNode;
  detail: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("grid items-start gap-5 lg:grid-cols-[280px_minmax(0,1fr)]", className)}>
      <aside className="lg:sticky lg:top-0">{list}</aside>
      <div className="min-w-0">{detail}</div>
    </div>
  );
}

/** Row inside a navigator list (modules, activities, challenges). */
export function NavItem({
  active,
  onClick,
  leading,
  title,
  meta,
  trailing,
  indent,
}: {
  active?: boolean;
  onClick: () => void;
  leading?: ReactNode;
  title: ReactNode;
  meta?: ReactNode;
  trailing?: ReactNode;
  indent?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "true" : undefined}
      className={cn(
        "group flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors",
        active ? "bg-accent text-foreground" : "text-stone-600 hover:bg-muted hover:text-foreground",
        indent && "pl-7",
      )}
    >
      {leading ? <span className="shrink-0">{leading}</span> : null}
      <span className="min-w-0 flex-1">
        <span className={cn("block truncate text-sm", active && "font-medium")}>{title}</span>
        {meta ? <span className="block truncate text-xs text-muted-foreground">{meta}</span> : null}
      </span>
      {trailing}
    </button>
  );
}

/** Small numbered chip used for ordered items. */
export function IndexChip({ value, active }: { value: number | string; active?: boolean }) {
  return (
    <span
      className={cn(
        "flex h-6 w-6 items-center justify-center rounded-md text-[11px] font-medium tabular-nums",
        active ? "bg-stone-900 text-white" : "bg-muted text-muted-foreground",
      )}
    >
      {value}
    </span>
  );
}

export { Disclosure } from "@/components/ui/disclosure";

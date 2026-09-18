import Link from "next/link";
import { forwardRef } from "react";
import { LoaderCircle, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip } from "@/components/ui/tooltip";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md";

const variants: Record<Variant, string> = {
  primary: "bg-stone-900 text-white hover:bg-stone-800 disabled:bg-stone-900",
  secondary:
    "border border-border bg-white text-foreground shadow-card hover:bg-muted",
  ghost: "text-muted-foreground hover:bg-muted hover:text-foreground",
  danger:
    "border border-border bg-white text-red-600 hover:border-red-200 hover:bg-red-50",
};

const sizes: Record<Size, string> = {
  sm: "h-8 gap-1.5 rounded-md px-2.5 text-xs",
  md: "h-9 gap-2 rounded-lg px-3.5 text-sm",
};

export function buttonClass({
  variant = "secondary",
  size = "md",
  className,
}: {
  variant?: Variant;
  size?: Size;
  className?: string;
} = {}) {
  return cn(
    "inline-flex shrink-0 items-center justify-center whitespace-nowrap font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
    variants[variant],
    sizes[size],
    className,
  );
}

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  icon?: LucideIcon;
  loading?: boolean;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    { variant, size, icon: Icon, loading, className, children, type = "button", disabled, ...props },
    ref,
  ) {
    return (
      <button
        ref={ref}
        type={type}
        disabled={disabled || loading}
        className={buttonClass({ variant, size, className })}
        {...props}
      >
        {loading ? (
          <LoaderCircle className="h-4 w-4 animate-spin" />
        ) : Icon ? (
          <Icon className={size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4"} strokeWidth={1.75} />
        ) : null}
        {children}
      </button>
    );
  },
);

export function ButtonLink({
  href,
  variant,
  size,
  icon: Icon,
  className,
  children,
  external,
}: {
  href: string;
  variant?: Variant;
  size?: Size;
  icon?: LucideIcon;
  className?: string;
  children: React.ReactNode;
  external?: boolean;
}) {
  const content = (
    <>
      {Icon ? (
        <Icon className={size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4"} strokeWidth={1.75} />
      ) : null}
      {children}
    </>
  );
  if (external) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className={buttonClass({ variant, size, className })}
      >
        {content}
      </a>
    );
  }
  return (
    <Link href={href} className={buttonClass({ variant, size, className })}>
      {content}
    </Link>
  );
}

/**
 * Square icon-only button. The label is shown in a tooltip and read by
 * screen readers, so every icon action stays discoverable without text.
 */
export function IconButton({
  label,
  icon: Icon,
  onClick,
  href,
  variant = "ghost",
  size = "md",
  className,
  disabled,
  active,
  tooltipSide = "bottom",
}: {
  label: string;
  icon: LucideIcon;
  onClick?: () => void;
  href?: string;
  variant?: Variant;
  size?: Size;
  className?: string;
  disabled?: boolean;
  active?: boolean;
  tooltipSide?: "top" | "bottom" | "left" | "right";
}) {
  const classes = cn(
    buttonClass({ variant, size }),
    size === "sm" ? "w-8 px-0" : "w-9 px-0",
    variant === "secondary" && "rounded-full",
    active && "bg-accent text-foreground",
    className,
  );
  const icon = <Icon className={size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4"} strokeWidth={1.75} />;
  return (
    <Tooltip label={label} side={tooltipSide}>
      {href ? (
        <Link href={href} aria-label={label} className={classes}>
          {icon}
        </Link>
      ) : (
        <button
          type="button"
          aria-label={label}
          onClick={onClick}
          disabled={disabled}
          className={classes}
        >
          {icon}
        </button>
      )}
    </Tooltip>
  );
}

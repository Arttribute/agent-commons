"use client";

import { forwardRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { InfoTip } from "@/components/ui/tooltip";

/** Label + control wrapper. Help text is tucked behind an info tip. */
export function Field({
  label,
  info,
  hint,
  children,
  className,
  optional,
}: {
  label: string;
  info?: ReactNode;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
  optional?: boolean;
}) {
  return (
    <div className={cn("block", className)}>
      <div className="mb-1.5 flex min-h-5 items-center gap-1">
        <label className="text-sm font-medium text-foreground">{label}</label>
        {optional ? <span className="text-xs text-muted-foreground">Optional</span> : null}
        {info ? <InfoTip label={`About ${label}`}>{info}</InfoTip> : null}
      </div>
      {children}
      {hint ? <p className="mt-1.5 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return <input ref={ref} className={cn("ui-control", className)} {...props} />;
  },
);

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className, rows = 4, ...props }, ref) {
  return (
    <textarea ref={ref} rows={rows} className={cn("ui-control resize-y", className)} {...props} />
  );
});

export const Select = forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, children, ...props }, ref) {
    return (
      <select ref={ref} className={cn("ui-control pr-8", className)} {...props}>
        {children}
      </select>
    );
  },
);

/** Accessible on/off switch. */
export function Switch({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative h-5 w-9 shrink-0 rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        checked ? "bg-stone-900" : "bg-stone-200",
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-all",
          checked ? "left-[18px]" : "left-0.5",
        )}
      />
    </button>
  );
}

/** A settings row: label on the left, switch on the right. */
export function SwitchRow({
  label,
  info,
  description,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  info?: ReactNode;
  description?: ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className={cn("flex items-center justify-between gap-4 py-3", disabled && "opacity-60")}>
      <div className="min-w-0">
        <div className="flex items-center gap-1">
          <span className="text-sm text-foreground">{label}</span>
          {info ? <InfoTip label={`About ${label}`}>{info}</InfoTip> : null}
        </div>
        {description ? (
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        ) : null}
      </div>
      <Switch checked={checked} onChange={onChange} disabled={disabled} label={label} />
    </div>
  );
}

/** Grid helper for side-by-side fields. */
export function FieldGrid({
  children,
  columns = 2,
  className,
}: {
  children: ReactNode;
  columns?: 2 | 3;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid gap-4",
        columns === 3 ? "sm:grid-cols-2 lg:grid-cols-3" : "sm:grid-cols-2",
        className,
      )}
    >
      {children}
    </div>
  );
}

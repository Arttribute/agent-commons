import { forwardRef } from "react";
import type { LucideProps } from "lucide-react";

/**
 * `clipboard-clock` from Lucide, inlined because the pinned lucide-react
 * (0.474) predates the icon. Same 24×24 geometry, props, and stroke defaults
 * as every other Lucide glyph, so it sizes and colors identically alongside
 * them.
 *
 * This is the single icon for scheduled tasks across the app.
 */
export const ClipboardClock = forwardRef<SVGSVGElement, LucideProps>(
  ({ size = 24, strokeWidth = 2, absoluteStrokeWidth, ...props }, ref) => (
    <svg
      ref={ref}
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={
        absoluteStrokeWidth
          ? (Number(strokeWidth) * 24) / Number(size)
          : strokeWidth
      }
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M16 14v2.2l1.6 1" />
      <path d="M16 4h2a2 2 0 0 1 2 2v.832" />
      <path d="M8 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h2" />
      <circle cx="16" cy="16" r="6" />
      <rect x="8" y="2" width="8" height="4" rx="1" />
    </svg>
  )
);

ClipboardClock.displayName = "ClipboardClock";

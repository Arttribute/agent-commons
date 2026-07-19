/** Lightweight static brand marks generated from the project's icon set. */
export function BrandLogo({
  name,
  size = 24,
  className,
}: {
  /** Icon name inside the logos collection, e.g. "google-gmail" */
  name: string;
  /** Rendered height in px (width follows the mark's aspect ratio) */
  size?: number;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={className}
      style={{ display: "inline-flex", lineHeight: 0 }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`/brand-icons/${name}.svg`}
        alt=""
        height={size}
        style={{ height: size, width: "auto" }}
      />
    </span>
  );
}

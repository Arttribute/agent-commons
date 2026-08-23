/** Lightweight static brand marks generated from the project's icon set. */
export function BrandLogo({
  name,
  size = 24,
  className,
}: {
  /** Icon name inside the logos collection, e.g. "google-gmail" */
  name: string;
  /** Box the mark is fitted into, in px. Square marks fill it; wide wordmarks
   *  (Gemini, Meta) shrink to their width so they never spill their tile. */
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
        style={{ maxHeight: size, maxWidth: size, height: "auto", width: "auto" }}
      />
    </span>
  );
}

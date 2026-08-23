/** Lightweight static brand marks generated from the project's icon set. */
export function BrandLogo({
  name,
  size = 24,
  maxWidth,
  className,
}: {
  /** Icon name inside the logos collection, e.g. "google-gmail" */
  name: string;
  /** Box height in px. Square marks fill it. */
  size?: number;
  /**
   * Box width in px. Defaults to `size`, which keeps wide wordmarks (Gemini,
   * Meta) inside a square tile. Give it more room in a row layout, where a
   * wordmark should read at the same weight as the square glyphs beside it.
   */
  maxWidth?: number;
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
        style={{
          maxHeight: size,
          maxWidth: maxWidth ?? size,
          height: "auto",
          width: "auto",
        }}
      />
    </span>
  );
}

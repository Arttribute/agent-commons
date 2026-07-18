import { icons as logosCollection } from "@iconify-json/logos";
import {
  getIconData,
  iconToHTML,
  iconToSVG,
  replaceIDs,
} from "@iconify/utils";

/**
 * Full-color brand marks from the Iconify "logos" collection, rendered to
 * inline SVG on the server so the icon data never ships to the client.
 */
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
  const icon = getIconData(logosCollection, name);
  if (!icon) return null;
  const svg = iconToSVG(icon, { height: size });
  const html = iconToHTML(replaceIDs(svg.body), svg.attributes);
  return (
    <span
      aria-hidden
      className={className}
      style={{ display: "inline-flex", lineHeight: 0 }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

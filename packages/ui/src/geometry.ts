/** Artifact-content coordinates, independent of CSS zoom, panel size and device pixel ratio. */
export type ContentRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};
export const COMPILED_VIEWPORT = { width: 1280, height: 720 } as const;
export function fitContentBox(
  container: { width: number; height: number },
  intrinsic: { width: number; height: number } | null,
): ContentRect {
  if (!intrinsic || !intrinsic.width || !intrinsic.height)
    return { left: 0, top: 0, ...container };
  const scale = Math.min(
    container.width / intrinsic.width,
    container.height / intrinsic.height,
  );
  const width = intrinsic.width * scale,
    height = intrinsic.height * scale;
  return {
    left: (container.width - width) / 2,
    top: (container.height - height) / 2,
    width,
    height,
  };
}
export function normalizedContentPoint(
  client: { x: number; y: number },
  bounds: ContentRect,
) {
  const clamp = (n: number) => Math.max(0, Math.min(1, n));
  return {
    x: clamp((client.x - bounds.left) / Math.max(1, bounds.width)),
    y: clamp((client.y - bounds.top) / Math.max(1, bounds.height)),
  };
}

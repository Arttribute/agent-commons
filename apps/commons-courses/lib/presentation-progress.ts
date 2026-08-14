export function normalizePresentationStartSlide(initialSlide: number) {
  if (!Number.isFinite(initialSlide)) return 0;
  return Math.max(0, Math.floor(initialSlide) - 1);
}

export function presentationProgressStorageKey({
  materialId,
  progressKey,
  initialSlide,
}: {
  materialId: string;
  progressKey?: string;
  initialSlide: number;
}) {
  return [
    "commonlab-slide-v2",
    materialId,
    progressKey || "default",
    `start-${normalizePresentationStartSlide(initialSlide) + 1}`,
  ].join(":");
}

export function resolvePresentationSlideIndex(
  initialSlide: number,
  savedSlide: string | null,
) {
  const fallback = normalizePresentationStartSlide(initialSlide);
  if (savedSlide === null || !/^\d+$/.test(savedSlide)) return fallback;
  const saved = Number(savedSlide);
  return Number.isSafeInteger(saved) ? saved : fallback;
}

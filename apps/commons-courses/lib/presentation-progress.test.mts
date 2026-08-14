import assert from "node:assert/strict";
import test from "node:test";
import {
  presentationProgressStorageKey,
  resolvePresentationSlideIndex,
} from "./presentation-progress.ts";

test("uses the configured section slide when no progress exists", () => {
  assert.equal(resolvePresentationSlideIndex(14, null), 13);
  assert.equal(resolvePresentationSlideIndex(25, "invalid"), 24);
});

test("restores valid progress within the same section", () => {
  assert.equal(resolvePresentationSlideIndex(14, "18"), 18);
});

test("isolates progress by activity and configured start slide", () => {
  const base = { materialId: "deck", progressKey: "section" };
  assert.notEqual(
    presentationProgressStorageKey({ ...base, initialSlide: 1 }),
    presentationProgressStorageKey({ ...base, initialSlide: 14 }),
  );
  assert.notEqual(
    presentationProgressStorageKey({ ...base, initialSlide: 14 }),
    presentationProgressStorageKey({
      materialId: "deck",
      progressKey: "another-section",
      initialSlide: 14,
    }),
  );
});

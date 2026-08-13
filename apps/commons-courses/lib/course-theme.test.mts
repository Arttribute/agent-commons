import assert from "node:assert/strict";
import test from "node:test";
import { defaultCourseTheme, getCourseThemeStyle, normalizeCourseTheme } from "./course-theme.ts";

test("normalizes custom course colors and rejects unsafe color values", () => {
  assert.deepEqual(normalizeCourseTheme({ primary: "#abc", accent: "#123456", highlight: "red" }), {
    ...defaultCourseTheme,
    primary: "#AABBCC",
    accent: "#123456",
  });
});

test("derives readable foreground colors for educator-selected colors", () => {
  const style = getCourseThemeStyle({ primary: "#FFFFFF", accent: "#000000" });
  assert.equal(style["--course-on-primary"], "#0F172A");
  assert.equal(style["--course-on-accent"], "#FFFFFF");
});

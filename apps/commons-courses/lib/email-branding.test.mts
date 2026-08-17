import assert from "node:assert/strict";
import test from "node:test";
import {
  isPaidEducatorPlan,
  normalizeEmailBranding,
} from "./email/branding.ts";

test("treats every non-free educator plan as paid", () => {
  assert.equal(isPaidEducatorPlan("free"), false);
  assert.equal(isPaidEducatorPlan("starter"), true);
  assert.equal(isPaidEducatorPlan("growth"), true);
  assert.equal(isPaidEducatorPlan("institution"), true);
});

test("normalizes safe email branding values", () => {
  assert.deepEqual(
    normalizeEmailBranding({
      enabled: true,
      senderName: "  Moringa   School  ",
      logoUrl: "https://assets.example.com/logo.png",
      accentColor: "#ea580c",
      footerText: "  Learning together.  ",
    }),
    {
      enabled: true,
      senderName: "Moringa School",
      logoUrl: "https://assets.example.com/logo.png",
      accentColor: "#EA580C",
      footerText: "Learning together.",
    },
  );
});

test("drops unsafe logo and color values", () => {
  const branding = normalizeEmailBranding({
    enabled: true,
    logoUrl: "javascript:alert(1)",
    accentColor: "red",
  });
  assert.equal(branding.logoUrl, undefined);
  assert.equal(branding.accentColor, undefined);
});

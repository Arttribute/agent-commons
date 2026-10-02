import assert from "node:assert/strict";
import test from "node:test";
import { apiErrorMessage } from "./api-error.ts";

test("reads every error shape the API stack returns", () => {
  assert.equal(apiErrorMessage({ message: "Artifact not found" }, "x"), "Artifact not found");
  assert.equal(apiErrorMessage({ message: ["name must be a string", "id is required"] }, "x"), "name must be a string id is required");
  assert.equal(
    apiErrorMessage({ error: { type: "internal_error", message: "An internal error occurred" } }, "x"),
    "An internal error occurred",
  );
  assert.equal(apiErrorMessage({ error: "Unauthorized" }, "x"), "Unauthorized");
  assert.equal(apiErrorMessage({ message: { message: "Nested" } }, "x"), "Nested");
});

test("falls back instead of printing an object", () => {
  assert.equal(apiErrorMessage({ error: { type: "internal_error" } }, "Could not open"), "Could not open");
  assert.equal(apiErrorMessage(null, "Could not open"), "Could not open");
  assert.equal(apiErrorMessage({}, "Could not open"), "Could not open");
});

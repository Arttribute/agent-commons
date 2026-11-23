import assert from "node:assert/strict";
import test from "node:test";
import { messageText } from "./message-text.ts";

test("string replies are unchanged", () => {
  assert.equal(messageText("Here is the plan."), "Here is the plan.");
  assert.equal(messageText(""), "");
});

test("Responses API content blocks become their text", () => {
  assert.equal(
    messageText([{ type: "text", text: "Watch https://youtu.be/abc123xyz", annotations: [] }]),
    "Watch https://youtu.be/abc123xyz",
  );
  assert.equal(
    messageText([
      { type: "text", text: "First part" },
      { type: "reasoning", summary: [] },
      { type: "text", text: "Second part" },
    ]),
    "First part\nSecond part",
  );
});

test("missing or unknown content renders as empty text instead of throwing", () => {
  assert.equal(messageText(undefined), "");
  assert.equal(messageText(null), "");
  assert.equal(messageText({ type: "image_url", image_url: { url: "x" } }), "");
  assert.equal(messageText(42), "");
  assert.equal(messageText([{ type: "image_url", image_url: { url: "x" } }]), "");
});

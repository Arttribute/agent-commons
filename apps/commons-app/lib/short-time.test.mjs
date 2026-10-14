import assert from "node:assert/strict";
import test from "node:test";
import { messageTime, shortTime } from "./short-time.ts";

const now = new Date(2026, 9, 14, 15, 0); // Wed 14 Oct 2026, 3 PM local

test("reply times read like a messenger", () => {
  const time = (d) => d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const today = new Date(2026, 9, 14, 9, 5);
  const yesterday = new Date(2026, 9, 13, 22, 40);
  const monday = new Date(2026, 9, 12, 8, 0);
  const older = new Date(2026, 8, 3, 8, 0);
  assert.equal(messageTime(today, now), time(today));
  assert.equal(messageTime(yesterday, now), `Yesterday ${time(yesterday)}`);
  assert.match(messageTime(monday, now), new RegExp(`${time(monday)}$`));
  assert.match(messageTime(older, now), /,/);
  assert.equal(messageTime("not a date", now), "");
  assert.equal(messageTime(null, now), "");
});

test("list times stay short", () => {
  const base = now.getTime();
  assert.equal(shortTime(base - 30_000, base), "now");
  assert.equal(shortTime(base - 5 * 60_000, base), "5m");
  assert.equal(shortTime(base - 3 * 3_600_000, base), "3h");
  assert.equal(shortTime(base - 2 * 86_400_000, base), "2d");
});

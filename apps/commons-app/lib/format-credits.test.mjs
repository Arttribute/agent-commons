import assert from "node:assert/strict";
import test from "node:test";
import { formatCredits, formatCreditsExact } from "./format-credits.ts";

test("small balances stay exact", () => {
  assert.equal(formatCredits(0), "0");
  assert.equal(formatCredits(42), "42");
  assert.equal(formatCredits(9_999), "9,999");
});

test("large balances are compact", () => {
  assert.equal(formatCredits(10_000), "10K");
  assert.equal(formatCredits(12_345), "12.3K");
  assert.equal(formatCredits(250_000), "250K");
  assert.equal(formatCredits(1_000_000), "1M");
  assert.equal(formatCredits(1_250_000), "1.2M");
  assert.equal(formatCredits(3_400_000_000), "3.4B");
  assert.equal(formatCredits(2e12), "2T");
});

test("rounding never overstates the balance", () => {
  assert.equal(formatCredits(999_999), "999K");
  assert.equal(formatCredits(19_990), "19.9K");
});

test("negatives and bad input", () => {
  assert.equal(formatCredits(-1_500_000), "−1.5M");
  assert.equal(formatCredits(Number.NaN), "—");
  assert.equal(formatCreditsExact(1_234_567), "1,234,567");
});

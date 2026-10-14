import assert from "node:assert/strict";
import test from "node:test";
import { deliverCertificate } from "./certificate-delivery.ts";
import { canRetryCertificate, certificateSendIds, SAFE_RETRY_MS, SEND_LEASE_MS, validateCertificatePdf, serializeCertificate, lessonCompletionProgress } from "./certificate-policy.ts";

test("continuing lessons cannot undo an educator-awarded workshop completion", () => {
  assert.equal(lessonCompletionProgress(1, 12, "certificate"), 100);
  assert.equal(lessonCompletionProgress(1, 12), 8);
  assert.equal(lessonCompletionProgress(12, 12), 100);
});

test("awards completion before sending the email and records provider acceptance", async () => {
  const events: string[] = [];
  const result = await deliverCertificate("id", {
    async claim() { events.push("claim"); return {}; },
    async award() { events.push("award"); },
    async send() { events.push("email"); return "provider-id"; },
    async sent(_record, messageId) { events.push(messageId); },
    async failed() { assert.fail("should not fail"); },
  });
  assert.equal(result.status, "sent");
  assert.deepEqual(events, ["claim", "award", "email", "provider-id"]);
});

test("concurrent requests and already-sent records cannot send without a claim", async () => {
  const result = await deliverCertificate("id", {
    async claim() { return null; },
    async award() { assert.fail("cannot award"); },
    async send() { assert.fail("cannot email"); return ""; },
    async sent() { assert.fail("cannot mark sent"); },
    async failed() { assert.fail("cannot mark failed"); },
  });
  assert.equal(result.status, "busy");
});

test("an award failure prevents the email, while an email failure retains the award for retry", async () => {
  for (const failAt of ["award", "email"]) {
    let awarded = false;
    let failed = false;
    const result = await deliverCertificate("id", {
      async claim() { return {}; },
      async award() { if (failAt === "award") throw Error("enrollment missing"); awarded = true; },
      async send() { assert.equal(awarded, true); throw Error("provider unavailable"); },
      async sent() { assert.fail("cannot mark failed email sent"); },
      async failed() { failed = true; },
    });
    assert.equal(result.status, "failed");
    assert.equal(awarded, failAt === "email");
    assert.equal(failed, true);
  }
});

test("a lost acceptance write can retry using the same provider operation", async () => {
  let deliveries = 0;
  let accepted = false;
  let awarded = false;
  let first = true;
  const operations = {
    async claim() { return {}; },
    async award() { awarded = true; },
    async send() { if (!accepted) deliveries++; accepted = true; return "same-provider-id"; },
    async sent() { if (first) { first = false; throw Error("DB write lost"); } },
    async failed() {},
  };
  assert.equal((await deliverCertificate("id", operations)).status, "failed");
  assert.equal((await deliverCertificate("id", operations)).status, "sent");
  assert.equal(deliveries, 1);
  assert.equal(awarded, true);
});

test("leases block overlapping sends, stale leases recover within the provider's safe retry window", () => {
  const now = Date.now();
  assert.equal(canRetryCertificate({ emailStatus: "ready" }, now), true);
  assert.equal(canRetryCertificate({ emailStatus: "sent" }, now), false);
  assert.equal(canRetryCertificate({ emailStatus: "sending", sendingStartedAt: new Date(now) }, now), false);
  assert.equal(canRetryCertificate({ emailStatus: "sending", sendingStartedAt: new Date(now - SEND_LEASE_MS), firstAttemptAt: new Date(now - SEND_LEASE_MS) }, now), true);
  assert.equal(canRetryCertificate({ emailStatus: "failed", firstAttemptAt: new Date(now - SAFE_RETRY_MS) }, now), false);
});

test("rejects invalid or oversized PDFs and malformed send batches", () => {
  validateCertificatePdf(Buffer.from("%PDF-1.7\n"));
  assert.throws(() => validateCertificatePdf(Buffer.from("not a PDF")), /must be a PDF/);
  assert.throws(() => validateCertificatePdf(new Uint8Array(2 * 1024 * 1024 + 1)), /smaller/);
  const id = "a".repeat(24);
  assert.deepEqual(certificateSendIds([id, id]), [id]);
  for (const value of [null, [], ["bad"], Array(31).fill(id)]) assert.throws(() => certificateSendIds(value));
});

test("list serialization never exposes PDF contents or the saved email payload", () => {
  const record = { _id: "a".repeat(24), recipientName: "Learner", recipientEmail: "learner@example.com", filename: "certificate.pdf", emailStatus: "ready", pdf: Buffer.from("private"), emailPayload: { secret: true } };
  const serialized = serializeCertificate(record);
  assert.equal("pdf" in serialized, false);
  assert.equal("emailPayload" in serialized, false);
  assert.equal(serialized.canSend, true);
  assert.equal(serialized.awardedAt, null);
});

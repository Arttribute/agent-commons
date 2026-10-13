export const MAX_CERTIFICATE_BYTES = 2 * 1024 * 1024;
export const SEND_LEASE_MS = 5 * 60 * 1000;
// Resend keeps idempotency keys for 24 hours. Leave an hour of headroom.
export const SAFE_RETRY_MS = 23 * 60 * 60 * 1000;

export function validateCertificatePdf(data: Uint8Array) {
  if (!data.length || data.length > MAX_CERTIFICATE_BYTES) {
    throw new Error("Choose a PDF smaller than 2 MB.");
  }
  if (new TextDecoder().decode(data.slice(0, 5)) !== "%PDF-") {
    throw new Error("The certificate must be a PDF.");
  }
}

export function certificateFilename(name: string) {
  const safe = name.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 150);
  return safe.toLowerCase().endsWith(".pdf") ? safe : `${safe || "certificate"}.pdf`;
}

export function certificateSendIds(value: unknown): string[] {
  if (!Array.isArray(value) || !value.length || value.length > 30 ||
      value.some((id) => typeof id !== "string" || !/^[a-f0-9]{24}$/i.test(id))) {
    throw new Error("Choose between 1 and 30 certificates.");
  }
  return [...new Set(value as string[])];
}

export function canRetryCertificate(record: {
  emailStatus: string;
  firstAttemptAt?: Date | string;
  sendingStartedAt?: Date | string;
}, now = Date.now()) {
  if (record.emailStatus === "sent") return false;
  if (record.firstAttemptAt && now - new Date(record.firstAttemptAt).getTime() >= SAFE_RETRY_MS) return false;
  if (record.emailStatus === "sending" && record.sendingStartedAt &&
      now - new Date(record.sendingStartedAt).getTime() < SEND_LEASE_MS) return false;
  return true;
}

/** Shared with the preparation script so private PDFs never enter list responses. */
export function serializeCertificate(record: {
  _id: { toString(): string };
  recipientName: string;
  recipientEmail: string;
  completionPeriod?: string;
  filename: string;
  awardedAt?: Date;
  emailStatus: string;
  emailSentAt?: Date;
  emailError?: string;
  firstAttemptAt?: Date;
  sendingStartedAt?: Date;
}) {
  return {
    id: String(record._id),
    recipientName: record.recipientName,
    recipientEmail: record.recipientEmail,
    completionPeriod: record.completionPeriod || "",
    filename: record.filename,
    awardedAt: record.awardedAt?.toISOString() || null,
    emailStatus: record.emailStatus,
    emailSentAt: record.emailSentAt?.toISOString() || null,
    emailError: record.emailError || null,
    canSend: canRetryCertificate(record),
  };
}

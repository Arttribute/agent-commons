export type CertificateDeliveryResult = {
  id: string;
  status: "sent" | "failed" | "busy";
  error?: string;
};

/** Award first; record email acceptance separately. Atomic claims and provider
 * idempotency are supplied by the store/transport. Retrying never re-awards. */
export async function deliverCertificate<T>(
  id: string,
  operations: {
    claim(): Promise<T | null>;
    award(record: T): Promise<void>;
    send(record: T): Promise<string>;
    sent(record: T, messageId: string): Promise<void>;
    failed(record: T, error: string): Promise<void>;
  },
): Promise<CertificateDeliveryResult> {
  const record = await operations.claim();
  if (!record) return { id, status: "busy" };
  try {
    await operations.award(record);
    const messageId = await operations.send(record);
    await operations.sent(record, messageId);
    return { id, status: "sent" };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Certificate delivery failed.";
    await operations.failed(record, message);
    return { id, status: "failed", error: message };
  }
}

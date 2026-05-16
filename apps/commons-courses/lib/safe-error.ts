export function redactSecrets(value: string) {
  return value
    .replace(/\bsk_(test|live)_[A-Za-z0-9_]+/g, "sk_$1_[redacted]")
    .replace(/\bpk_(test|live)_[A-Za-z0-9_]+/g, "pk_$1_[redacted]")
    .replace(/\bwhsec_[A-Za-z0-9_]+/g, "whsec_[redacted]")
    .replace(/\b(sk|pk)_[A-Za-z0-9]{16,}\b/g, "$1_[redacted]");
}

export function getSafeErrorMessage(err: unknown, fallback = "Unknown error") {
  return err instanceof Error ? redactSecrets(err.message) : fallback;
}

/** Unsuccessful x402 payments can return 402 without a settlement receipt. */
export function readSettlement<T>(
  response: Response,
  parse: (getHeader: (name: string) => string | null) => T,
): T | undefined {
  if (!response.headers.has('PAYMENT-RESPONSE')) return undefined;
  return parse((name) => response.headers.get(name));
}

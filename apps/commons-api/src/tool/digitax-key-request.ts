import { BadRequestException } from '@nestjs/common';

export type DigiTaxKeyRequest = {
  method: string;
  path: string;
  body?: unknown;
};

// Credential use is restricted to this provider and its invoicing endpoints.
// Callers cannot choose a host, supply headers, follow redirects or read a key.
export function digitaxRequestTarget(input: DigiTaxKeyRequest): string {
  if (
    !input ||
    typeof input.path !== 'string' ||
    typeof input.method !== 'string' ||
    input.path.length > 1500
  )
    throw new BadRequestException('Invalid DigiTax request');
  const [path] = input.path.split('?');
  const method = input.method.toUpperCase();
  const allowed =
    method === 'GET'
      ? /^\/(?:etims-info|items(?:\/[A-Za-z0-9_-]{1,120})?|sales(?:\/[A-Za-z0-9_-]{1,120})?)$/.test(
          path,
        )
      : method === 'POST'
        ? /^\/(?:items|sales)$/.test(path)
        : method === 'PUT' && path === '/stock/adjust';
  if (!allowed || input.path.includes('#') || input.path.includes('\\'))
    throw new BadRequestException('Unsupported DigiTax request');
  const url = new URL(`https://api.digitax.tech/ke/v2${input.path}`);
  const queryKeys = new Set([
    'after',
    'before',
    'page_size',
    'start_date',
    'end_date',
  ]);
  if ([...url.searchParams.keys()].some((key) => !queryKeys.has(key)))
    throw new BadRequestException('Unsupported DigiTax query');
  if (method !== 'GET' && url.search)
    throw new BadRequestException('DigiTax writes cannot include a query');
  if (
    input.body !== undefined &&
    (method === 'GET' || JSON.stringify(input.body).length > 500000)
  )
    throw new BadRequestException('Invalid DigiTax body');
  return url.href;
}

export async function requestDigiTaxWithKey(
  key: string,
  input: DigiTaxKeyRequest,
) {
  const url = digitaxRequestTarget(input);
  try {
    const response = await fetch(url, {
      method: input.method.toUpperCase(),
      redirect: 'error',
      headers: {
        'X-API-Key': key,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      ...(input.body === undefined ? {} : { body: JSON.stringify(input.body) }),
      signal: AbortSignal.timeout(12000),
    });
    // Do not surface provider error text: it can contain sensitive diagnostics.
    if (!response.ok)
      return {
        status: response.status,
        ambiguous:
          response.status >= 500 || [408, 409].includes(response.status),
      };
    const raw = await response.text();
    if (raw.length > 2000000) return { status: 502, ambiguous: true };
    // Defensive redaction if an upstream unexpectedly echoes an authentication header.
    const data = JSON.parse(raw.split(key).join('[REDACTED]'));
    return { status: response.status, data };
  } catch {
    return { status: 502, ambiguous: true };
  }
}

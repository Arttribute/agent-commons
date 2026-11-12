import {
  BadGatewayException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';

export type VerifiedCharge = {
  id: number | string;
  domain: 'live' | 'test';
  reference: string;
  status: string;
  amount: number;
  currency: string;
  metadata: Record<string, unknown>;
};

export function validPaystackSignature(
  raw: Buffer,
  headers: { legacy?: string; modern?: string },
  key: string,
  signingSecret?: string,
  now = Date.now(),
) {
  const equal = (a: string, b: string) =>
    /^[a-f0-9]{128}$/i.test(b) &&
    timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
  if (headers.modern) {
    if (!signingSecret) return false;
    const fields = headers.modern.split(',').map((s) => s.trim());
    if (fields.filter((s) => s.startsWith('t=')).length !== 1) return false;
    const stamp = fields.find((s) => s.startsWith('t='))?.slice(2);
    if (
      !stamp ||
      !/^\d+$/.test(stamp) ||
      Math.abs(now / 1000 - Number(stamp)) > 300
    )
      return false;
    const expected = createHmac('sha512', signingSecret)
      .update(`${stamp}.`)
      .update(raw)
      .digest('hex');
    return fields
      .filter((s) => s.startsWith('v1='))
      .some((s) => equal(expected, s.slice(s.indexOf(':') + 1)));
  }
  return Boolean(
    headers.legacy &&
      equal(
        createHmac('sha512', key).update(raw).digest('hex'),
        headers.legacy,
      ),
  );
}

@Injectable()
export class PaystackService {
  async call<T>(key: string, path: string, input?: unknown): Promise<T> {
    try {
      const response = await fetch(`https://api.paystack.co${path}`, {
        method: input === undefined ? 'GET' : 'POST',
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
        },
        body: input === undefined ? undefined : JSON.stringify(input),
        signal: AbortSignal.timeout(15_000),
      });
      const result = (await response.json()) as { status: boolean; data: T };
      if (!response.ok || result.status !== true) {
        if (response.status === 401)
          throw new UnauthorizedException(
            'Paystack could not verify this account',
          );
        throw new BadGatewayException(
          'The payment service is unavailable. Please try again.',
        );
      }
      return result.data as T;
    } catch (error) {
      if (
        error instanceof UnauthorizedException ||
        error instanceof BadGatewayException
      )
        throw error;
      throw new BadGatewayException(
        'The payment service did not respond. Please try again.',
      );
    }
  }
  initialize(key: string, input: unknown) {
    return this.call<{ authorization_url: string; reference: string }>(
      key,
      '/transaction/initialize',
      input,
    );
  }
  verify(key: string, reference: string) {
    return this.call<VerifiedCharge>(
      key,
      `/transaction/verify/${encodeURIComponent(reference)}`,
    );
  }
}

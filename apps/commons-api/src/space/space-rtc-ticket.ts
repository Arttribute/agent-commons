import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Short-lived capability ticket authorizing one browser to join one space's
 * live RTC stream.
 *
 * The browser cannot present an identity JWT to the WebSocket directly (it
 * holds only a NextAuth session), so the authenticated REST layer mints a
 * signed ticket bound to {spaceId, userId, exp} after checking access, and the
 * gateway verifies the HMAC on connect. This mirrors the gateway-principal and
 * workflow-webhook capability patterns already used in the codebase.
 */

const TICKET_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface TicketPayload {
  spaceId: string;
  userId: string;
  exp: number;
}

function secret(): string {
  const s =
    process.env.SPACE_RTC_TICKET_SECRET ??
    process.env.COMMONS_GATEWAY_INTERNAL_SECRET ??
    process.env.APP_KEY;
  if (!s) {
    throw new Error(
      'SPACE_RTC_TICKET_SECRET (or COMMONS_GATEWAY_INTERNAL_SECRET / APP_KEY) must be set to issue space RTC tickets',
    );
  }
  return s;
}

function sign(data: string): string {
  return createHmac('sha256', secret()).update(data).digest('base64url');
}

/** Issue a ticket for a user to join a specific space. */
export function issueSpaceRtcTicket(spaceId: string, userId: string): string {
  const payload: TicketPayload = {
    spaceId,
    userId,
    exp: Date.now() + TICKET_TTL_MS,
  };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${body}.${sign(body)}`;
}

/**
 * Verify a ticket. Returns the payload if the signature is valid and it has
 * not expired, else null. Never throws on malformed input.
 */
export function verifySpaceRtcTicket(
  ticket: string | undefined,
): TicketPayload | null {
  if (!ticket || typeof ticket !== 'string') return null;
  const dot = ticket.lastIndexOf('.');
  if (dot <= 0) return null;
  const body = ticket.slice(0, dot);
  const providedSig = ticket.slice(dot + 1);

  let expectedSig: string;
  try {
    expectedSig = sign(body);
  } catch {
    return null;
  }
  const a = Buffer.from(providedSig);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const payload = JSON.parse(
      Buffer.from(body, 'base64url').toString('utf8'),
    ) as TicketPayload;
    if (!payload?.spaceId || !payload?.userId || !payload?.exp) return null;
    if (Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

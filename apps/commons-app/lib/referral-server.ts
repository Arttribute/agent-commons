import type { Session } from 'next-auth';
import { NextResponse, type NextRequest } from 'next/server';
import { auth } from '@/auth';
import { getAppBaseUrl } from './app-url';

export function referralAppBaseUrl() {
  const desktop = process.env.COMMONS_DESKTOP_SERVER === '1';
  const value = process.env.REFERRAL_APP_BASE_URL || (desktop
    ? process.env.COMMONS_DESKTOP_CLOUD_URL || 'https://www.agentcommons.io'
    : getAppBaseUrl());
  const url = new URL(value);
  // A native loopback server is never an address friends can use.
  if (desktop && (url.protocol !== 'https:' || /^(localhost|127\.|\[::1\])/.test(url.hostname))) {
    return 'https://www.agentcommons.io';
  }
  return url.origin;
}

export async function referralSession(request: NextRequest): Promise<{ session: Session | null; bearer: boolean }> {
  const session = await auth();
  if (session?.user?.id) return { session, bearer: false };
  const authorization = request.headers.get('authorization');
  const issuer = process.env.COMMONS_IDENTITY_ISSUER?.replace(/\/+$/, '');
  if (!issuer || !authorization?.startsWith('Bearer ')) return { session: null, bearer: false };
  try {
    // Native clients hold user tokens, never app service credentials. Identity
    // verifies signature, expiry and openid scope before returning this profile.
    const response = await fetch(`${issuer}/oauth2/userinfo`, {
      headers: { Authorization: authorization }, cache: 'no-store',
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) return { session: null, bearer: false };
    const user = await response.json();
    if (typeof user.sub !== 'string' || !/^usr_[A-Za-z0-9_-]+$/.test(user.sub)
      || user.email_verified !== true || typeof user.email !== 'string') {
      return { session: null, bearer: false };
    }
    return { bearer: true, session: {
      expires: new Date(Date.now() + 60_000).toISOString(),
      accessToken: authorization.slice(7),
      user: { id: user.sub, email: user.email, name: user.name, image: user.picture },
    } };
  } catch { return { session: null, bearer: false }; }
}

export async function forwardDesktopReferral(session: Session, path: '/api/referrals' | '/api/referrals/email', body?: { email: string }) {
  if (!session.accessToken || session.accessTokenError) {
    return NextResponse.json({ error: 'Sign in again to invite friends.' }, { status: 401 });
  }
  try {
    const response = await fetch(`${referralAppBaseUrl()}${path}`, {
      method: body ? 'POST' : 'GET', cache: 'no-store',
      headers: { Authorization: `Bearer ${session.accessToken}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(35_000),
    });
    const payload = await response.json();
    return NextResponse.json(payload, { status: response.status, headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ error: 'Invitations are temporarily unavailable. Try again shortly.' }, { status: 503 });
  }
}

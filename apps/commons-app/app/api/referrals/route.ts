import { NextResponse, type NextRequest } from 'next/server';
import { proxyBackend } from '@/lib/backend-proxy';
import { referralAppBaseUrl, referralSession, forwardDesktopReferral } from '@/lib/referral-server';

export async function GET(request: NextRequest) {
  const { session } = await referralSession(request);
  if (!session?.user?.id) return NextResponse.json({ error: 'Sign in to invite friends.' }, { status: 401 });
  if (process.env.COMMONS_DESKTOP_SERVER === '1') return forwardDesktopReferral(session, '/api/referrals');
  const response = await proxyBackend('/v1/referrals', { session, headers: session.user.email ? { 'x-referral-email': session.user.email } : {} });
  if (!response.ok) return response;
  const payload = await response.json();
  payload.data.url = `${referralAppBaseUrl()}/r/${payload.data.code}`;
  return NextResponse.json(payload, { headers: { 'Cache-Control': 'no-store' } });
}

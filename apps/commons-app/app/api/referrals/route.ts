import { NextResponse } from 'next/server';
import { proxyBackend } from '@/lib/backend-proxy';
import { getAppBaseUrl } from '@/lib/app-url';
import { auth } from '@/auth';

export async function GET() {
  const session = await auth();
  const response = await proxyBackend('/v1/referrals', { headers: session?.user?.email ? { 'x-referral-email': session.user.email } : {} });
  if (!response.ok) return response;
  const payload = await response.json();
  payload.data.url = `${getAppBaseUrl()}/r/${payload.data.code}`;
  return NextResponse.json(payload, { headers: { 'Cache-Control': 'no-store' } });
}

import { NextResponse, type NextRequest } from 'next/server';
import { REFERRAL_CODE_PATTERN, REFERRAL_COOKIE } from '@/lib/referrals';
import { auth } from '@/auth';

export async function GET(request: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  if (!REFERRAL_CODE_PATTERN.test(code)) return new NextResponse('Invitation not found', { status: 404 });
  const session = await auth();
  const response = NextResponse.redirect(new URL(session?.user?.id ? '/new' : '/login?callbackUrl=%2Fnew', request.url));
  response.headers.set('Cache-Control', 'no-store');
  // First invitation wins. HTTP-only attribution survives OAuth, verification
  // and password signup; existing signed-in users are never attributed.
  if (!session?.user?.id && !request.cookies.has(REFERRAL_COOKIE)) {
    response.cookies.set(REFERRAL_COOKIE, code, { httpOnly: true, secure: request.nextUrl.protocol === 'https:', sameSite: 'lax', path: '/', maxAge: 30 * 86400 });
  }
  return response;
}

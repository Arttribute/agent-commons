import { NextResponse, type NextRequest } from 'next/server';
import { auth } from '@/auth';
import { backendServiceAuthHeaders } from '@/lib/api-headers';
import { getAppBaseUrl } from '@/lib/app-url';
import { referralMessage } from '@/lib/referrals';

export async function POST(request: NextRequest) {
  // These server credentials can send email. Require both an account and a
  // same-origin browser request before touching Resend or reserving an invite.
  if (request.headers.get('origin') !== request.nextUrl.origin) return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 });
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Sign in to invite friends.' }, { status: 401 });
  const key = process.env.RESEND_API_KEY;
  const base = process.env.NEXT_PUBLIC_NEST_API_BASE_URL;
  if (!key || !base) return NextResponse.json({ error: 'Email invitations are temporarily unavailable.' }, { status: 503 });
  const body = await request.json().catch(() => null);
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (!email || email.length > 254 || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)) return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 });
  if (email === session.user.email?.trim().toLowerCase()) return NextResponse.json({ error: 'Invite a friend using a different email address.' }, { status: 400 });
  const service = await backendServiceAuthHeaders({ allowLegacyKey: false });
  if (!service.Authorization) return NextResponse.json({ error: 'Email invitations are temporarily unavailable.' }, { status: 503 });
  const headers = { ...service, 'Content-Type': 'application/json', 'x-initiator': session.user.id, 'x-owner-id': session.user.id };
  try {
    const reserved = await fetch(`${base}/v1/referrals/invitations`, { method: 'POST', headers, body: JSON.stringify({ email }), signal: AbortSignal.timeout(10_000) });
    const payload = await reserved.json();
    if (!reserved.ok) return NextResponse.json(payload, { status: reserved.status });
    const invite = payload.data;
    if (invite.alreadySent) return NextResponse.json({ message: 'You already invited this email address.' });
    const url = `${getAppBaseUrl()}/r/${invite.code}`;
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST', signal: AbortSignal.timeout(10_000),
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'Idempotency-Key': `referral/${invite.invitationId}` },
      body: JSON.stringify({
        from: process.env.REFERRAL_EMAIL_FROM || 'Agent Commons <hello@agentcommons.io>',
        to: [invite.email], subject: "You're invited to Agent Commons",
        text: `A friend invited you to Agent Commons.\n\n${referralMessage(url)}\n\nYour friend receives 1,000 credits when you create your Agent Commons account.\n\nThis invitation was requested by an Agent Commons member. You can ignore it if you are not interested.`,
        tags: [{ name: 'category', value: 'referral-invitation' }],
      }),
    });
    const sent = response.ok;
    const completed = await fetch(`${base}/v1/referrals/invitations/complete`, { method: 'POST', headers,
      body: JSON.stringify({ invitationId: invite.invitationId, sent }), signal: AbortSignal.timeout(10_000) });
    if (!completed.ok || !sent) return NextResponse.json({ error: 'Could not confirm delivery. Try again; your invitation will not be sent twice.' }, { status: 502 });
    return NextResponse.json({ message: 'Invitation sent.' }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ error: 'Could not confirm delivery. Try again; your invitation will not be sent twice.' }, { status: 502 });
  }
}

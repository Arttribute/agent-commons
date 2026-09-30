import { auth } from '@/auth';

const identityBase = process.env.COMMONS_IDENTITY_ISSUER?.replace(/\/api\/auth\/?$/, '');

async function profileRequest(method: 'GET' | 'PATCH', body?: unknown) {
  const session = await auth();
  if (!session?.user?.id || !session.accessToken || session.accessTokenError) return Response.json({ error: 'Sign in again to edit your profile.' }, { status: 401 });
  if (!identityBase) return Response.json({ error: 'Commons Identity is unavailable.' }, { status: 503 });
  const upstream = await fetch(`${identityBase}/api/identity/me/profile`, {
    method,
    headers: { Authorization: `Bearer ${session.accessToken}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  });
  return Response.json(await upstream.json().catch(() => ({})), { status: upstream.status });
}

export async function GET() { return profileRequest('GET'); }

export async function PATCH(request: Request) {
  const input = await request.json().catch(() => ({}));
  return profileRequest('PATCH', { name: input.name, ...(Object.prototype.hasOwnProperty.call(input, 'imageUrl') ? { imageUrl: input.imageUrl } : {}) });
}

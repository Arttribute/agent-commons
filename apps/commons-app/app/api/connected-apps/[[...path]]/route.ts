import { NextResponse } from 'next/server';
import { requireCurrentCommonsUser } from '@/lib/current-user';
import { backendAuthHeaders } from '@/lib/api-headers';

async function proxy(request: Request, context: { params: Promise<{ path?: string[] }> }) {
  const { user, response } = await requireCurrentCommonsUser();
  if (response) return response;
  const { path = [] } = await context.params;
  const base = process.env.NEST_API_BASE_URL || process.env.NEXT_PUBLIC_NEST_API_BASE_URL || process.env.AGENT_COMMONS_API_URL || process.env.NEXT_PUBLIC_AGENT_COMMONS_API_URL;
  if (!base) return NextResponse.json({ message: 'Connected apps are unavailable.' }, { status: 503 });
  const upstream = await fetch(`${base.replace(/\/$/, '')}/v1/connected-apps${path.length ? `/${path.map(encodeURIComponent).join('/')}` : ''}${new URL(request.url).search}`, { method: request.method, headers: { ...await backendAuthHeaders(), 'x-initiator': user!.userId, 'Content-Type': 'application/json' }, body: request.method === 'POST' ? await request.text() : undefined, cache: 'no-store' });
  return NextResponse.json(await upstream.json(), { status: upstream.status });
}
export const GET = proxy;
export const POST = proxy;

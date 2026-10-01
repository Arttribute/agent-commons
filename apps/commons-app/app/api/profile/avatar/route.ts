import { auth } from '@/auth';

const identityBase = process.env.COMMONS_IDENTITY_ISSUER?.replace(/\/api\/auth\/?$/, '');
const apiBase = process.env.NEXT_PUBLIC_NEST_API_BASE_URL?.replace(/\/$/, '');

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id || !session.accessToken || session.accessTokenError) return Response.json({ error: 'Sign in again to edit your profile.' }, { status: 401 });
  if (!identityBase || !apiBase) return Response.json({ error: 'Profile images are unavailable.' }, { status: 503 });
  const form = await request.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File) || file.size < 1 || file.size > 2 * 1024 * 1024) return Response.json({ error: 'Choose an image under 2 MB.' }, { status: 400 });
  const upload = new FormData();
  upload.append('file', file);
  const uploaded = await fetch(`${apiBase}/v1/files/profile-avatar`, { method: 'POST', headers: { Authorization: `Bearer ${session.accessToken}` }, body: upload });
  const uploadBody = await uploaded.json().catch(() => ({}));
  if (!uploaded.ok || typeof uploadBody?.data?.url !== 'string') return Response.json(uploadBody, { status: uploaded.status });
  const saved = await fetch(`${identityBase}/api/identity/me/profile`, {
    method: 'PATCH', headers: { Authorization: `Bearer ${session.accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageUrl: uploadBody.data.url }), cache: 'no-store',
  });
  return Response.json(await saved.json().catch(() => ({})), { status: saved.status });
}

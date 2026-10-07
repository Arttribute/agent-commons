import { NextResponse } from 'next/server';

/** Staging desktop builds use the staging API through this keyless proxy. */
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get('q');
  if (!q?.trim() || q.length > 500) return NextResponse.json({ error: 'Provide a search query between 1 and 500 characters.' }, { status: 400 });
  const base = process.env.NEST_API_BASE_URL || process.env.NEXT_PUBLIC_NEST_API_BASE_URL;
  if (!base) return NextResponse.json({ error: 'Search is temporarily unavailable.' }, { status: 503 });
  const url = new URL(`${base.replace(/\/$/, '')}/v1/desktop-search/search`);
  url.searchParams.set('q', q.trim());
  try {
    const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(15_000) });
    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch { return NextResponse.json({ error: 'Search is temporarily unavailable.' }, { status: 503 }); }
}

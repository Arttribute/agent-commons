import { NextResponse } from 'next/server';
import { readDesktopSession } from '@/lib/desktop-session';

export async function GET(request: Request) {
  const capability = process.env.COMMONS_DESKTOP_MAIN_TOKEN;
  if (process.env.COMMONS_DESKTOP_SERVER !== '1' || !capability || request.headers.get('x-commons-desktop-main') !== capability) return NextResponse.json({error:'Not found'}, {status:404});
  const version = (process.env.COMMONS_AUTH_SESSION_VERSION || 'v2').replace(/[^a-zA-Z0-9_-]/g, '-');
  const session = process.env.AUTH_SECRET ? await readDesktopSession(request.headers, process.env.AUTH_SECRET, version) : null;
  return NextResponse.json(session, {headers:{'Cache-Control':'private, no-store'}});
}

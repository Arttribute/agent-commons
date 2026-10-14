import { getToken } from 'next-auth/jwt';

/** Decode the authenticated local cookie without rotating it or refreshing
 * cloud tokens. Identity verification must never recreate a signed-out cookie. */
export async function readDesktopSession(headers: Headers, secret: string, version: string) {
  const cookieName = `authjs.agent-commons.session-token.${version}`;
  const token = await getToken({ req: { headers }, secret, cookieName, salt: cookieName });
  const id = token?.identityUserId ?? token?.sub;
  if (!token || typeof id !== 'string' || !id || id.length > 256 || token.authSessionVersion !== version) return null;
  return { user: { id, name: typeof token.name === 'string' ? token.name : null, email: typeof token.email === 'string' ? token.email : null, image: typeof token.picture === 'string' ? token.picture : null } };
}

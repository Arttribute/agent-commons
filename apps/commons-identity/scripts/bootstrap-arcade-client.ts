import { writeFile } from 'node:fs/promises';
import { pool } from '../lib/db';
import { ensureOAuthClient } from '../lib/oauth-client-store';

/** Run with identity DATABASE_URL. The output contains one-time secrets; never log it. */
async function main() {
  const outputPath = process.env.ARCADE_CLIENT_OUTPUT;
  if (!outputPath) throw new Error('Set ARCADE_CLIENT_OUTPUT to a secure destination for the client credentials.');
  const origin = process.env.ARCADE_WEB_URL ?? 'https://arcade.agentcommons.io';
  const web = await ensureOAuthClient(pool, {
    name: 'Common Arcade', clientUri: origin,
    redirectUris: [`${origin}/api/auth/callback`, 'https://common-arcade.vercel.app/api/auth/callback', 'http://localhost:3000/api/auth/callback'],
    postLogoutRedirectUris: [origin], grantTypes: ['authorization_code', 'refresh_token'],
    requirePkce: true, skipConsent: false,
    scopes: ['openid', 'profile', 'email', 'offline_access', 'agents:read', 'agents:write', 'agents:run'],
    metadata: { application: 'common_arcade' },
  });
  await writeFile(outputPath, JSON.stringify({ web }), { mode: 0o600 });
  console.log('Arcade OAuth client configured. Credentials written to the requested secure file.');
  await pool.end();
}
main().catch(error => { console.error(error instanceof Error ? error.message : 'Client provisioning failed'); process.exitCode = 1; });

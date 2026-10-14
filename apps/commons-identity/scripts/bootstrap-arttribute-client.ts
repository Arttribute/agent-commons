import { writeFile } from 'node:fs/promises';
import { pool } from '../lib/db';
import { ensureOAuthClient } from '../lib/oauth-client-store';

/**
 * Registers arttribute.io as a first-party client so its admin console can
 * sign people in with Commons. It only reads the profile and email; it asks
 * for no platform scopes.
 *
 * Run with the identity DATABASE_URL. The output holds a one-time secret;
 * never log it.
 */
async function main() {
  const outputPath = process.env.ARTTRIBUTE_CLIENT_OUTPUT;
  if (!outputPath) throw new Error('Set ARTTRIBUTE_CLIENT_OUTPUT to a secure destination for the client credentials.');
  const origin = process.env.ARTTRIBUTE_WEB_URL ?? 'https://www.arttribute.io';
  const web = await ensureOAuthClient(pool, {
    name: 'Arttribute',
    clientUri: origin,
    redirectUris: [`${origin}/api/auth/callback`, 'http://localhost:3000/api/auth/callback'],
    postLogoutRedirectUris: [origin],
    grantTypes: ['authorization_code', 'refresh_token'],
    requirePkce: true,
    skipConsent: true,
    scopes: ['openid', 'profile', 'email'],
    metadata: { application: 'arttribute_site' },
  });
  await writeFile(outputPath, JSON.stringify({ web }), { mode: 0o600 });
  console.log(
    web.existing
      ? 'Arttribute OAuth client already existed and was updated. Its secret is not recoverable; use the stored one.'
      : 'Arttribute OAuth client created. Credentials written to the requested secure file.',
  );
  await pool.end();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Client provisioning failed');
  process.exitCode = 1;
});

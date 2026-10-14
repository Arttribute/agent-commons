import { createHmac, randomUUID } from 'node:crypto';

// A liveness response alone missed the metering outage: every data request
// waited on the shared pool. Exercise the reads behind the main app sections.
const base = process.argv[2];
if (!base) throw new Error('Usage: node smoke-data-routes.mjs <internal-api-url>');
const actor = randomUUID();
const paths = [
  `/v1/agents?owner=${actor}`,
  `/v1/sessions/user/${actor}`,
  '/v1/knowledge',
  '/v1/library',
  '/v1/models',
];

for (const path of paths) {
  const headers = { 'x-owner-id': actor, 'x-initiator': actor };
  const secret = process.env.COMMONS_GATEWAY_INTERNAL_SECRET;
  if (secret) {
    Object.assign(headers, {
      'x-commons-timestamp': String(Math.floor(Date.now() / 1000)),
      'x-commons-request-id': randomUUID(),
      'x-commons-actor-id': actor,
      'x-commons-actor-type': 'service',
      'x-commons-workspace-id': '',
      'x-commons-project-id': '',
      'x-commons-scopes': 'agents:read activity:read',
    });
    headers['x-commons-signature'] = createHmac('sha256', secret)
      .update([
        headers['x-commons-timestamp'], 'GET', path.split('?')[0],
        ...['request-id', 'actor-id', 'actor-type', 'workspace-id', 'project-id', 'scopes']
          .map((name) => headers[`x-commons-${name}`]),
      ].join('\n'))
      .digest('base64url');
  } else if (process.env.API_SECRET_KEY) {
    headers.Authorization = `Bearer ${process.env.API_SECRET_KEY}`;
  } else {
    throw new Error('Data route probe requires internal authentication');
  }
  const start = Date.now();
  const response = await fetch(`${base.replace(/\/$/, '')}${path}`, {
    headers,
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  const data = await response.json();
  if (!data || typeof data !== 'object') throw new Error(`${path}: invalid JSON response`);
  console.log(`${path.split('?')[0]}: HTTP ${response.status} (${Date.now() - start}ms)`);
}

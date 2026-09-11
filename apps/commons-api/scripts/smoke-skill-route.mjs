import { createHmac, randomUUID } from 'node:crypto';

// Probe the real authenticated route with a deliberately nonexistent agent.
// A healthy service returns the domain's "Agent not found", never "Cannot PUT".
// No agent or assignment is created or changed by this check.
const base = process.argv[2];
if (!base)
  throw new Error('Usage: node smoke-skill-route.mjs <internal-api-url>');
const path = `/v1/skills/build-common-arcade-games/agents/${randomUUID()}`;
const headers = { 'Content-Type': 'application/json' };
const secret = process.env.COMMONS_GATEWAY_INTERNAL_SECRET;
if (secret) {
  Object.assign(headers, {
    'x-commons-timestamp': String(Math.floor(Date.now() / 1000)),
    'x-commons-request-id': randomUUID(),
    'x-commons-actor-id': 'deployment-skill-route-probe',
    'x-commons-actor-type': 'service',
    'x-commons-workspace-id': '',
    'x-commons-project-id': '',
    'x-commons-scopes': '',
  });
  headers['x-commons-signature'] = createHmac('sha256', secret)
    .update(
      [
        headers['x-commons-timestamp'],
        'PUT',
        path,
        ...[
          'request-id',
          'actor-id',
          'actor-type',
          'workspace-id',
          'project-id',
          'scopes',
        ].map((name) => headers[`x-commons-${name}`]),
      ].join('\n'),
    )
    .digest('base64url');
} else if (process.env.API_SECRET_KEY) {
  headers.Authorization = `Bearer ${process.env.API_SECRET_KEY}`;
} else {
  throw new Error('Skill route probe requires internal authentication');
}
const response = await fetch(`${base.replace(/\/$/, '')}${path}`, {
  method: 'PUT',
  headers,
  body: JSON.stringify({ isEnabled: true }),
  signal: AbortSignal.timeout(30_000),
});
const body = await response.json();
if (response.status !== 404 || body.message !== 'Agent not found') {
  throw new Error(
    `Skill assignment route probe failed: HTTP ${response.status}; ${JSON.stringify(body)}`,
  );
}
console.log(
  'Skill assignment route is deployed and authenticated; nonexistent agent rejected correctly.',
);

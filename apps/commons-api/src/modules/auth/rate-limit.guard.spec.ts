import { RateLimitGuard } from './rate-limit.guard';

const agentA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const agentB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const context = (request: any): any => ({
  getHandler: () => function makeAgentToolCall() {},
  getClass: () => class AgentToolsController {},
  switchToHttp: () => ({ getRequest: () => request }),
});
const request = (agentId: string, secret: any = 'fixture-internal-secret') => ({
  path: '/v1/agents/tools',
  ip: '127.0.0.1',
  body: { metadata: { agentId } },
  headers: { 'x-internal-tool-secret': secret },
});

describe('internal tool rate-limit identities', () => {
  const originalKey = process.env.API_SECRET_KEY;
  const originalDistributed = process.env.DISTRIBUTED_RATE_LIMIT_ENABLED;
  let guard: RateLimitGuard;
  beforeEach(() => {
    process.env.API_SECRET_KEY = 'fixture-internal-secret';
    process.env.DISTRIBUTED_RATE_LIMIT_ENABLED = 'false';
    guard = new RateLimitGuard(
      {
        getAllAndOverride: () => ({
          limit: 1,
          windowMs: 60000,
          keyStrategy: 'agent',
        }),
      } as any,
      {} as any,
    );
  });
  afterEach(() => {
    guard.onModuleDestroy();
    if (originalKey === undefined) delete process.env.API_SECRET_KEY;
    else process.env.API_SECRET_KEY = originalKey;
    if (originalDistributed === undefined)
      delete process.env.DISTRIBUTED_RATE_LIMIT_ENABLED;
    else process.env.DISTRIBUTED_RATE_LIMIT_ENABLED = originalDistributed;
  });
  it('isolates server-authenticated agents on the same localhost transport', async () => {
    expect(await guard.canActivate(context(request(agentA)))).toBe(true);
    expect(await guard.canActivate(context(request(agentB)))).toBe(true);
    await expect(
      guard.canActivate(context(request(agentA))),
    ).rejects.toMatchObject({ status: 429 });
  });
  it.each([undefined, 'invalid', ['fixture-internal-secret']])(
    'does not trust metadata with invalid internal authentication: %j',
    async (secret) => {
      const a = request(agentA, secret);
      const b = request(agentB, secret);
      // Passing undefined explicitly must omit the header, not trigger the helper default.
      a.headers['x-internal-tool-secret'] = secret;
      b.headers['x-internal-tool-secret'] = secret;
      expect(await guard.canActivate(context(a))).toBe(true);
      await expect(guard.canActivate(context(b))).rejects.toMatchObject({
        status: 429,
      });
    },
  );
  it('does not trust an internal header on another route or malformed agent identities', async () => {
    const a = { ...request(agentA), path: '/v1/agents/run' };
    const b = { ...request(agentB), path: '/v1/agents/run' };
    expect(await guard.canActivate(context(a))).toBe(true);
    await expect(guard.canActivate(context(b))).rejects.toMatchObject({
      status: 429,
    });
  });
  it('does not trust malformed metadata even with valid server authentication', async () => {
    await expect(
      guard.canActivate(context(request('rotate-metadata'))),
    ).resolves.toBe(true);
    await expect(
      guard.canActivate(context(request('another-fake-id'))),
    ).rejects.toMatchObject({ status: 429 });
  });
  it('keeps ordinary authenticated user limits independent of caller-supplied agent fields', async () => {
    const a = {
      ...request(agentA, 'invalid'),
      principal: { principalId: 'user-A' },
    };
    const b = {
      ...request(agentB, 'invalid'),
      principal: { principalId: 'user-A' },
    };
    expect(await guard.canActivate(context(a))).toBe(true);
    await expect(guard.canActivate(context(b))).rejects.toMatchObject({
      status: 429,
    });
    expect(
      await guard.canActivate(
        context({ ...b, principal: { principalId: 'user-B' } }),
      ),
    ).toBe(true);
  });
});

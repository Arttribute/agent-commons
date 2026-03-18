import { CommonsClient, CommonsError } from './client';

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeFetch(body: unknown, status = 200) {
  return jest.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    json: jest.fn().mockResolvedValue(body),
    body: null,
  });
}

function makeClient(fetch: jest.Mock) {
  return new CommonsClient({ baseUrl: 'http://api.test', apiKey: 'test-key', fetch: fetch as any });
}

// ── CommonsClient construction ─────────────────────────────────────────────────

describe('CommonsClient', () => {
  it('strips trailing slash from baseUrl', async () => {
    const fetch = makeFetch({ data: [] });
    const client = new CommonsClient({ baseUrl: 'http://api.test/', apiKey: 'k', fetch: fetch as any });
    await client.agents.list();
    expect(fetch.mock.calls[0][0]).toBe('http://api.test/v1/agents');
  });

  it('sends Authorization and Content-Type headers', async () => {
    const fetch = makeFetch({ data: [] });
    const client = makeClient(fetch);
    await client.agents.list();
    const headers = fetch.mock.calls[0][1].headers;
    expect(headers['Authorization']).toBe('Bearer test-key');
    expect(headers['Content-Type']).toBe('application/json');
  });

  it('sends x-initiator header when configured', async () => {
    const fetch = makeFetch({ data: [] });
    const client = new CommonsClient({ baseUrl: 'http://api.test', initiator: 'user-1', fetch: fetch as any });
    await client.agents.list();
    expect(fetch.mock.calls[0][1].headers['x-initiator']).toBe('user-1');
  });

  it('throws CommonsError on non-ok response', async () => {
    const fetch = makeFetch({ message: 'Not found' }, 404);
    const client = makeClient(fetch);
    await expect(client.agents.get('missing')).rejects.toBeInstanceOf(CommonsError);
    await expect(client.agents.get('missing')).rejects.toMatchObject({ status: 404 });
  });
});

// ── agents ────────────────────────────────────────────────────────────────────

describe('client.agents', () => {
  const agent = { agentId: 'a1', name: 'Test Agent', modelProvider: 'openai', modelId: 'gpt-4o', createdAt: '' };

  it('list — GET /v1/agents', async () => {
    const fetch = makeFetch({ data: [agent] });
    const { data } = await makeClient(fetch).agents.list();
    expect(fetch).toHaveBeenCalledWith('http://api.test/v1/agents', expect.objectContaining({ method: 'GET' }));
    expect(data).toHaveLength(1);
    expect(data[0].agentId).toBe('a1');
  });

  it('list with owner — GET /v1/agents?owner=…', async () => {
    const fetch = makeFetch({ data: [] });
    await makeClient(fetch).agents.list('user-1');
    expect(fetch.mock.calls[0][0]).toBe('http://api.test/v1/agents?owner=user-1');
  });

  it('get — GET /v1/agents/:id', async () => {
    const fetch = makeFetch({ data: agent });
    const { data } = await makeClient(fetch).agents.get('a1');
    expect(fetch.mock.calls[0][0]).toBe('http://api.test/v1/agents/a1');
    expect(data.agentId).toBe('a1');
  });

  it('create — POST /v1/agents with body', async () => {
    const fetch = makeFetch({ data: agent });
    await makeClient(fetch).agents.create({ name: 'New Agent' });
    const [url, opts] = fetch.mock.calls[0];
    expect(url).toBe('http://api.test/v1/agents');
    expect(opts.method).toBe('POST');
    expect(JSON.parse(opts.body)).toMatchObject({ name: 'New Agent' });
  });

  it('update — PUT /v1/agents/:id', async () => {
    const fetch = makeFetch({ data: agent });
    await makeClient(fetch).agents.update('a1', { name: 'Renamed' });
    const [url, opts] = fetch.mock.calls[0];
    expect(url).toBe('http://api.test/v1/agents/a1');
    expect(opts.method).toBe('PUT');
  });
});

// ── sessions ──────────────────────────────────────────────────────────────────

describe('client.sessions', () => {
  const session = { sessionId: 's1', agentId: 'a1', initiator: 'user-1', model: {} as any, createdAt: '' };

  it('list — GET /v1/sessions/list/:agentId/:initiatorId', async () => {
    const fetch = makeFetch({ data: [session] });
    await makeClient(fetch).sessions.list('a1', 'user-1');
    expect(fetch.mock.calls[0][0]).toBe('http://api.test/v1/sessions/list/a1/user-1');
  });

  it('create — POST /v1/sessions', async () => {
    const fetch = makeFetch({ data: session });
    await makeClient(fetch).sessions.create({ agentId: 'a1', initiator: 'user-1' });
    const [url, opts] = fetch.mock.calls[0];
    expect(url).toBe('http://api.test/v1/sessions');
    expect(opts.method).toBe('POST');
  });

  it('getFull — GET /v1/sessions/:id/full', async () => {
    const fetch = makeFetch({ data: session });
    await makeClient(fetch).sessions.getFull('s1');
    expect(fetch.mock.calls[0][0]).toBe('http://api.test/v1/sessions/s1/full');
  });
});

// ── tasks ─────────────────────────────────────────────────────────────────────

describe('client.tasks', () => {
  const task = { taskId: 't1', agentId: 'a1', sessionId: 's1', title: 'T', status: 'pending' as const, executionMode: 'single' as const, createdBy: 'user-1', createdByType: 'user' as const, createdAt: '' };

  it('list — GET /v1/tasks with filter params', async () => {
    const fetch = makeFetch({ data: [task] });
    await makeClient(fetch).tasks.list({ agentId: 'a1', sessionId: 's1' });
    const url: string = fetch.mock.calls[0][0];
    expect(url).toContain('/v1/tasks');
    expect(url).toContain('agentId=a1');
    expect(url).toContain('sessionId=s1');
  });

  it('execute — POST /v1/tasks/:id/execute', async () => {
    const fetch = makeFetch({ success: true, data: {} });
    await makeClient(fetch).tasks.execute('t1');
    expect(fetch.mock.calls[0][0]).toBe('http://api.test/v1/tasks/t1/execute');
    expect(fetch.mock.calls[0][1].method).toBe('POST');
  });

  it('cancel — POST /v1/tasks/:id/cancel', async () => {
    const fetch = makeFetch({ success: true });
    await makeClient(fetch).tasks.cancel('t1');
    expect(fetch.mock.calls[0][0]).toBe('http://api.test/v1/tasks/t1/cancel');
  });

  it('delete — DELETE /v1/tasks/:id', async () => {
    const fetch = makeFetch({ success: true });
    await makeClient(fetch).tasks.delete('t1');
    expect(fetch.mock.calls[0][1].method).toBe('DELETE');
  });
});

// ── workflows ─────────────────────────────────────────────────────────────────

describe('client.workflows', () => {
  const wf = { workflowId: 'wf1', name: 'WF', definition: { nodes: [], edges: [] }, ownerId: 'user-1', ownerType: 'user' as const, createdAt: '' };

  it('create — POST /v1/workflows', async () => {
    const fetch = makeFetch(wf);
    await makeClient(fetch).workflows.create({ name: 'WF', definition: { nodes: [], edges: [] }, ownerId: 'user-1', ownerType: 'user' });
    expect(fetch.mock.calls[0][1].method).toBe('POST');
    expect(fetch.mock.calls[0][0]).toBe('http://api.test/v1/workflows');
  });

  it('execute — POST /v1/workflows/:id/execute', async () => {
    const fetch = makeFetch({ executionId: 'ex1', workflowId: 'wf1', status: 'running', startedAt: '' });
    await makeClient(fetch).workflows.execute('wf1', { agentId: 'a1' });
    expect(fetch.mock.calls[0][0]).toBe('http://api.test/v1/workflows/wf1/execute');
    expect(fetch.mock.calls[0][1].method).toBe('POST');
  });

  it('approveExecution — POST /v1/workflows/:id/executions/:eid/approve', async () => {
    const fetch = makeFetch({ success: true, executionId: 'ex1', action: 'approved' });
    await makeClient(fetch).workflows.approveExecution('wf1', 'ex1', { approvalToken: 'tok' });
    expect(fetch.mock.calls[0][0]).toBe('http://api.test/v1/workflows/wf1/executions/ex1/approve');
  });

  it('rejectExecution — POST /v1/workflows/:id/executions/:eid/reject', async () => {
    const fetch = makeFetch({ success: true, executionId: 'ex1', action: 'rejected' });
    await makeClient(fetch).workflows.rejectExecution('wf1', 'ex1', { approvalToken: 'tok', reason: 'No' });
    expect(fetch.mock.calls[0][0]).toBe('http://api.test/v1/workflows/wf1/executions/ex1/reject');
  });
});

// ── tools ─────────────────────────────────────────────────────────────────────

describe('client.tools', () => {
  it('list — GET /v1/tools with optional filter', async () => {
    const fetch = makeFetch({ data: [] });
    await makeClient(fetch).tools.list({ agentId: 'a1' });
    expect(fetch.mock.calls[0][0]).toContain('/v1/tools');
    expect(fetch.mock.calls[0][0]).toContain('agentId=a1');
  });

  it('listStatic — GET /v1/tools/static', async () => {
    const fetch = makeFetch({ data: [] });
    await makeClient(fetch).tools.listStatic();
    expect(fetch.mock.calls[0][0]).toBe('http://api.test/v1/tools/static');
  });

  it('delete — DELETE /v1/tools/:id', async () => {
    const fetch = makeFetch({ success: true });
    await makeClient(fetch).tools.delete('tool-1');
    expect(fetch.mock.calls[0][1].method).toBe('DELETE');
    expect(fetch.mock.calls[0][0]).toBe('http://api.test/v1/tools/tool-1');
  });
});

// ── skills ────────────────────────────────────────────────────────────────────

describe('client.skills', () => {
  it('list — GET /v1/skills', async () => {
    const fetch = makeFetch({ data: [] });
    await makeClient(fetch).skills.list();
    expect(fetch.mock.calls[0][0]).toBe('http://api.test/v1/skills');
  });

  it('list with isPublic filter', async () => {
    const fetch = makeFetch({ data: [] });
    await makeClient(fetch).skills.list({ isPublic: true });
    expect(fetch.mock.calls[0][0]).toContain('isPublic=true');
  });

  it('get — GET /v1/skills/:slug', async () => {
    const fetch = makeFetch({ data: {} });
    await makeClient(fetch).skills.get('web-research');
    expect(fetch.mock.calls[0][0]).toBe('http://api.test/v1/skills/web-research');
  });

  it('create — POST /v1/skills', async () => {
    const fetch = makeFetch({ data: {} });
    await makeClient(fetch).skills.create({ slug: 'my-skill', name: 'My Skill', description: 'd', instructions: 'i' });
    expect(fetch.mock.calls[0][1].method).toBe('POST');
  });

  it('delete — DELETE /v1/skills/:slug', async () => {
    const fetch = makeFetch({ deleted: true });
    await makeClient(fetch).skills.delete('my-skill');
    expect(fetch.mock.calls[0][1].method).toBe('DELETE');
  });
});

// ── memory ────────────────────────────────────────────────────────────────────

describe('client.memory', () => {
  it('list — GET /v1/memory/agents/:agentId', async () => {
    const fetch = makeFetch({ data: [] });
    await makeClient(fetch).memory.list('a1');
    expect(fetch.mock.calls[0][0]).toBe('http://api.test/v1/memory/agents/a1');
  });

  it('list with type filter', async () => {
    const fetch = makeFetch({ data: [] });
    await makeClient(fetch).memory.list('a1', { type: 'episodic', limit: 10 });
    const url: string = fetch.mock.calls[0][0];
    expect(url).toContain('type=episodic');
    expect(url).toContain('limit=10');
  });

  it('stats — GET /v1/memory/agents/:agentId/stats', async () => {
    const fetch = makeFetch({ data: { total: 0, episodic: 0, semantic: 0, procedural: 0, avgImportance: 0 } });
    await makeClient(fetch).memory.stats('a1');
    expect(fetch.mock.calls[0][0]).toBe('http://api.test/v1/memory/agents/a1/stats');
  });

  it('create — POST /v1/memory', async () => {
    const fetch = makeFetch({ data: {} });
    await makeClient(fetch).memory.create({ agentId: 'a1', content: 'c', summary: 's' });
    expect(fetch.mock.calls[0][1].method).toBe('POST');
    expect(fetch.mock.calls[0][0]).toBe('http://api.test/v1/memory');
  });

  it('delete — DELETE /v1/memory/:id', async () => {
    const fetch = makeFetch(undefined);
    await makeClient(fetch).memory.delete('mem-1');
    expect(fetch.mock.calls[0][1].method).toBe('DELETE');
  });
});

// ── usage ─────────────────────────────────────────────────────────────────────

describe('client.usage', () => {
  const agg = { totalInputTokens: 100, totalOutputTokens: 50, totalTokens: 150, totalCostUsd: 0.001, callCount: 2, events: [] };

  it('getAgentUsage — GET /v1/usage/agents/:agentId', async () => {
    const fetch = makeFetch({ data: agg });
    const { data } = await makeClient(fetch).usage.getAgentUsage('a1');
    expect(fetch.mock.calls[0][0]).toBe('http://api.test/v1/usage/agents/a1');
    expect(data.callCount).toBe(2);
  });

  it('getAgentUsage with date range', async () => {
    const fetch = makeFetch({ data: agg });
    await makeClient(fetch).usage.getAgentUsage('a1', { from: '2026-01-01', to: '2026-03-01' });
    const url: string = fetch.mock.calls[0][0];
    expect(url).toContain('from=2026-01-01');
    expect(url).toContain('to=2026-03-01');
  });

  it('getSessionUsage — GET /v1/usage/sessions/:sessionId', async () => {
    const fetch = makeFetch({ data: agg });
    await makeClient(fetch).usage.getSessionUsage('s1');
    expect(fetch.mock.calls[0][0]).toBe('http://api.test/v1/usage/sessions/s1');
  });
});

// ── a2a ───────────────────────────────────────────────────────────────────────

describe('client.a2a', () => {
  const message = { role: 'user' as const, parts: [{ type: 'text' as const, text: 'hi' }] };

  it('sendTask — POST /v1/a2a/:agentId with JSON-RPC envelope', async () => {
    const fetch = makeFetch({ result: { id: 'task-1', status: { state: 'completed' } } });
    await makeClient(fetch).a2a.sendTask('a1', { message });
    const [url, opts] = fetch.mock.calls[0];
    expect(url).toBe('http://api.test/v1/a2a/a1');
    expect(opts.method).toBe('POST');
    const body = JSON.parse(opts.body);
    expect(body.jsonrpc).toBe('2.0');
    expect(body.method).toBe('tasks/send');
  });

  it('cancelTask — POST /v1/a2a/:agentId with tasks/cancel method', async () => {
    const fetch = makeFetch({ result: { id: 'task-1', status: { state: 'canceled' } } });
    await makeClient(fetch).a2a.cancelTask('a1', 'task-1');
    const body = JSON.parse(fetch.mock.calls[0][1].body);
    expect(body.method).toBe('tasks/cancel');
  });
});

// ── CommonsError ──────────────────────────────────────────────────────────────

describe('CommonsError', () => {
  it('has correct name, status, and message', () => {
    const err = new CommonsError('Not found', 404, { code: 'NOT_FOUND' });
    expect(err.name).toBe('CommonsError');
    expect(err.message).toBe('Not found');
    expect(err.status).toBe(404);
    expect(err.data).toEqual({ code: 'NOT_FOUND' });
  });

  it('is instanceof Error', () => {
    expect(new CommonsError('x', 500)).toBeInstanceOf(Error);
  });
});

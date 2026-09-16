import { ServiceUnavailableException } from '@nestjs/common';
import { ArcadeError, ArcadeService } from './arcade.service';
import { resetCommonsServiceToken } from './commons-service-token';

type Call = { url: string; init: RequestInit };

const project = (overrides: Record<string, unknown> = {}) => ({
  id: 'prj_abc123',
  ownerId: 'usr_creator',
  revision: 3,
  digest: 'sha256:0000',
  createdAt: '2026-09-16T00:00:00.000Z',
  updatedAt: '2026-09-16T00:00:00.000Z',
  document: {
    kind: 'browser',
    title: 'Untitled game',
    description: '',
    entryFile: 'index.html',
    files: [
      { path: 'index.html', content: '<html></html>' },
      { path: 'old.js', content: '// old' },
    ],
  },
  ...overrides,
});

const json = (status: number, body: unknown) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    text: async () => (body === undefined ? '' : JSON.stringify(body)),
    json: async () => body,
  }) as unknown as Response;

describe('ArcadeService', () => {
  const originalFetch = global.fetch;
  const originalEnv = { ...process.env };
  const db = { query: { agent: { findFirst: jest.fn() } } } as any;
  let calls: Call[];
  let replies: Response[];

  beforeEach(() => {
    resetCommonsServiceToken();
    process.env.COMMONS_IDENTITY_ISSUER = 'https://identity.test';
    process.env.AGENT_COMMONS_SERVICE_CLIENT_ID = 'svc-client';
    process.env.AGENT_COMMONS_SERVICE_CLIENT_SECRET = 'svc-secret';
    process.env.ARCADE_API_URL = 'https://arcade.test/api/arcade';
    process.env.ARCADE_WEB_URL = 'https://arcade.test';
    calls = [];
    replies = [];
    global.fetch = jest.fn(async (url: any, init: any) => {
      const target = String(url);
      if (target.endsWith('/oauth2/token')) {
        return json(200, { access_token: 'service-jwt', expires_in: 600 });
      }
      calls.push({ url: target, init });
      const reply = replies.shift();
      if (!reply) throw new Error(`Unexpected Arcade call: ${target}`);
      return reply;
    }) as any;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    process.env = { ...originalEnv };
  });

  const headers = (call: Call) => call.init.headers as Record<string, string>;

  it('acts as the creator through the platform service identity', async () => {
    replies.push(json(200, { projects: [project()] }));
    const projects = await new ArcadeService(db).listProjects('usr_creator');

    expect(calls[0].url).toBe('https://arcade.test/api/arcade/v1/projects');
    expect(headers(calls[0]).Authorization).toBe('Bearer service-jwt');
    expect(headers(calls[0])['X-Commons-Actor']).toBe('usr_creator');
    expect(projects[0]).toMatchObject({
      projectId: 'prj_abc123',
      studioUrl: 'https://arcade.test/studio/prj_abc123',
    });
  });

  it('builds in the agent owner account, preferring the user id', async () => {
    const service = new ArcadeService(db);
    db.query.agent.findFirst
      .mockResolvedValueOnce({ ownerUserId: 'usr_creator', owner: 'legacy' })
      .mockResolvedValueOnce({ ownerUserId: null, owner: 'legacy' })
      .mockResolvedValueOnce({ ownerUserId: null, owner: null });
    await expect(service.actorForAgent('a')).resolves.toBe('usr_creator');
    await expect(service.actorForAgent('b')).resolves.toBe('legacy');
    await expect(service.actorForAgent('c')).rejects.toThrow(/no owner account/);
  });

  it('merges written files onto the current document at its revision', async () => {
    replies.push(json(200, project()), json(200, project({ revision: 4 })));
    await new ArcadeService(db).writeGame('usr_creator', 'prj_abc123', {
      title: 'Comet Dodge',
      files: [
        { path: 'index.html', content: '<html>new</html>' },
        { path: 'rules.js', content: 'globalThis.arcadeGame = {}' },
      ],
      runtime: { entryFile: 'rules.js' },
      dependencies: [{ name: 'three', version: '0.170.0' }],
    });

    const put = calls[1];
    expect(put.init.method).toBe('PUT');
    expect(headers(put)['If-Match']).toBe('3');
    const sent = JSON.parse(String(put.init.body));
    expect(sent.title).toBe('Comet Dodge');
    // Untouched files survive a merge; named files are replaced whole.
    expect(sent.files.map((f: { path: string }) => f.path)).toEqual([
      'index.html',
      'old.js',
      'rules.js',
    ]);
    expect(sent.files[0].content).toBe('<html>new</html>');
    expect(sent.runtime).toEqual({ kind: 'sandboxed-script', entryFile: 'rules.js' });
    expect(sent.dependencies).toEqual({ three: '0.170.0' });
  });

  it('drops files not named when replaceFiles is set', async () => {
    replies.push(json(200, project()), json(200, project({ revision: 4 })));
    await new ArcadeService(db).writeGame('usr_creator', 'prj_abc123', {
      replaceFiles: true,
      files: [{ path: 'index.html', content: '<html>only</html>' }],
    });
    expect(JSON.parse(String(calls[1].init.body)).files).toEqual([
      { path: 'index.html', content: '<html>only</html>' },
    ]);
  });

  it('refuses a missing entry file before sending anything', async () => {
    replies.push(json(200, project()));
    await expect(
      new ArcadeService(db).writeGame('usr_creator', 'prj_abc123', {
        replaceFiles: true,
        files: [{ path: 'game.html', content: '<html></html>' }],
      }),
    ).rejects.toThrow(/entryFile "index.html" is not one of the project files/);
    expect(calls).toHaveLength(1);
  });

  it('publishes at the current revision and returns the playable links', async () => {
    replies.push(
      json(200, project({ revision: 7 })),
      json(201, {
        id: 'rel_abc123_7_000000000000',
        projectId: 'prj_abc123',
        revision: 7,
        digest: 'sha256:0000',
        publishedAt: '2026-09-16T00:00:00.000Z',
      }),
    );
    const result = await new ArcadeService(db).publishGame('usr_creator', 'prj_abc123');

    expect(calls[1].url).toBe('https://arcade.test/api/arcade/v1/projects/prj_abc123/publish');
    expect(headers(calls[1])['If-Match']).toBe('7');
    expect(result).toMatchObject({
      releaseId: 'rel_abc123_7_000000000000',
      studioUrl: 'https://arcade.test/studio/prj_abc123',
      gameUrl: 'https://arcade.test/games/prj_abc123',
    });
  });

  it('explains a missing thumbnail in terms the agent can act on', async () => {
    replies.push(
      json(200, project()),
      json(422, {
        detail: 'Add a game thumbnail in Studio → Publishing before publishing.',
        code: 'THUMBNAIL_REQUIRED',
      }),
    );
    const error = await new ArcadeService(db)
      .publishGame('usr_creator', 'prj_abc123')
      .catch((caught) => caught);
    expect(error).toBeInstanceOf(ArcadeError);
    expect(error.code).toBe('THUMBNAIL_REQUIRED');
    expect(error.message).toMatch(/Set a thumbnail with arcade_write_game/);
  });

  it('surfaces live-readiness blockers and field violations', async () => {
    const service = new ArcadeService(db);
    replies.push(
      json(200, project()),
      json(409, {
        detail: 'Studio only publishes games after their authoritative runtime passes live-readiness checks.',
        code: 'GAME_NOT_LIVE_READY',
        blockers: ['Browser presentation source is not an authoritative match runtime.'],
      }),
    );
    await expect(service.publishGame('usr_creator', 'prj_abc123')).rejects.toThrow(
      /Blockers: Browser presentation source/,
    );

    replies.push(
      json(200, project()),
      json(422, {
        detail: 'One or more request fields are invalid.',
        violations: [{ field: 'play.seats', message: 'Default seats must be within the supported range.' }],
      }),
    );
    await expect(
      service.writeGame('usr_creator', 'prj_abc123', {
        files: [{ path: 'index.html', content: '<html></html>' }],
      }),
    ).rejects.toThrow(/play\.seats — Default seats must be within/);
  });

  it('retries once with a fresh service token after a 401', async () => {
    replies.push(json(401, { detail: 'expired' }), json(200, { projects: [] }));
    await expect(new ArcadeService(db).listProjects('usr_creator')).resolves.toEqual([]);
    expect(calls).toHaveLength(2);
  });

  it('reports an unconfigured deployment instead of failing obscurely', async () => {
    delete process.env.AGENT_COMMONS_SERVICE_CLIENT_SECRET;
    const service = new ArcadeService(db);
    expect(service.isConnected()).toBe(false);
    await expect(service.listProjects('usr_creator')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(calls).toHaveLength(0);
  });
});

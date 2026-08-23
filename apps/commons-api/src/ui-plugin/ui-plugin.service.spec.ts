import { UiPluginService } from './ui-plugin.service';

const PAGE_MANIFEST = {
  schemaVersion: '2' as const,
  surfaces: [{ type: 'page' as const }],
  permissions: [],
  capabilities: [],
  networkAccess: { allowedDomains: [] },
};

const WIDGET_MANIFEST = {
  schemaVersion: '2' as const,
  surfaces: [{ type: 'widget' as const, width: 380, height: 480 }],
  permissions: [],
  capabilities: [],
  networkAccess: { allowedDomains: [] },
};

const VERIFIED_PAGE = {
  passed: true,
  schemaVersion: 2,
  verifiedSurfaces: [{ type: 'page' }],
  verifiedCapabilities: [],
};

describe('UiPluginService manifest boundary', () => {
  let service: UiPluginService;
  let publishedProjectSpy: jest.SpyInstance;

  beforeEach(() => {
    service = new UiPluginService({} as any);
    publishedProjectSpy = jest
      .spyOn(service as any, 'assertPublishedProject')
      .mockResolvedValue({
        projectId: 'project-1',
        workspaceId: null,
        deploymentId: 'deployment-pinned',
        publicUrl:
          'https://previews.example.com/weather/deployments/deployment-pinned/',
        verification: VERIFIED_PAGE,
      });
  });

  afterEach(() => jest.restoreAllMocks());

  it('rejects host capabilities outside the allowlist', async () => {
    await expect(
      service.create('user-1', null, {
        name: 'Weather',
        codeProjectId: 'project-1',
        manifest: {
          surfaces: [{ type: 'widget' }],
          permissions: ['secrets.read' as any],
        },
      }),
    ).rejects.toThrow('Unsupported UI permission');
  });

  it('rejects direct network access and undeclared bridge capabilities', async () => {
    await expect(
      service.create('user-1', null, {
        name: 'Weather',
        codeProjectId: 'project-1',
        manifest: {
          schemaVersion: '2',
          surfaces: [{ type: 'widget' }],
          capabilities: [{ name: 'secrets.read' as any }],
        },
      }),
    ).rejects.toThrow('Unsupported UI capability');

    await expect(
      service.create('user-1', null, {
        name: 'Weather',
        codeProjectId: 'project-1',
        manifest: {
          schemaVersion: '2',
          surfaces: [{ type: 'widget' }],
          networkAccess: { allowedDomains: ['api.example.com'] },
        },
      }),
    ).rejects.toThrow('Direct plugin network access is disabled');
  });

  it('rejects duplicate and unbounded surfaces', async () => {
    await expect(
      service.create('user-1', null, {
        name: 'Duplicate widgets',
        codeProjectId: 'project-1',
        manifest: {
          surfaces: [{ type: 'widget' }, { type: 'widget' }],
        },
      }),
    ).rejects.toThrow('Surfaces must be unique');
  });

  it('pins generated UI to the verified deployment and clamps widget dimensions', async () => {
    const returning = jest
      .fn()
      .mockResolvedValue([{ pluginId: 'plugin-1', status: 'draft' }]);
    const onConflictDoUpdate = jest.fn().mockReturnValue({ returning });
    const values = jest.fn().mockReturnValue({ onConflictDoUpdate });
    (service as any).db = {
      insert: jest.fn().mockReturnValue({ values }),
    };

    await service.create('user-1', null, {
      name: 'Weather',
      codeProjectId: 'project-1',
      manifest: {
        surfaces: [{ type: 'widget', width: 2_000, height: 1 }],
        permissions: ['theme.read'],
      },
    });

    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'draft',
        deploymentId: 'deployment-pinned',
        entryUrl:
          'https://previews.example.com/weather/deployments/deployment-pinned/',
        manifest: expect.objectContaining({
          surfaces: [expect.objectContaining({ width: 520, height: 240 })],
        }),
      }),
    );
  });

  it('rejects a deployment that has not passed browser verification', async () => {
    publishedProjectSpy.mockRestore();
    mockPublishedProjectRow(service, {
      projectId: 'project-1',
      workspaceId: null,
      deploymentId: 'deployment-1',
      publicUrl:
        'https://previews.example.com/weather/deployments/deployment-1/',
      deploymentStatus: 'ready',
      verification: { passed: false },
    });

    await expect(
      (service as any).assertPublishedProject(
        'user-1',
        'project-1',
        PAGE_MANIFEST,
      ),
    ).rejects.toThrow('must pass testCodeProject');
  });

  it('requires schemaVersion 2 verification covering every requested surface', async () => {
    publishedProjectSpy.mockRestore();
    mockPublishedProjectRow(service, {
      projectId: 'project-1',
      workspaceId: null,
      deploymentId: 'deployment-1',
      publicUrl:
        'https://previews.example.com/weather/deployments/deployment-1/',
      deploymentStatus: 'ready',
      verification: {
        passed: true,
        schemaVersion: 1,
        verifiedSurfaces: [{ type: 'widget', width: 380, height: 480 }],
        verifiedCapabilities: [],
      },
    });

    await expect(
      (service as any).assertPublishedProject(
        'user-1',
        'project-1',
        WIDGET_MANIFEST,
      ),
    ).rejects.toThrow('requested page/widget surface');

    mockPublishedProjectRow(service, {
      projectId: 'project-1',
      workspaceId: null,
      deploymentId: 'deployment-1',
      publicUrl:
        'https://previews.example.com/weather/deployments/deployment-1/',
      deploymentStatus: 'ready',
      verification: {
        passed: true,
        schemaVersion: 2,
        verifiedSurfaces: [{ type: 'widget', width: 520, height: 720 }],
        verifiedCapabilities: [],
      },
    });

    await expect(
      (service as any).assertPublishedProject(
        'user-1',
        'project-1',
        WIDGET_MANIFEST,
      ),
    ).rejects.toThrow('requested page/widget surface');
  });

  it('returns the immutable deployment only when verification covers the manifest', async () => {
    publishedProjectSpy.mockRestore();
    const row = {
      projectId: 'project-1',
      workspaceId: null,
      deploymentId: 'deployment-verified',
      publicUrl:
        'https://previews.example.com/weather/deployments/deployment-verified/',
      deploymentStatus: 'ready',
      verification: {
        passed: true,
        schemaVersion: 2,
        verifiedSurfaces: [{ type: 'widget', width: 380, height: 480 }],
        verifiedCapabilities: [],
      },
    };
    mockPublishedProjectRow(service, row);

    await expect(
      (service as any).assertPublishedProject(
        'user-1',
        'project-1',
        WIDGET_MANIFEST,
      ),
    ).resolves.toEqual(row);
  });

  it('requires every registered capability to have been exercised in verification', async () => {
    publishedProjectSpy.mockRestore();
    const manifest = {
      ...PAGE_MANIFEST,
      capabilities: [{ name: 'tasks.write' as const }],
    };
    const row = {
      projectId: 'project-1',
      workspaceId: null,
      deploymentId: 'deployment-verified',
      publicUrl:
        'https://previews.example.com/weather/deployments/deployment-verified/',
      deploymentStatus: 'ready',
      verification: {
        passed: true,
        schemaVersion: 2,
        verifiedSurfaces: [{ type: 'page' }],
        verifiedCapabilities: [] as string[],
      },
    };
    mockPublishedProjectRow(service, row);

    await expect(
      (service as any).assertPublishedProject('user-1', 'project-1', manifest),
    ).rejects.toThrow('requested page/widget surface');

    row.verification.verifiedCapabilities = ['tasks.write'];
    mockPublishedProjectRow(service, row);
    await expect(
      (service as any).assertPublishedProject('user-1', 'project-1', manifest),
    ).resolves.toEqual(row);
  });

  it('rejects malformed manifest arrays and schema versions', async () => {
    await expect(
      service.create('user-1', null, {
        name: 'Malformed',
        codeProjectId: 'project-1',
        manifest: {
          schemaVersion: '3' as any,
          surfaces: [{ type: 'page' }],
        },
      }),
    ).rejects.toThrow('schema version');
    await expect(
      service.create('user-1', null, {
        name: 'Malformed',
        codeProjectId: 'project-1',
        manifest: {
          surfaces: [{ type: 'page' }],
          capabilities: [null as any],
        },
      }),
    ).rejects.toThrow('capability must be an object');
  });

  it('refuses activation when the exact pinned deployment is unavailable', async () => {
    const existing = pluginFixture();
    const statusDb = mockStatusTransaction([[existing], [], [existing]]);
    (service as any).db = statusDb.db;

    await expect(
      service.setStatus('user-1', 'plugin-1', 'active'),
    ).rejects.toThrow('exact app deployment');
    expect(statusDb.tx.update).not.toHaveBeenCalled();
    expect(statusDb.rowLocks).toHaveLength(2);
  });

  it('keeps legacy plugins with a null deployment pin inert', async () => {
    const existing = {
      ...pluginFixture(),
      deploymentId: null,
      entryUrl: 'https://previews.example.com/weather/',
    };
    const statusDb = mockStatusTransaction([[existing]]);
    (service as any).db = statusDb.db;

    await expect(
      service.setStatus('user-1', 'plugin-1', 'active'),
    ).rejects.toThrow('legacy app');
    expect(statusDb.tx.select).toHaveBeenCalledTimes(1);
    expect(statusDb.tx.update).not.toHaveBeenCalled();
  });

  it('activates only while holding the pinned deployment and plugin row locks', async () => {
    const existing = pluginFixture();
    const deployment = {
      deploymentId: 'deployment-pinned',
      projectId: 'project-1',
      status: 'ready',
      verification: {
        passed: true,
        schemaVersion: 2,
        verifiedSurfaces: [{ type: 'widget', width: 380, height: 480 }],
        verifiedCapabilities: [],
      },
      publicUrl:
        'https://previews.example.com/weather/deployments/deployment-pinned/',
    };
    const statusDb = mockStatusTransaction(
      [[existing], [deployment], [existing]],
      [{ ...existing, status: 'active' }],
    );
    (service as any).db = statusDb.db;

    await expect(
      service.setStatus('user-1', 'plugin-1', 'active'),
    ).resolves.toEqual(expect.objectContaining({ status: 'active' }));

    expect(statusDb.rowLocks).toHaveLength(2);
    expect(
      statusDb.rowLocks.every((lock) => lock.mock.calls[0][0] === 'update'),
    ).toBe(true);
    expect(statusDb.set).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'active' }),
    );
  });

  it('rejects activation if the plugin changes before its row lock is acquired', async () => {
    const existing = pluginFixture();
    const deployment = {
      deploymentId: 'deployment-pinned',
      projectId: 'project-1',
      status: 'ready',
      verification: {
        passed: true,
        schemaVersion: 2,
        verifiedSurfaces: [{ type: 'widget', width: 380, height: 480 }],
        verifiedCapabilities: [],
      },
      publicUrl: existing.entryUrl,
    };
    const statusDb = mockStatusTransaction([[existing], [deployment], []]);
    (service as any).db = statusDb.db;

    await expect(
      service.setStatus('user-1', 'plugin-1', 'active'),
    ).rejects.toThrow('changed while it was being enabled');
    expect(statusDb.tx.update).not.toHaveBeenCalled();
  });
});

function mockStatusTransaction(selectRows: any[][], updatedRows: any[] = []) {
  const rowLocks: jest.Mock[] = [];
  const select = jest.fn();
  selectRows.forEach((rows, index) => {
    const from = jest.fn();
    const where = jest.fn();
    const limit = jest.fn();
    select.mockReturnValueOnce({ from });
    from.mockReturnValue({ where });
    where.mockReturnValue({ limit });
    if (index === 0) {
      limit.mockResolvedValue(rows);
    } else {
      const rowLock = jest.fn().mockResolvedValue(rows);
      rowLocks.push(rowLock);
      limit.mockReturnValue({ for: rowLock });
    }
  });
  const returning = jest.fn().mockResolvedValue(updatedRows);
  const updateWhere = jest.fn().mockReturnValue({ returning });
  const set = jest.fn().mockReturnValue({ where: updateWhere });
  const tx = { select, update: jest.fn().mockReturnValue({ set }) };
  const transaction = jest.fn((callback) => callback(tx));
  return { db: { transaction }, tx, set, rowLocks };
}

function mockPublishedProjectRow(service: UiPluginService, row: any) {
  const limit = jest.fn().mockResolvedValue([row]);
  const where = jest.fn().mockReturnValue({ limit });
  const leftJoin = jest.fn().mockReturnValue({ where });
  const from = jest.fn().mockReturnValue({ leftJoin });
  (service as any).db = {
    select: jest.fn().mockReturnValue({ from }),
  };
}

function pluginFixture() {
  return {
    pluginId: 'plugin-1',
    ownerUserId: 'user-1',
    codeProjectId: 'project-1',
    deploymentId: 'deployment-pinned',
    entryUrl:
      'https://previews.example.com/weather/deployments/deployment-pinned/',
    manifest: WIDGET_MANIFEST,
    status: 'draft',
    updatedAt: new Date('2026-08-23T00:00:00.000Z'),
  } as any;
}

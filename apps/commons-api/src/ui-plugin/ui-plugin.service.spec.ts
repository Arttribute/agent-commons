import { UiPluginService } from './ui-plugin.service';

describe('UiPluginService manifest boundary', () => {
  const service = new UiPluginService({} as any);

  beforeEach(() => {
    jest.spyOn(service as any, 'assertPublishedProject').mockResolvedValue({
      projectId: 'project-1',
      workspaceId: null,
      publicUrl: 'https://previews.example.com/weather/',
      verification: { passed: true },
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

  it('registers generated UI as a draft with clamped widget dimensions', async () => {
    const returning = jest
      .fn()
      .mockResolvedValue([{ pluginId: 'plugin-1', status: 'draft' }]);
    const onConflictDoUpdate = jest.fn().mockReturnValue({ returning });
    const values = jest.fn().mockReturnValue({ onConflictDoUpdate });
    (service as any).db = { insert: jest.fn().mockReturnValue({ values }) };

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
        entryUrl: 'https://previews.example.com/weather/',
        manifest: expect.objectContaining({
          surfaces: [expect.objectContaining({ width: 520, height: 240 })],
        }),
      }),
    );
  });

  it('rejects a deployment that has not passed browser verification', async () => {
    jest.spyOn(service as any, 'assertPublishedProject').mockRestore();
    const limit = jest.fn().mockResolvedValue([
      {
        projectId: 'project-1',
        workspaceId: null,
        publicUrl: 'https://previews.example.com/weather/',
        deploymentStatus: 'ready',
        verification: { passed: false },
      },
    ]);
    const where = jest.fn().mockReturnValue({ limit });
    const leftJoin = jest.fn().mockReturnValue({ where });
    const from = jest.fn().mockReturnValue({ leftJoin });
    (service as any).db = { select: jest.fn().mockReturnValue({ from }) };

    await expect(
      (service as any).assertPublishedProject('user-1', 'project-1'),
    ).rejects.toThrow('must pass testCodeProject');
  });
});

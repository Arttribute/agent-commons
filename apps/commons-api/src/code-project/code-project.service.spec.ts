import { CodeProjectService } from './code-project.service';

describe('linked page asset revocation', () => {
  function setup(page: unknown) {
    const storage = {
      get: jest
        .fn()
        .mockResolvedValue({
          bytes: Buffer.from('content'),
          contentType: 'text/html',
          cacheControl: 'public, max-age=31536000',
        }),
    };
    const db = {
      query: {
        codeProject: {
          findFirst: jest
            .fn()
            .mockResolvedValue({
              projectId: 'source',
              latestDeploymentId: 'version',
            }),
        },
        codeProjectDeployment: {
          findFirst: jest.fn().mockResolvedValue({ storagePrefix: 'prefix' }),
        },
      },
      select: jest.fn(() => ({
        from: () => ({
          innerJoin: () => ({
            where: () => ({ limit: async () => (page ? [page] : []) }),
          }),
        }),
      })),
    };
    const service = new CodeProjectService(
      db as any,
      {} as any,
      storage as any,
      {} as any,
      {} as any,
      {} as any,
    );
    return { service, storage };
  }
  it.each([
    { assetsEnabled: false },
    { assetsEnabled: true, deletedAt: new Date() },
    { assetsEnabled: true, parentDeletedAt: new Date() },
  ])('does not serve assets for a revoked or deleted page', async (page) => {
    const { service, storage } = setup(page);
    await expect(service.publicAsset('slug')).rejects.toThrow();
    expect(storage.get).not.toHaveBeenCalled();
  });
  it('avoids caching linked assets and leaves standalone preview caching intact', async () => {
    expect(
      (await setup({ assetsEnabled: true }).service.publicAsset('slug'))
        .cacheControl,
    ).toBe('no-store');
    expect((await setup(null).service.publicAsset('slug')).cacheControl).toBe(
      'public, max-age=31536000',
    );
  });
});

describe('CodeProjectService verification persistence', () => {
  it('stores a failed verification and disables pinned active plugins atomically', async () => {
    const deployment = {
      deploymentId: 'deployment-1',
      projectId: 'project-1',
    } as any;
    const verification = {
      schemaVersion: 2,
      passed: false,
      verifiedSurfaces: [{ type: 'page' }],
      verifiedCapabilities: [],
    };
    const setValues: any[] = [];
    const deploymentRowLock = jest.fn().mockResolvedValue([deployment]);
    const deploymentLimit = jest
      .fn()
      .mockReturnValue({ for: deploymentRowLock });
    const deploymentWhere = jest
      .fn()
      .mockReturnValue({ limit: deploymentLimit });
    const deploymentFrom = jest
      .fn()
      .mockReturnValue({ where: deploymentWhere });
    const pluginRowLock = jest.fn().mockResolvedValue([
      {
        pluginId: 'plugin-1',
        manifest: { schemaVersion: '2', surfaces: [{ type: 'page' }] },
      },
    ]);
    const pluginWhere = jest.fn().mockReturnValue({ for: pluginRowLock });
    const pluginFrom = jest.fn().mockReturnValue({ where: pluginWhere });
    const select = jest
      .fn()
      .mockReturnValueOnce({ from: deploymentFrom })
      .mockReturnValueOnce({ from: pluginFrom });
    const update = jest.fn().mockImplementation(() => ({
      set: jest.fn((value) => {
        setValues.push(value);
        return { where: jest.fn().mockResolvedValue([]) };
      }),
    }));
    const tx = { select, update };
    const transaction = jest.fn((callback) => callback(tx));
    const service = new CodeProjectService(
      { transaction } as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    await (service as any).persistVerification(deployment, verification);

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(deploymentRowLock).toHaveBeenCalledWith('update');
    expect(pluginRowLock).toHaveBeenCalledWith('update');
    expect(setValues).toEqual([
      { verification },
      expect.objectContaining({ status: 'disabled' }),
    ]);
    expect(select).toHaveBeenCalledTimes(2);
  });
});

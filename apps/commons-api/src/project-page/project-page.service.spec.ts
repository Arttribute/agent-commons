import { ConflictException, NotFoundException } from '@nestjs/common';
import { ProjectPageService } from './project-page.service';
import { pageConfig, pageSlug } from './page-input';

describe('project pages ownership and publication', () => {
  const pageId = '82e2aa45-91c5-494f-b608-cbe8f9f9f042';
  const config = {
    title: 'Live title',
    description: 'Public only',
    publicContext: 'Approved facts',
    chatEnabled: true,
  };
  const page = {
    pageId,
    projectId: 'parent',
    codeProjectId: 'source',
    revision: 3,
    draftConfig: config,
  } as any;
  const source = {
    projectId: 'source',
    agentId: 'agent',
    ownerUserId: 'owner',
  };
  function setup() {
    const updates: any[] = [],
      predicates: any[] = [];
    const update = jest.fn(() => ({
      set: (values: any) => {
        updates.push(values);
        return {
          where: (where: any) => {
            predicates.push(where);
            return { returning: jest.fn().mockResolvedValue([{ pageId }]) };
          },
        };
      },
    }));
    const db = {
      update,
      transaction: jest.fn(async (fn) => fn({ update })),
      select: jest.fn(() => ({
        from: () => ({
          where: () => ({
            limit: async () => [
              {
                deploymentId: 'immutable-1',
                projectId: 'source',
                publicUrl: 'https://assets.example/v1/',
              },
            ],
          }),
        }),
      })),
    };
    const parents = {
      requireProject: jest.fn().mockResolvedValue({ projectId: 'parent' }),
    };
    const code = {
      publish: jest
        .fn()
        .mockResolvedValue({
          deploymentId: 'immutable-1',
          publicUrl: 'https://assets.example/v1/',
        }),
    };
    const service = new ProjectPageService(
      db as any,
      parents as any,
      code as any,
    );
    return { service, db, parents, code, updates, predicates };
  }
  it('checks parent ownership before reading or modifying a page', async () => {
    const { service, db, parents } = setup();
    parents.requireProject.mockRejectedValue(new NotFoundException());
    await expect(
      service.requirePage('other-owner', 'parent', pageId),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(db.select).not.toHaveBeenCalled();
    expect(db.update).not.toHaveBeenCalled();
  });
  it('pins the built deployment and copies explicit public settings', async () => {
    const { service, updates } = setup();
    jest.spyOn(service as any, 'source').mockResolvedValue({ page, source });
    jest.spyOn(service, 'get').mockResolvedValue({} as any);
    await service.publish('owner', 'parent', pageId);
    expect(updates[0]).toMatchObject({
      publishedDeploymentId: 'immutable-1',
      publishedConfig: config,
      status: 'published',
      assetsEnabled: true,
    });
    expect(updates[0].publishedConfig).not.toBe(config);
  });
  it('a preview never changes the pinned live deployment or published metadata', async () => {
    const { service, updates } = setup();
    jest.spyOn(service as any, 'source').mockResolvedValue({ page, source });
    expect(await service.preview('owner', 'parent', pageId)).toMatchObject({
      visibility: 'unlisted',
    });
    expect(updates[0].publishedDeploymentId).toBeUndefined();
    expect(updates[0].publishedConfig).toBeUndefined();
  });
  it('rejects a stale build if an unpublish, delete or edit won the revision check', async () => {
    const { service, db } = setup();
    jest.spyOn(service as any, 'source').mockResolvedValue({ page, source });
    db.update.mockReturnValue({
      set: () => ({ where: () => ({ returning: async () => [] }) }),
    } as any);
    await expect(
      service.publish('owner', 'parent', pageId),
    ).rejects.toBeInstanceOf(ConflictException);
  });
  it('revokes page assets and backing code visibility in one transaction', async () => {
    const { service, db, updates } = setup();
    jest.spyOn(service as any, 'source').mockResolvedValue({ page, source });
    jest.spyOn(service, 'get').mockResolvedValue({} as any);
    await service.unpublish('owner', 'parent', pageId);
    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(updates[0]).toMatchObject({ status: 'draft', assetsEnabled: false });
    expect(updates[1]).toMatchObject({ visibility: 'private' });
  });
  it('keeps private / unknown input fields out of the public settings contract', () => {
    expect(
      pageConfig({
        ...config,
        instructions: 'secret',
        ownerToken: 'secret',
      } as any),
    ).toEqual(config);
    expect(() => pageSlug('../parent')).toThrow();
    expect(() => pageSlug('templates')).toThrow();
    expect(() =>
      pageConfig({ ...config, imageUrl: 'javascript:alert(1)' }),
    ).toThrow();
  });
});

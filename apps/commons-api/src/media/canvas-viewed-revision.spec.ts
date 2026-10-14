import { CanvasService } from './canvas.service';

jest.mock('~/files', () => ({ LibraryService: class {} }));
jest.mock('~/modules/database/database.service', () => ({ DatabaseService: class {} }));

it('canvas tools read the captured version while preserving the saved active version and caller scope', async () => {
  const principal = { principalId: 'viewer', principalType: 'user' as const };
  const bundle = { project: { activeItemId: 'new-file' }, revisions: [{ revisionId: 'viewed-version', itemId: 'original-file' }, { revisionId: 'new-version', itemId: 'new-file' }], annotations: [] };
  const service = { getProject: jest.fn().mockResolvedValue(bundle) };
  const read = await CanvasService.prototype.getProjectForAgent.call(service as any, 'project', principal, 'viewed-version');
  expect(service.getProject).toHaveBeenCalledWith('project', principal);
  expect(read.project.activeItemId).toBe('original-file');
  expect((read as any).savedActiveItemId).toBe('new-file');
  expect(bundle.project.activeItemId).toBe('new-file');
  await expect(CanvasService.prototype.getProjectForAgent.call(service as any, 'project', principal, 'another-project-version')).rejects.toThrow('does not belong');
  expect(await CanvasService.prototype.getProjectForAgent.call(service as any, 'project', principal)).toBe(bundle);
});

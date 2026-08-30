import { LibraryService } from './library.service';

describe('LibraryService preview ownership', () => {
  it('passes a delegated service principal through as the file owner', async () => {
    const item = {
      itemId: 'item-1',
      name: 'brief.docx',
      kind: 'document',
      mimeType:
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      status: 'ready',
      ownerUserId: 'user-1',
    };
    const values = jest.fn().mockResolvedValue(undefined);
    const db = {
      query: {
        libraryItem: {
          findFirst: jest.fn().mockResolvedValue(item),
        },
      },
      insert: jest.fn().mockReturnValue({ values }),
    } as any;
    const files = {
      readFileForAgent: jest.fn().mockResolvedValue({
        content: 'Document content',
        totalChars: 16,
        truncated: false,
        artifacts: [],
      }),
      createDownloadUrl: jest.fn().mockResolvedValue({ url: 'download' }),
      createInlineUrl: jest.fn().mockResolvedValue({ url: 'inline' }),
    } as any;
    const service = new LibraryService(db, files, {} as any, {} as any);

    await service.preview('item-1', {
      principalId: 'user-1',
      principalType: 'service',
    });

    expect(files.readFileForAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        fileId: 'item-1',
        agentId: undefined,
        ownerId: 'user-1',
      }),
    );
    expect(files.createDownloadUrl).toHaveBeenCalledWith(
      'item-1',
      expect.objectContaining({ ownerId: 'user-1' }),
    );
    expect(files.createInlineUrl).toHaveBeenCalledWith(
      'item-1',
      expect.objectContaining({ ownerId: 'user-1' }),
    );
  });

  it('previews code projects from source when no original blob exists', async () => {
    const item = {
      itemId: 'item-app',
      name: 'Interactive app',
      kind: 'app',
      source: 'code_project',
      mimeType: 'application/vnd.agent-commons.nextjs-project',
      status: 'ready',
      ownerUserId: 'user-1',
      metadata: {},
    };
    const values = jest.fn().mockResolvedValue(undefined);
    const db = {
      query: {
        libraryItem: { findFirst: jest.fn().mockResolvedValue(item) },
        codeProject: {
          findFirst: jest.fn().mockResolvedValue({
            projectId: 'project-1',
            agentId: 'agent-1',
            name: 'Interactive app',
            framework: 'nextjs',
            entryFile: 'app/page.tsx',
            status: 'draft',
            updatedAt: new Date('2026-08-30T00:00:00.000Z'),
          }),
        },
        codeProjectFile: {
          findMany: jest.fn().mockResolvedValue([
            {
              path: 'app/page.tsx',
              content: 'export default function Page(){return <p>Hello</p>}',
              mimeType: 'text/tsx',
              sizeBytes: 54,
              version: 1,
            },
          ]),
        },
        codeProjectDeployment: { findFirst: jest.fn().mockResolvedValue(null) },
      },
      insert: jest.fn().mockReturnValue({ values }),
    } as any;
    const files = {
      readFileForAgent: jest.fn().mockResolvedValue({
        content: '',
        totalChars: 0,
        truncated: false,
        artifacts: [],
      }),
      createDownloadUrl: jest
        .fn()
        .mockRejectedValue(new Error('Original file is unavailable')),
      createInlineUrl: jest
        .fn()
        .mockRejectedValue(new Error('Original file is unavailable')),
    } as any;
    const builder = {
      buildInlinePreview: jest.fn().mockResolvedValue({
        html: '<html><body>Hello</body></html>',
        warnings: [],
      }),
    } as any;
    const service = new LibraryService(db, files, {} as any, builder);

    const preview = (await service.preview('item-app', {
      principalId: 'user-1',
      principalType: 'user',
    })) as any;

    expect(preview.download).toBeUndefined();
    expect(preview.interactivePreview).toMatchObject({
      type: 'html',
      compiled: true,
    });
    expect(preview.codeProject.files[0].path).toBe('app/page.tsx');

    await service.preview('item-app', {
      principalId: 'user-1',
      principalType: 'user',
    });
    expect(builder.buildInlinePreview).toHaveBeenCalledTimes(1);
  });
});

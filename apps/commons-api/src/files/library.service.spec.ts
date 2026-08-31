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

describe('LibraryService agent discovery', () => {
  const item = {
    itemId: 'item-1',
    ownerUserId: 'user-1',
    name: 'Kenyan coding bootcamps.xlsx',
    description: 'Research workbook',
    kind: 'spreadsheet',
    mimeType:
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    sizeBytes: 2048,
    sha256: 'a'.repeat(64),
    source: 'agent',
    status: 'ready',
    sourceAgentId: 'agent-1',
    sourceSessionId: 'session-1',
    textPreview: 'Provider Location Format',
    metadata: {},
    isFavorite: false,
    deletedAt: null,
    createdAt: new Date('2026-08-30T00:00:00.000Z'),
    updatedAt: new Date('2026-08-31T00:00:00.000Z'),
  };

  function harness(items = [item]) {
    const db = {
      query: {
        agent: {
          findFirst: jest.fn().mockResolvedValue({
            agentId: 'agent-1',
            ownerUserId: 'user-1',
            workspaceId: null,
          }),
        },
        session: { findFirst: jest.fn() },
        libraryItem: { findMany: jest.fn().mockResolvedValue(items) },
      },
    } as any;
    const openAI = { embeddings: { create: jest.fn() } } as any;
    return {
      db,
      openAI,
      service: new LibraryService(db, {} as any, openAI, {} as any),
    };
  }

  it('lists recent owner artifacts for an empty query without embeddings', async () => {
    const { service, openAI } = harness();

    const results = await service.searchForAgent({
      agentId: 'agent-1',
      sessionId: 'session-2',
      ownerId: 'user-1',
      query: '',
      limit: 10,
    });

    expect(results).toEqual([
      expect.objectContaining({
        itemId: 'item-1',
        fileId: 'item-1',
        name: 'Kenyan coding bootcamps.xlsx',
        match: 'recent',
      }),
    ]);
    expect(openAI.embeddings.create).not.toHaveBeenCalled();
  });

  it('finds binary artifacts by filename or type before semantic search', async () => {
    const { service, openAI } = harness();

    const results = await service.searchForAgent({
      agentId: 'agent-1',
      ownerId: 'user-1',
      query: 'xlsx',
      limit: 1,
    });

    expect(results[0]).toEqual(
      expect.objectContaining({
        fileId: 'item-1',
        kind: 'spreadsheet',
        match: 'metadata',
        excerpt: 'Provider Location Format',
      }),
    );
    expect(openAI.embeddings.create).not.toHaveBeenCalled();
  });

  it('uses the agent record as the canonical owner boundary', async () => {
    const { service } = harness();

    const context = await (service as any).resolveAgentLibraryContext({
      agentId: 'agent-1',
      ownerId: 'another-user',
    });

    expect(context).toEqual({ ownerId: 'user-1', workspaceId: undefined });
  });
});

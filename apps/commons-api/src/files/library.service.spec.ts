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
    const service = new LibraryService(db, files, {} as any);

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
});

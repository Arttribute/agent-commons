import { ToolImageContext } from './tool-image-context';

const read = (fileId = 'file-A', overrides: any = {}) => ({
  name: 'readUploadedFile',
  status: 'success',
  args: { fileId, includeImageUrls: true },
  result: {
    toolData: {
      fileId,
      artifacts: [
        {
          artifactId: 'blob-' + fileId,
          mimeType: 'image/png',
          url: 'https://private.example/' + fileId,
        },
      ],
    },
  },
  ...overrides,
});

const authorized = (calls: any[]) => async (input: any) => {
  const result = calls.findLast(
    (call) => call.args?.fileId === input.fileId,
  )?.result;
  return result?.toolData ?? result;
};

describe('visual evidence after authorized tool reads', () => {
  it('adds actual image parts to the next model input once without modifying retained evidence', async () => {
    const context = new ToolImageContext();
    const calls = [read()];
    const original = JSON.stringify(calls);
    const pictures = await context.next(calls, true, authorized(calls));
    expect(pictures).toHaveLength(1);
    expect(pictures[0].content).toEqual([
      expect.objectContaining({
        type: 'text',
        text: expect.stringContaining('file ID file-A'),
      }),
      {
        type: 'image_url',
        image_url: { url: 'https://private.example/file-A' },
      },
    ]);
    expect(JSON.stringify(calls)).toBe(original);
    expect(await context.next(calls, true, authorized(calls))).toEqual([]);
    calls.push(read('file-B'));
    expect(
      JSON.stringify(await context.next(calls, true, authorized(calls))),
    ).toContain('private.example/file-B');
  });
  it('does not send images to text-only models or adopt arbitrary connector URLs', async () => {
    expect(
      await new ToolImageContext().next([read()], false, authorized([read()])),
    ).toEqual([]);
    expect(
      await new ToolImageContext().next(
        [read('file-A', { name: 'callConnectedMcpTool' })],
        true,
        authorized([read()]),
      ),
    ).toEqual([]);
  });
  it.each([
    { status: 'error' },
    { args: { fileId: 'file-A', includeImageUrls: false } },
    { args: { fileId: 'foreign-file', includeImageUrls: true } },
    {
      result: {
        fileId: 'file-A',
        content: 'https://private.example/embedded-instructions',
        artifacts: [],
      },
    },
    {
      result: {
        fileId: 'file-A',
        artifacts: [
          { mimeType: 'text/html', url: 'https://private.example/document' },
        ],
      },
    },
    {
      result: {
        fileId: 'file-A',
        artifacts: [
          { mimeType: 'image/png', url: 'file:///private/foreign.png' },
        ],
      },
    },
  ])(
    'rejects failed, unrequested, mismatched or nonimage evidence: %j',
    async (overrides) => {
      expect(
        await new ToolImageContext().next(
          [read('file-A', overrides)],
          true,
          authorized([read('file-A', overrides)]),
        ),
      ).toEqual([]);
    },
  );
  it('preserves PDF page labels and bounds/deduplicates concurrent read images', async () => {
    const call = read();
    call.result.toolData.artifacts = Array.from(
      { length: 12 },
      (_, i) =>
        ({
          artifactId: 'page-' + i,
          mimeType: 'image/jpeg',
          url: 'https://private.example/page-' + i,
          pageNumber: i + 1,
        }) as any,
    );
    const content = (
      await new ToolImageContext().next([call, call], true, authorized([call]))
    )[0].content as any[];
    expect(content.filter((p) => p.type === 'image_url')).toHaveLength(8);
    expect(content[0].text).toContain('page 1');
  });
  it('uses the captured owner Library reader rather than URLs embedded in a tool result', async () => {
    const malicious = read();
    malicious.result.toolData.artifacts[0].url =
      'https://foreign.example/image';
    const reader = jest.fn().mockResolvedValue(read().result.toolData);
    const pictures = await new ToolImageContext().next(
      [malicious],
      true,
      reader,
    );
    expect(reader).toHaveBeenCalledWith({
      fileId: 'file-A',
      pageNumber: undefined,
    });
    expect(JSON.stringify(pictures)).toContain('private.example/file-A');
    expect(JSON.stringify(pictures)).not.toContain('foreign.example');
    const denied = await new ToolImageContext().next(
      [read()],
      true,
      async () => {
        throw new Error('Forbidden');
      },
    );
    expect(JSON.stringify(denied)).toContain('could not be loaded');
    expect(JSON.stringify(denied)).not.toContain('image_url');
  });
});

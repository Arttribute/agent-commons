import {
  canvasContextRequest,
  formatCanvasContext,
  normalizeCreativeDefaults,
  noteLocation,
  type CanvasContextInput,
} from './canvas-context';

const projectId = '11111111-1111-4111-8111-111111111111';
const noteId = '22222222-2222-4222-8222-222222222222';
const otherNoteId = '33333333-3333-4333-8333-333333333333';
const revisionId = '44444444-4444-4444-8444-444444444444';

function input(overrides: Partial<CanvasContextInput> = {}): CanvasContextInput {
  return {
    projectId,
    artifact: {
      itemId: 'item-1',
      name: 'Quarterly report.pdf',
      kind: 'pdf',
      mimeType: 'application/pdf',
    },
    activeRevision: {
      revisionId,
      itemId: 'item-1',
      operation: 'import',
      createdByType: 'human',
      createdAt: '2026-10-01T10:00:00Z',
    },
    revisions: [
      {
        revisionId,
        itemId: 'item-1',
        operation: 'import',
        createdByType: 'human',
        createdAt: '2026-10-01T10:00:00Z',
      },
    ],
    annotations: [],
    attachedIds: [],
    viewer: {},
    creativeDefaults: {},
    ...overrides,
  };
}

describe('canvasContextRequest', () => {
  it('ignores other pages and malformed ids', () => {
    expect(canvasContextRequest({ resourceType: 'agent' })).toBeNull();
    expect(
      canvasContextRequest({ resourceType: 'canvas', resourceId: 'nope' }),
    ).toBeNull();
  });

  it('keeps valid note ids, deduplicated and bounded', () => {
    const request = canvasContextRequest({
      resourceType: 'canvas',
      resourceId: projectId,
      annotationIds: [noteId, noteId, 'bad', otherNoteId],
      annotationId: noteId,
      canvasViewer: { page: 3, pageCount: 12, view: 'nonsense', sheet: 7 },
    });
    expect(request).toEqual({
      projectId,
      annotationIds: [noteId, otherNoteId],
      viewer: {
        view: undefined,
        page: 3,
        pageCount: 12,
        sheet: undefined,
        timeMs: undefined,
        durationMs: undefined,
        sourceFile: undefined,
      },
    });
  });
});

describe('normalizeCreativeDefaults', () => {
  it('keeps known media kinds with scalar settings only', () => {
    expect(
      normalizeCreativeDefaults({
        image: {
          modelKey: 'openai:gpt-image',
          settings: { quality: 'high', nested: { no: true }, 'bad key': 1 },
        },
        spreadsheet: { modelKey: 'x' },
      }),
    ).toEqual({
      image: { modelKey: 'openai:gpt-image', settings: { quality: 'high' } },
    });
  });
});

describe('formatCanvasContext', () => {
  it('describes the artifact, version and viewer', () => {
    const text = formatCanvasContext(
      input({ viewer: { page: 3, pageCount: 12 } }),
    );
    expect(text).toContain('"Quarterly report.pdf" (pdf, application/pdf)');
    expect(text).toContain(`Canvas projectId for canvas tools: ${projectId}`);
    expect(text).toContain('Showing version 1 of 1');
    expect(text).toContain('Viewer: page 3 of 12');
    expect(text).toContain('addCanvasVersion');
  });

  it('includes exact text quotes for attached notes and lists other open notes', () => {
    const text = formatCanvasContext(
      input({
        attachedIds: [noteId],
        annotations: [
          {
            annotationId: noteId,
            revisionId,
            kind: 'region',
            body: 'Tighten this sentence',
            status: 'open',
            geometry: { x: 0.1, y: 0.2, width: 0.3, height: 0.05 },
            metadata: {
              target: {
                type: 'text',
                page: 4,
                quote: 'Revenue grew 14 percent',
                prefix: 'In Q3, ',
                suffix: ' year over year.',
              },
            },
          },
          {
            annotationId: otherNoteId,
            revisionId,
            kind: 'point',
            body: 'Logo looks blurry',
            status: 'open',
            geometry: { x: 0.5, y: 0.5 },
            metadata: { target: { type: 'region', page: 1 } },
          },
        ],
      }),
    );
    expect(text).toContain('### Notes attached to this message');
    expect(text).toContain('Selected text: "Revenue grew 14 percent"');
    expect(text).toContain('"…In Q3, [selection] year over year.…"');
    expect(text).toContain('Location: page 4, region x 10% y 20% w 30% h 5%');
    expect(text).toContain('### Other open notes on this version (1)');
    expect(text).toContain(`${otherNoteId}: "Logo looks blurry" (page 1, point x 50% y 50%)`);
  });

  it('gives media edit guidance and creative preferences', () => {
    const text = formatCanvasContext(
      input({
        artifact: {
          itemId: 'image-1',
          name: 'Flask.png',
          kind: 'image',
          mimeType: 'image/png',
        },
        creativeDefaults: {
          image: { modelKey: 'openai:gpt-image', settings: { quality: 'high' } },
        },
      }),
    );
    expect(text).toContain(
      `generateMedia with projectId "${projectId}", operation "transform" and inputItemIds ["image-1"]`,
    );
    expect(text).toContain(
      '- image: modelKey "openai:gpt-image" with settings {"quality":"high"}',
    );
  });

  it('describes element and cell targets', () => {
    const text = formatCanvasContext(
      input({
        codeProject: { projectId: 'code-1', entryFile: 'app/page.tsx', name: 'Site' },
        attachedIds: [noteId, otherNoteId],
        annotations: [
          {
            annotationId: noteId,
            revisionId,
            kind: 'point',
            body: 'Swap this icon',
            status: 'open',
            geometry: { x: 0.2, y: 0.1 },
            metadata: {
              target: {
                type: 'element',
                elements: [
                  {
                    selector: 'header > nav > button.menu',
                    tag: 'button',
                    ariaLabel: 'Open menu',
                    icon: 'svg.lucide-menu',
                  },
                ],
              },
            },
          },
          {
            annotationId: otherNoteId,
            revisionId,
            kind: 'comment',
            body: 'Check totals',
            status: 'open',
            metadata: {
              target: {
                type: 'cells',
                sheet: 'Q3',
                range: 'B2:C3',
                values: [
                  ['10', '20'],
                  ['30', '40'],
                ],
              },
            },
          },
        ],
      }),
    );
    expect(text).toContain('selector `header > nav > button.menu`');
    expect(text).toContain('aria-label "Open menu"');
    expect(text).toContain('readCodeProject (projectId "code-1")');
    expect(text).toContain('sheet "Q3", cells B2:C3');
    expect(text).toContain('     10 | 20');
  });
});

describe('noteLocation', () => {
  it('adds pixel coordinates when the intrinsic size is known', () => {
    expect(
      noteLocation({
        annotationId: noteId,
        revisionId,
        kind: 'region',
        body: 'x',
        status: 'open',
        geometry: { x: 0.25, y: 0.5, width: 0.5, height: 0.25 },
        metadata: { intrinsicSize: { width: 1000, height: 800 } },
      }),
    ).toBe(
      'region x 25% y 50% w 50% h 25% (pixels 250,400 to 750,600 of 1000x800)',
    );
  });

  it('formats time ranges', () => {
    expect(
      noteLocation({
        annotationId: noteId,
        revisionId,
        kind: 'time_range',
        body: 'x',
        status: 'open',
        startMs: 62_500,
        endMs: 65_000,
      }),
    ).toBe('1:02.5-1:05');
  });
});

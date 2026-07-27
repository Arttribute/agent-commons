import JSZip from 'jszip';
import { PDFDict, PDFDocument, PDFName, StandardFonts } from 'pdf-lib';
import sharp from 'sharp';
import {
  classifyFile,
  FilesService,
  normalizeMimeType,
  revisePdfBufferPreservingLayout,
} from './files.service';

describe('FilesService document support', () => {
  const service = new FilesService({} as any, {} as any, {} as any);

  it.each([
    ['report.docx', '', 'document'],
    ['deck.pptx', '', 'presentation'],
    ['recording.m4a', '', 'audio'],
    ['demo.mp4', '', 'video'],
    ['source.ts', '', 'code'],
    ['bundle.zip', '', 'archive'],
  ])('classifies %s as %s', (name, mime, expected) => {
    const normalized = normalizeMimeType(mime, name);
    expect(classifyFile(normalized, name)).toBe(expected);
  });

  it('extracts readable text from a DOCX upload', async () => {
    const zip = new JSZip();
    zip.file(
      '[Content_Types].xml',
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
    );
    zip.file(
      '_rels/.rels',
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
    );
    zip.file(
      'word/document.xml',
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Quarterly product review</w:t></w:r></w:p><w:p><w:r><w:t>Revenue increased by twelve percent.</w:t></w:r></w:p><w:sectPr/></w:body></w:document>',
    );
    const buffer = await zip.generateAsync({ type: 'nodebuffer' });

    const result = await (service as any).extractDocument(
      buffer,
      'review.docx',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );

    expect(result.status).toBe('ready');
    expect(result.text).toContain('Quarterly product review');
    expect(result.text).toContain('Revenue increased by twelve percent.');
  });

  it('extracts slide text and speaker notes from PPTX XML', async () => {
    const zip = new JSZip();
    zip.file(
      'ppt/slides/slide1.xml',
      '<p:sld><a:p><a:r><a:t>Roadmap</a:t></a:r></a:p><a:p><a:r><a:t>Launch in September</a:t></a:r></a:p></p:sld>',
    );
    zip.file(
      'ppt/notesSlides/notesSlide1.xml',
      '<p:notes><a:p><a:r><a:t>Confirm launch owner</a:t></a:r></a:p></p:notes>',
    );
    const buffer = await zip.generateAsync({ type: 'nodebuffer' });

    const result = await (service as any).extractPresentation(
      buffer,
      'roadmap.pptx',
    );

    expect(result.status).toBe('ready');
    expect(result.metadata.slides).toBe(1);
    expect(result.text).toContain('Roadmap');
    expect(result.text).toContain('Launch in September');
    expect(result.text).toContain('Confirm launch owner');
  });

  it('lists files inside ZIP uploads so agents can reason about archives', async () => {
    const zip = new JSZip();
    zip.file('notes/readme.md', '# Hello');
    zip.file('data/results.csv', 'name,value');
    const buffer = await zip.generateAsync({ type: 'nodebuffer' });

    const result = await (service as any).extractArchive(buffer, 'bundle.zip');

    expect(result.status).toBe('ready');
    expect(result.text).toContain('notes/readme.md');
    expect(result.text).toContain('data/results.csv');
  });

  it('creates valid DOCX, PPTX, and PDF artifact bytes', async () => {
    const generationService = new FilesService({} as any, {} as any, {} as any);
    jest
      .spyOn(generationService as any, 'persistFile')
      .mockImplementation(async (input: any) => input);

    const document = (await generationService.createDocumentFile({
      fileName: 'brief.docx',
      title: 'Launch brief',
      sections: [
        {
          heading: 'Overview',
          paragraphs: ['A recoverable Word document revision.'],
          bullets: ['Review with product'],
        },
      ],
      agentId: 'agent-test',
    })) as any;
    const documentText = await (generationService as any).extractDocument(
      document.buffer,
      document.originalName,
      document.mimeType,
    );
    expect(document.buffer.subarray(0, 2).toString()).toBe('PK');
    expect(documentText.text).toContain('Launch brief');
    expect(documentText.text).toContain('Review with product');

    const presentation = (await generationService.createPresentationFile({
      fileName: 'launch.pptx',
      title: 'Launch plan',
      slides: [
        {
          title: 'Launch plan',
          subtitle: 'A polished presentation',
          layout: 'title',
          notes: 'Open with the objective.',
        },
        {
          title: 'What we will cover',
          layout: 'overview',
          bullets: [
            'Audience — Who the launch serves',
            'Message — What customers should remember',
            'Channels — Where the story appears',
            'Measurement — How success is evaluated',
          ],
          notes: 'Preview the four sections.',
        },
      ],
      agentId: 'agent-test',
    })) as any;
    const presentationZip = await JSZip.loadAsync(presentation.buffer);
    expect(presentation.buffer.subarray(0, 2).toString()).toBe('PK');
    expect(
      Object.keys(presentationZip.files).filter((name) =>
        /^ppt\/slides\/slide\d+\.xml$/.test(name),
      ),
    ).toHaveLength(2);
    expect(presentation.additionalArtifacts).toHaveLength(2);
    expect(presentation.metadata.qualityReport.requestedFormat).toBe('pptx');

    const pdf = (await generationService.createPdfFile({
      fileName: 'summary.pdf',
      title: 'Summary',
      sections: [{ heading: 'Result', body: 'The artifact is complete.' }],
      agentId: 'agent-test',
    })) as any;
    expect(pdf.buffer.subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('embeds uploaded images in PPTX slides and generates slide previews', async () => {
    const imageBuffer = await sharp({
      create: {
        width: 1920,
        height: 1080,
        channels: 3,
        background: '#7cf2c4',
      },
    })
      .png()
      .toBuffer();
    const db = {
      query: {
        libraryItem: {
          findFirst: jest.fn().mockResolvedValue({
            itemId: 'image-1',
            name: 'lesson.png',
            mimeType: 'image/png',
            kind: 'image',
            sourceAgentId: 'agent-test',
            sourceSessionId: 'session-test',
            ownerUserId: 'user-test',
            workspaceId: null,
            status: 'ready',
            deletedAt: null,
          }),
        },
        libraryBlob: {
          findMany: jest.fn().mockResolvedValue([
            {
              role: 'original',
              storageBucket: 'test',
              storagePath: 'lesson.png',
            },
          ]),
        },
        libraryGrant: { findFirst: jest.fn() },
      },
    };
    const generationService = new FilesService(db as any, {} as any, {} as any);
    jest
      .spyOn(generationService as any, 'downloadBlobBuffer')
      .mockResolvedValue(imageBuffer);
    jest
      .spyOn(generationService as any, 'persistFile')
      .mockImplementation(async (input: any) => input);

    const presentation = (await generationService.createPresentationFile({
      fileName: 'visual-lesson.pptx',
      title: 'Visual lesson',
      slides: [
        {
          layout: 'full-bleed-image',
          imageFileId: 'image-1',
          imageFit: 'cover',
          notes: 'Introduce the lesson.',
        },
        {
          title: 'Key takeaways',
          layout: 'takeaways',
          bullets: [
            'Preserve — Keep the supplied artwork pristine',
            'Compose — Add editable supporting content',
          ],
          notes: 'Close with the two principles.',
        },
      ],
      theme: {
        headFontFace: 'Courier New',
        bodyFontFace: 'Courier New',
        accentColors: ['7CF2C4', 'FFE166'],
      },
      agentId: 'agent-test',
      sessionId: 'session-test',
      requiredImageFileIds: ['image-1', 'image-2'],
    })) as any;

    const zip = await JSZip.loadAsync(presentation.buffer);
    const media = Object.keys(zip.files).filter((name) =>
      /^ppt\/media\/[^/]+$/.test(name),
    );
    const notes = Object.keys(zip.files).filter((name) =>
      /^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(name),
    );
    expect(media).toHaveLength(2);
    expect(notes).toHaveLength(3);
    expect(presentation.additionalArtifacts).toHaveLength(3);
    expect(
      presentation.additionalArtifacts.every(
        (artifact: any) =>
          artifact.kind === 'presentation_slide_image' &&
          artifact.buffer.subarray(1, 4).toString() === 'PNG',
      ),
    ).toBe(true);
    expect(presentation.metadata.qualityReport).toMatchObject({
      slideCount: 3,
      imageSlides: 2,
      embeddedImageCount: 2,
      notesSlides: 3,
      previewSlides: 3,
      autoIncludedImageSlides: 1,
    });
  });

  it('allows workspace Library files to be attached to a chat', async () => {
    const db = {
      query: {
        libraryItem: {
          findMany: jest.fn().mockResolvedValue([
            {
              itemId: 'workspace-file',
              name: 'shared-brief.pdf',
              mimeType: 'application/pdf',
              kind: 'pdf',
              sizeBytes: 2048,
              sourceAgentId: null,
              sourceSessionId: 'another-session',
              ownerUserId: 'another-user',
              workspaceId: 'workspace-test',
              status: 'ready',
              textPreview: 'Shared launch brief',
              extractedTextChars: 19,
              createdAt: new Date(),
            },
          ]),
        },
        libraryBlob: {
          findMany: jest.fn().mockResolvedValue([]),
        },
        libraryGrant: {
          findFirst: jest.fn(),
        },
      },
    };
    const workspaceService = new FilesService(db as any, {} as any, {} as any);

    const result = await workspaceService.getAttachmentSummaries(
      [{ fileId: 'workspace-file' }],
      {
        agentId: 'agent-test',
        sessionId: 'session-test',
        ownerId: 'user-test',
        workspaceId: 'workspace-test',
      },
    );

    expect(result.attachments).toEqual([
      expect.objectContaining({
        fileId: 'workspace-file',
        name: 'shared-brief.pdf',
      }),
    ]);
    expect(db.query.libraryGrant.findFirst).not.toHaveBeenCalled();
  });

  it('revises PDF text without replacing the source page or font resources', async () => {
    const source = await PDFDocument.create();
    const page = source.addPage([612, 792]);
    const font = await source.embedFont(StandardFonts.TimesRoman);
    page.drawText('Original project statement', {
      x: 72,
      y: 700,
      size: 12,
      font,
    });
    const sourceBuffer = Buffer.from(await source.save());
    const pdfjsPage = {
      getTextContent: async () => ({
        items: [
          {
            str: 'Original project statement',
            fontName: 'g_d0_f1',
            transform: [12, 0, 0, 12, 72, 700],
            width: font.widthOfTextAtSize('Original project statement', 12),
            height: 12,
          },
        ],
      }),
      getOperatorList: async () => ({}),
      commonObjs: {
        get: () => ({ name: StandardFonts.TimesRoman }),
      },
    };

    const revisedBuffer = await revisePdfBufferPreservingLayout(
      sourceBuffer,
      [
        {
          find: 'Original project statement',
          replace: 'Revised project statement',
        },
      ],
      {
        document: {
          numPages: 1,
          getPage: async () => pdfjsPage,
        },
      },
    );
    const revised = await PDFDocument.load(revisedBuffer);

    expect(revised.getPageCount()).toBe(1);
    expect(revised.getPage(0).getSize()).toEqual({ width: 612, height: 792 });
    const fontResources = revised
      .getPage(0)
      .node.Resources()
      ?.lookup(PDFName.of('Font'), PDFDict);
    expect(fontResources ? [...fontResources.entries()].length : 0).toBe(1);
    expect(revisedBuffer.subarray(0, 5).toString()).toBe('%PDF-');

    expect(revisedBuffer).not.toEqual(sourceBuffer);
  });
});

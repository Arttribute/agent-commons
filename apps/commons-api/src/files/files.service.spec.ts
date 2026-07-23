import JSZip from 'jszip';
import { classifyFile, FilesService, normalizeMimeType } from './files.service';

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

  it('creates valid DOCX and PDF artifact bytes', async () => {
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

    const pdf = (await generationService.createPdfFile({
      fileName: 'summary.pdf',
      title: 'Summary',
      sections: [{ heading: 'Result', body: 'The artifact is complete.' }],
      agentId: 'agent-test',
    })) as any;
    expect(pdf.buffer.subarray(0, 5).toString()).toBe('%PDF-');
  });
});

import * as schema from '#/models/schema';
import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { awsCredentialsProvider } from '@vercel/oidc-aws-credentials-provider';
import { and, eq, gt, inArray, isNull, or } from 'drizzle-orm';
import crypto from 'crypto';
import sharp from 'sharp';
import mammoth from 'mammoth';
import * as XLSX from 'xlsx';
import JSZip from 'jszip';
import PptxGenJS from 'pptxgenjs';
import path from 'node:path';
import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFNumber,
  StandardFonts,
  beginText,
  endText,
  popGraphicsState,
  pushGraphicsState,
  rgb,
  setFillingColor,
  setFontAndSize,
  setTextMatrix,
  showText,
} from 'pdf-lib';
import { v4 as uuidv4 } from 'uuid';
import { DatabaseService } from '~/modules/database/database.service';
import { OpenAIService } from '~/modules/openai/openai.service';
import { PinataService } from '~/pinata/pinata.service';

type FileKind =
  | 'image'
  | 'pdf'
  | 'spreadsheet'
  | 'document'
  | 'presentation'
  | 'audio'
  | 'video'
  | 'archive'
  | 'code'
  | 'text'
  | 'csv'
  | 'unknown';

export type FileAttachmentRef = {
  fileId: string;
  name: string;
  mimeType: string;
  kind: FileKind;
  sizeBytes: number;
  status: string;
  textPreview?: string | null;
  extractedTextChars: number;
  artifacts?: Array<{
    artifactId: string;
    kind: string;
    mimeType: string;
    pageNumber?: number | null;
    width?: number | null;
    height?: number | null;
  }>;
};

type PersistFileInput = {
  buffer: Buffer;
  originalName: string;
  mimeType?: string;
  agentId?: string | null;
  sessionId?: string | null;
  ownerId?: string | null;
  ownerType?: 'user' | 'agent' | 'service';
  workspaceId?: string | null;
  source?: 'upload' | 'agent_generated';
  metadata?: Record<string, any>;
  storageProvider?: 's3' | 'ipfs';
  extractedTextOverride?: string;
  additionalArtifacts?: ExtractedArtifact[];
  onPersistenceStage?: (stage: string) => void;
};

type ExtractedArtifact = {
  kind: string;
  fileName: string;
  mimeType: string;
  buffer: Buffer;
  pageNumber?: number;
  width?: number;
  height?: number;
  metadata?: Record<string, any>;
};

type PersistedArtifact = Omit<ExtractedArtifact, 'buffer' | 'fileName'> & {
  storageBucket: string;
  storagePath: string;
  sizeBytes: number;
};

type ExtractionResult = {
  text: string;
  metadata: Record<string, any>;
  artifacts: ExtractedArtifact[];
  status: 'ready' | 'partial' | 'failed';
  error?: string;
};

type LoadedPresentationImage = {
  fileId: string;
  name: string;
  mimeType: string;
  buffer: Buffer;
  dataUri: string;
  width: number;
  height: number;
};

export type PdfTextReplacement = {
  /** Exact text copied from readUploadedFile, without the page marker. */
  find: string;
  /** Replacement text. It must fit within the original text region. */
  replace: string;
  /** One-based occurrence when the same passage appears more than once. */
  occurrence?: number;
};

export type PresentationTheme = {
  headFontFace?: string;
  bodyFontFace?: string;
  backgroundColor?: string;
  textColor?: string;
  mutedTextColor?: string;
  accentColors?: string[];
};

export type PresentationSlideSpec = {
  title?: string;
  subtitle?: string;
  bullets?: string[];
  notes?: string;
  layout?:
    | 'title'
    | 'title-and-content'
    | 'section'
    | 'overview'
    | 'takeaways'
    | 'full-bleed-image'
    | 'image-left'
    | 'image-right';
  imageFileId?: string;
  imageFit?: 'cover' | 'contain';
  backgroundColor?: string;
  accentColor?: string;
};

const DEFAULT_MAX_TEXT_CHARS = 250_000;
const DEFAULT_PREVIEW_CHARS = 2_000;
const DEFAULT_MAX_READ_CHARS = 12_000;
const ABSOLUTE_MAX_READ_CHARS = 50_000;
const DEFAULT_PDF_RENDER_PAGES = 24;
const DEFAULT_PDF_EMBEDDED_IMAGE_PAGES = 40;
const DEFAULT_PDF_EMBEDDED_IMAGES_PER_PAGE = 4;
const DEFAULT_PDF_EMBEDDED_IMAGE_MIN_PIXELS = 40_000;
const DEFAULT_SIGNED_URL_SECONDS = 60 * 30;

export function rawImageChannels(
  width: number,
  height: number,
  byteLength: number,
): 1 | 3 | 4 | null {
  const pixels = width * height;
  if (!Number.isFinite(pixels) || pixels <= 0) return null;
  if (byteLength === pixels) return 1;
  if (byteLength === pixels * 3) return 3;
  if (byteLength === pixels * 4) return 4;
  return null;
}

@Injectable()
export class FilesService {
  private readonly logger = new Logger(FilesService.name);
  private s3Client?: S3Client;
  private bucketReady?: Promise<void>;

  constructor(
    private readonly db: DatabaseService,
    private readonly openAI: OpenAIService,
    private readonly pinata: PinataService,
  ) {}

  async createFromUploads(
    files: Express.Multer.File[],
    input: Omit<PersistFileInput, 'buffer' | 'originalName' | 'mimeType'>,
  ): Promise<FileAttachmentRef[]> {
    if (!files?.length) throw new BadRequestException('No files were uploaded');
    const maxFiles = Number(process.env.AGENT_FILE_UPLOAD_MAX_FILES ?? 10);
    if (files.length > maxFiles) {
      throw new BadRequestException(
        `Upload at most ${maxFiles} files at a time`,
      );
    }

    const results: FileAttachmentRef[] = [];
    for (const file of files) {
      results.push(
        await this.persistFile({
          ...input,
          buffer: file.buffer,
          originalName: file.originalname,
          mimeType: file.mimetype,
        }),
      );
    }
    return results;
  }

  /** Store an agent-created output in the user library, never the computer. */
  async createGeneratedFile(input: {
    buffer: Buffer;
    fileName: string;
    mimeType: string;
    agentId: string;
    sessionId?: string;
    metadata?: Record<string, any>;
  }) {
    return this.persistFile({
      buffer: input.buffer,
      originalName: input.fileName,
      mimeType: input.mimeType,
      agentId: input.agentId,
      sessionId: input.sessionId,
      ownerId: input.agentId,
      ownerType: 'agent',
      source: 'agent_generated',
      metadata: input.metadata,
    });
  }

  async createSpreadsheetFile(input: {
    fileName: string;
    sheets: Array<{
      name: string;
      rows: Array<Record<string, any> | any[]>;
    }>;
    agentId?: string;
    sessionId?: string;
    ownerId?: string;
    ownerType?: 'user' | 'agent' | 'service';
    workspaceId?: string;
  }) {
    const fileName = sanitizeFileName(input.fileName || 'spreadsheet.xlsx');
    if (!fileName.toLowerCase().endsWith('.xlsx')) {
      throw new BadRequestException('Spreadsheet fileName must end with .xlsx');
    }
    if (!input.sheets?.length) {
      throw new BadRequestException(
        'createSpreadsheetFile requires at least one sheet',
      );
    }
    if (input.sheets.length > 20) {
      throw new BadRequestException(
        'createSpreadsheetFile supports up to 20 sheets',
      );
    }

    const workbook = XLSX.utils.book_new();
    for (const sheet of input.sheets) {
      const rows = sheet.rows ?? [];
      if (rows.length > 10_000) {
        throw new BadRequestException(
          `Sheet "${sheet.name}" exceeds the 10,000 row limit`,
        );
      }
      const worksheet = rowsToWorksheet(rows);
      XLSX.utils.book_append_sheet(
        workbook,
        worksheet,
        sanitizeSheetName(
          sheet.name || `Sheet ${workbook.SheetNames.length + 1}`,
        ),
      );
    }

    const buffer = XLSX.write(workbook, {
      type: 'buffer',
      bookType: 'xlsx',
      compression: true,
    }) as Buffer;

    return this.persistFile({
      buffer,
      originalName: fileName,
      mimeType:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      agentId: input.agentId,
      sessionId: input.sessionId,
      ownerId: input.ownerId ?? input.agentId,
      ownerType: input.ownerType ?? 'agent',
      workspaceId: input.workspaceId,
    });
  }

  async createTextFile(input: {
    fileName: string;
    content: string;
    mimeType?: string;
    agentId?: string;
    sessionId?: string;
    sourceFileId?: string;
  }) {
    const fileName = sanitizeFileName(input.fileName || 'artifact.md');
    const kind = classifyFile(
      normalizeMimeType(input.mimeType, fileName),
      fileName,
    );
    if (!['text', 'code', 'csv'].includes(kind)) {
      throw new BadRequestException(
        'Text artifacts must use a text, code, JSON, XML, HTML, Markdown, or CSV extension',
      );
    }
    if (Buffer.byteLength(input.content ?? '') > 2_000_000) {
      throw new BadRequestException('Text artifacts cannot exceed 2 MB');
    }
    return this.persistFile({
      buffer: Buffer.from(input.content ?? '', 'utf8'),
      originalName: fileName,
      mimeType: normalizeMimeType(input.mimeType, fileName),
      agentId: input.agentId,
      sessionId: input.sessionId,
      ownerId: input.agentId,
      ownerType: 'agent',
      source: 'agent_generated',
      metadata: versionMetadata(input.sourceFileId),
    });
  }

  async createDocumentFile(input: {
    fileName: string;
    title?: string;
    sections: Array<{
      heading?: string;
      paragraphs?: string[];
      bullets?: string[];
    }>;
    agentId: string;
    sessionId?: string;
    sourceFileId?: string;
  }) {
    const fileName = ensureExtension(
      sanitizeFileName(input.fileName || 'document.docx'),
      '.docx',
    );
    if (!input.sections?.length) {
      throw new BadRequestException('A document requires at least one section');
    }
    const buffer = await buildDocxBuffer({
      title: input.title,
      sections: input.sections.slice(0, 100).map((section) => ({
        heading: section.heading,
        paragraphs: (section.paragraphs ?? []).slice(0, 500),
        bullets: (section.bullets ?? []).slice(0, 500),
      })),
    });
    return this.persistFile({
      buffer,
      originalName: fileName,
      mimeType:
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      agentId: input.agentId,
      sessionId: input.sessionId,
      ownerId: input.agentId,
      ownerType: 'agent',
      source: 'agent_generated',
      metadata: versionMetadata(input.sourceFileId),
    });
  }

  async createPresentationFile(input: {
    fileName: string;
    title?: string;
    slides: PresentationSlideSpec[];
    theme?: PresentationTheme;
    agentId: string;
    sessionId?: string;
    sourceFileId?: string;
  }) {
    if (!input.slides?.length) {
      throw new BadRequestException(
        'A presentation requires at least one slide',
      );
    }
    if (input.slides.length > 100) {
      throw new BadRequestException('Presentations support up to 100 slides');
    }
    for (const [index, slide] of input.slides.entries()) {
      if (!slide.title?.trim() && !slide.imageFileId) {
        throw new BadRequestException(
          `Slide ${index + 1} requires a title or imageFileId`,
        );
      }
      if (slide.layout === 'full-bleed-image' && !slide.imageFileId) {
        throw new BadRequestException(
          `Slide ${index + 1} uses full-bleed-image and requires imageFileId`,
        );
      }
    }

    let stage = 'loading source images';
    try {
      const images = await this.loadPresentationImages(
        input.slides,
        input.agentId,
        input.sessionId,
      );
      stage = 'composing slides';
      const theme = normalizePresentationTheme(input.theme);
      const pptx = new PptxGenJS();
      pptx.layout = 'LAYOUT_WIDE';
      pptx.author = 'Agent Commons';
      pptx.subject = input.title || 'Agent Commons presentation';
      pptx.title =
        input.title || input.slides[0].title || 'Agent Commons presentation';
      pptx.company = 'Agent Commons';
      pptx.theme = {
        headFontFace: theme.headFontFace,
        bodyFontFace: theme.bodyFontFace,
      };
      for (const [index, spec] of input.slides.entries()) {
        const slide = pptx.addSlide();
        addPresentationSlide(
          pptx,
          slide,
          spec,
          theme,
          images.get(spec.imageFileId ?? ''),
          index,
        );
        if (spec.notes?.trim()) slide.addNotes(spec.notes.trim());
      }

      stage = 'writing the PPTX package';
      const output = await pptx.write({ outputType: 'nodebuffer' });
      const buffer = Buffer.isBuffer(output)
        ? output
        : Buffer.from(output as ArrayBuffer);

      stage = 'rendering slide previews';
      const previewArtifacts = await Promise.all(
        input.slides.map((slide, index) =>
          renderPresentationPreview(
            slide,
            theme,
            images.get(slide.imageFileId ?? ''),
            index,
          ),
        ),
      );
      const imageSlides = input.slides.filter(
        (slide) => slide.imageFileId,
      ).length;
      const notesSlides = input.slides.filter((slide) =>
        Boolean(slide.notes?.trim()),
      ).length;
      const qualityReport = {
        requestedFormat: 'pptx',
        slideCount: input.slides.length,
        imageSlides,
        embeddedImageCount: images.size,
        notesSlides,
        previewSlides: previewArtifacts.length,
        warnings: [
          ...(imageSlides && imageSlides !== images.size
            ? [
                'One or more source images are intentionally reused across slides.',
              ]
            : []),
          ...(notesSlides < input.slides.length
            ? [
                `${input.slides.length - notesSlides} slide(s) do not include speaker notes.`,
              ]
            : []),
        ],
      };

      stage = 'persisting the presentation artifact';
      const file = await this.persistFile({
        buffer,
        originalName: ensureExtension(
          sanitizeFileName(input.fileName || 'presentation.pptx'),
          '.pptx',
        ),
        mimeType:
          'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        agentId: input.agentId,
        sessionId: input.sessionId,
        ownerId: input.agentId,
        ownerType: 'agent',
        source: 'agent_generated',
        metadata: {
          ...versionMetadata(input.sourceFileId),
          qualityReport,
        },
        additionalArtifacts: previewArtifacts,
        onPersistenceStage: (persistenceStage) => {
          stage = persistenceStage;
        },
      });
      return { ...file, qualityReport };
    } catch (error) {
      if (
        error instanceof BadRequestException ||
        error instanceof NotFoundException
      ) {
        throw error;
      }
      const detail =
        error instanceof Error ? error.stack || error.message : String(error);
      this.logger.error(
        `Presentation generation failed while ${stage}: ${detail}`,
      );
      throw new InternalServerErrorException(
        `Presentation generation failed while ${stage}`,
      );
    }
  }

  private async loadPresentationImages(
    slides: PresentationSlideSpec[],
    agentId: string,
    sessionId?: string,
  ) {
    const fileIds = [
      ...new Set(
        slides
          .map((slide) => slide.imageFileId)
          .filter((fileId): fileId is string => Boolean(fileId)),
      ),
    ];
    const loaded = new Map<string, LoadedPresentationImage>();
    for (const fileId of fileIds) {
      const file = await this.getFileOrThrow(fileId);
      await this.assertCanAccess(file, { agentId, sessionId });
      if (file.kind !== 'image' && !file.mimeType.startsWith('image/')) {
        throw new BadRequestException(
          `${file.name} is not an image and cannot be embedded in a slide`,
        );
      }
      const original = (await this.getBlobs(file.itemId)).find(
        (blob) => blob.role === 'original',
      );
      if (!original) {
        throw new BadRequestException(
          `The original image bytes for ${file.name} are unavailable`,
        );
      }
      const buffer = await this.downloadBlobBuffer(original);
      const metadata = await sharp(buffer).metadata();
      if (!metadata.width || !metadata.height) {
        throw new BadRequestException(
          `The dimensions for ${file.name} could not be read`,
        );
      }
      const mimeType = normalizePresentationImageMime(
        file.mimeType,
        metadata.format,
      );
      loaded.set(fileId, {
        fileId,
        name: file.name,
        mimeType,
        buffer,
        dataUri: `data:${mimeType};base64,${buffer.toString('base64')}`,
        width: metadata.width,
        height: metadata.height,
      });
    }
    return loaded;
  }

  async createPdfFile(input: {
    fileName: string;
    title?: string;
    sections?: Array<{ heading?: string; body: string }>;
    replacements?: PdfTextReplacement[];
    agentId: string;
    sessionId?: string;
    sourceFileId?: string;
  }) {
    if (input.sourceFileId) {
      if (!input.replacements?.length) {
        throw new BadRequestException(
          'PDF revisions require replacements with exact find and replace text so the original typography and layout can be preserved.',
        );
      }
      const source = await this.getFileOrThrow(input.sourceFileId);
      await this.assertCanAccess(source, {
        agentId: input.agentId,
        sessionId: input.sessionId,
      });
      if (
        source.kind !== 'pdf' &&
        source.mimeType !== 'application/pdf' &&
        !source.name.toLowerCase().endsWith('.pdf')
      ) {
        throw new BadRequestException(
          'sourceFileId must reference a PDF artifact',
        );
      }
      const sourceBlobs = await this.getBlobs(source.itemId);
      const original = sourceBlobs.find((blob) => blob.role === 'original');
      if (!original) {
        throw new NotFoundException('The source PDF is unavailable');
      }
      const sourceBuffer = await this.downloadBlobBuffer(original);
      const buffer = await revisePdfBufferPreservingLayout(
        sourceBuffer,
        input.replacements.slice(0, 100),
      );
      const extractedTextBlob = sourceBlobs.find(
        (blob) => blob.role === 'extracted_text',
      );
      const extractedTextOverride = extractedTextBlob
        ? applyPdfTextReplacements(
            await this.downloadText(
              extractedTextBlob.storageBucket,
              extractedTextBlob.storagePath,
            ),
            input.replacements,
          )
        : undefined;
      return this.persistFile({
        buffer,
        originalName: ensureExtension(
          sanitizeFileName(input.fileName || source.name),
          '.pdf',
        ),
        mimeType: 'application/pdf',
        agentId: input.agentId,
        sessionId: input.sessionId,
        ownerId: input.agentId,
        ownerType: 'agent',
        source: 'agent_generated',
        extractedTextOverride,
        metadata: {
          ...versionMetadata(input.sourceFileId),
          revisionMode: 'format_preserving_text_replacement',
          replacementCount: input.replacements.length,
        },
      });
    }

    if (!input.sections?.length) {
      throw new BadRequestException('A PDF requires at least one section');
    }
    const pdf = await PDFDocument.create();
    const regular = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    const pageSize: [number, number] = [595.28, 841.89];
    const margin = 56;
    let page = pdf.addPage(pageSize);
    let y = page.getHeight() - margin;
    const addLine = (text: string, size: number, isBold = false, gap = 7) => {
      if (y < margin + size * 2) {
        page = pdf.addPage(pageSize);
        y = page.getHeight() - margin;
      }
      page.drawText(text, {
        x: margin,
        y,
        size,
        font: isBold ? bold : regular,
        color: rgb(0.09, 0.11, 0.16),
      });
      y -= size + gap;
    };
    if (input.title?.trim()) {
      for (const line of wrapPdfText(input.title.trim(), 42)) {
        addLine(line, 22, true, 8);
      }
      y -= 12;
    }
    for (const section of input.sections.slice(0, 200)) {
      if (section.heading?.trim()) {
        y -= 8;
        for (const line of wrapPdfText(section.heading.trim(), 65)) {
          addLine(line, 15, true, 6);
        }
      }
      for (const paragraph of String(section.body ?? '').split(/\n+/)) {
        for (const line of wrapPdfText(paragraph, 92)) {
          addLine(line, 10.5, false, 5);
        }
        y -= 5;
      }
    }
    const buffer = Buffer.from(await pdf.save());
    return this.persistFile({
      buffer,
      originalName: ensureExtension(
        sanitizeFileName(input.fileName || 'document.pdf'),
        '.pdf',
      ),
      mimeType: 'application/pdf',
      agentId: input.agentId,
      sessionId: input.sessionId,
      ownerId: input.agentId,
      ownerType: 'agent',
      source: 'agent_generated',
      metadata: versionMetadata(input.sourceFileId),
    });
  }

  async readFileForAgent(input: {
    fileId: string;
    agentId?: string;
    sessionId?: string;
    ownerId?: string;
    workspaceId?: string;
    offset?: number;
    maxChars?: number;
    includeImageUrls?: boolean;
    includeDownloadUrl?: boolean;
    pageNumber?: number;
  }) {
    const file = await this.getFileOrThrow(input.fileId);
    await this.assertCanAccess(file, input);

    const maxChars = clamp(
      Number(input.maxChars ?? DEFAULT_MAX_READ_CHARS),
      1,
      ABSOLUTE_MAX_READ_CHARS,
    );
    const offset = Math.max(0, Number(input.offset ?? 0));
    const extractedText = (await this.getBlobs(file.itemId)).find(
      (blob) => blob.role === 'extracted_text',
    );
    const fullText = extractedText
      ? await this.downloadText(
          extractedText.storageBucket,
          extractedText.storagePath,
        )
      : (file.textPreview ?? '');
    const content = fullText.slice(offset, offset + maxChars);
    const nextOffset = offset + content.length;
    const artifacts = await this.getArtifacts(file.itemId);
    const filteredArtifacts = input.pageNumber
      ? artifacts.filter((artifact) => artifact.pageNumber === input.pageNumber)
      : artifacts;

    return {
      fileId: file.itemId,
      name: file.name,
      mimeType: file.mimeType,
      kind: file.kind,
      status: file.status,
      content,
      offset,
      nextOffset: nextOffset < fullText.length ? nextOffset : null,
      totalChars: fullText.length,
      truncated: nextOffset < fullText.length,
      textPreview: file.textPreview,
      metadata: file.metadata ?? {},
      download: input.includeDownloadUrl
        ? await this.signedOriginal(file)
        : undefined,
      artifacts: await Promise.all(
        filteredArtifacts.map(async (artifact) => ({
          artifactId: artifact.blobId,
          kind: artifact.role,
          mimeType: artifact.mimeType,
          pageNumber: artifact.pageNumber,
          width: artifact.width,
          height: artifact.height,
          url: input.includeImageUrls
            ? await this.createSignedUrl(
                artifact.storageBucket,
                artifact.storagePath,
              )
            : undefined,
        })),
      ),
    };
  }

  async getAttachmentSummaries(
    refs: Array<{ fileId: string }>,
    context: {
      agentId?: string;
      sessionId?: string;
      ownerId?: string;
      includeImageParts?: boolean;
      maxImageParts?: number;
    },
  ): Promise<{
    text: string;
    imageParts: Array<{ type: 'image_url'; image_url: { url: string } }>;
    attachments: FileAttachmentRef[];
  }> {
    const ids = [...new Set(refs.map((ref) => ref.fileId).filter(Boolean))];
    if (!ids.length) return { text: '', imageParts: [], attachments: [] };

    const rows = await this.db.query.libraryItem.findMany({
      where: (t) => inArray(t.itemId, ids),
      orderBy: (t) => t.createdAt,
    });
    const rowsById = new Map(rows.map((row) => [row.itemId, row]));
    const ordered = ids.map((id) => rowsById.get(id)).filter(Boolean);
    for (const file of ordered) await this.assertCanAccess(file!, context);

    const bindToSessionIds = context.sessionId
      ? ordered
          .filter(
            (file) =>
              file &&
              !file.sourceSessionId &&
              (!file.sourceAgentId || file.sourceAgentId === context.agentId) &&
              (!context.ownerId ||
                samePrincipal(file.ownerUserId, context.ownerId)),
          )
          .map((file) => file!.itemId)
      : [];
    if (bindToSessionIds.length) {
      await this.db
        .insert(schema.libraryLink)
        .values(
          bindToSessionIds.map((itemId) => ({
            itemId,
            scopeType: 'session',
            scopeId: context.sessionId!,
          })),
        )
        .onConflictDoNothing();
      for (const file of ordered) {
        if (file && bindToSessionIds.includes(file.itemId)) {
          file.sourceSessionId = context.sessionId!;
        }
      }
    }

    const artifacts = ordered.length
      ? await this.db.query.libraryBlob.findMany({
          where: (t) =>
            inArray(
              t.itemId,
              ordered.map((file) => file!.itemId),
            ),
          orderBy: (t) => t.createdAt,
        })
      : [];
    const artifactsByFile = new Map<string, typeof artifacts>();
    for (const artifact of artifacts) {
      if (['original', 'extracted_text'].includes(artifact.role)) continue;
      const list = artifactsByFile.get(artifact.itemId) ?? [];
      list.push(artifact);
      artifactsByFile.set(artifact.itemId, list);
    }

    const attachments = ordered.map((file) =>
      this.toAttachmentRef(file!, artifactsByFile.get(file!.itemId) ?? []),
    );

    const lines = [
      '## Uploaded Files',
      'The user attached these files. Do not ask for them again. Use readUploadedFile with the fileId to read chunked document, presentation, spreadsheet, PDF, archive, transcript, or code content. Request image URLs for visual pages; request a signed download URL and use the persistent computer when native extraction is unavailable. File bytes and base64 are intentionally unavailable in chat history.',
      ...attachments.map((file, index) => {
        const artifactSummary = file.artifacts?.length
          ? ` Artifacts: ${file.artifacts
              .map((artifact) =>
                artifact.pageNumber
                  ? `${artifact.kind} page ${artifact.pageNumber}`
                  : artifact.kind,
              )
              .join(', ')}.`
          : '';
        const preview = file.textPreview
          ? `\nPreview:\n${file.textPreview}`
          : '';
        return `${index + 1}. ${file.name} (fileId: ${file.fileId}, ${file.kind}, ${file.mimeType}, ${formatBytes(file.sizeBytes)}, status: ${file.status}). Extracted text chars: ${file.extractedTextChars}.${artifactSummary}${preview}`;
      }),
    ];

    const imageParts: Array<{ type: 'image_url'; image_url: { url: string } }> =
      [];
    if (context.includeImageParts) {
      const maxImageParts = clamp(Number(context.maxImageParts ?? 4), 0, 8);
      const visualArtifacts = artifacts.filter((artifact) =>
        ['image', 'pdf_embedded_image', 'pdf_page_image'].includes(
          artifact.role,
        ),
      );
      for (const artifact of visualArtifacts.slice(0, maxImageParts)) {
        imageParts.push({
          type: 'image_url',
          image_url: {
            url: await this.createSignedUrl(
              artifact.storageBucket,
              artifact.storagePath,
            ),
          },
        });
      }
    }

    return {
      text: lines.join('\n\n'),
      imageParts,
      attachments,
    };
  }

  async getFileMetadata(
    fileId: string,
    context: {
      agentId?: string;
      sessionId?: string;
      ownerId?: string;
      workspaceId?: string;
    },
  ) {
    const file = await this.getFileOrThrow(fileId);
    await this.assertCanAccess(file, context);
    return this.toAttachmentRef(file, await this.getArtifacts(file.itemId));
  }

  async createDownloadUrl(
    fileId: string,
    context: {
      agentId?: string;
      sessionId?: string;
      ownerId?: string;
      workspaceId?: string;
    },
  ) {
    const file = await this.getFileOrThrow(fileId);
    await this.assertCanAccess(file, context);
    return this.signedOriginal(file);
  }

  async createInlineUrl(
    fileId: string,
    context: {
      agentId?: string;
      sessionId?: string;
      ownerId?: string;
      workspaceId?: string;
    },
  ) {
    const file = await this.getFileOrThrow(fileId);
    await this.assertCanAccess(file, context);
    return this.signedOriginal(file, true);
  }

  async createPreviewUrl(
    fileId: string,
    context: {
      agentId?: string;
      sessionId?: string;
      ownerId?: string;
      workspaceId?: string;
    },
  ) {
    const file = await this.getFileOrThrow(fileId);
    await this.assertCanAccess(file, context);
    const artifact = (
      await this.db.query.libraryBlob.findMany({
        where: (t) =>
          and(
            eq(t.itemId, fileId),
            or(
              eq(t.role, 'image'),
              eq(t.role, 'pdf_page_image'),
              eq(t.role, 'presentation_slide_image'),
              eq(t.role, 'thumbnail'),
            ),
          ),
        orderBy: (t) => t.createdAt,
        limit: 1,
      })
    )[0];
    if (!artifact) return null;
    return this.createSignedUrl(artifact.storageBucket, artifact.storagePath);
  }

  /** Internal-only: caller must already have validated a share capability. */
  async createShareDownloadUrl(fileId: string) {
    const file = await this.getFileOrThrow(fileId);
    return this.signedOriginal(file);
  }

  private async persistFile(
    input: PersistFileInput,
  ): Promise<FileAttachmentRef> {
    const updateStage = (stage: string) => input.onPersistenceStage?.(stage);
    updateStage('validating the presentation artifact');
    const maxBytes = Number(
      process.env.AGENT_FILE_UPLOAD_MAX_BYTES ?? 50 * 1024 * 1024,
    );
    if (!input.buffer?.length)
      throw new BadRequestException('Uploaded file is empty');
    if (input.buffer.length > maxBytes) {
      throw new BadRequestException(
        `File exceeds upload limit (${formatBytes(maxBytes)})`,
      );
    }

    const fileId = uuidv4();
    const originalName = sanitizeFileName(input.originalName || 'upload');
    const mimeType = normalizeMimeType(input.mimeType, originalName);
    const kind = classifyFile(mimeType, originalName);
    const sha256 = crypto
      .createHash('sha256')
      .update(input.buffer)
      .digest('hex');
    updateStage('resolving presentation ownership');
    const ownership = await this.resolveOwnership(input);
    updateStage('resolving presentation storage');
    const storageProvider = await this.resolveStorageProvider(
      ownership.ownerUserId,
      input.storageProvider,
    );
    const bucket = storageProvider === 's3' ? this.bucketName() : 'ipfs';
    if (storageProvider === 's3') {
      updateStage('checking presentation storage');
      await this.ensureBucket();
    }
    const ownerSegment = crypto
      .createHash('sha256')
      .update(input.workspaceId || ownership.ownerUserId)
      .digest('hex')
      .slice(0, 32);
    const agentSegment = sanitizePathSegment(input.agentId || 'no-agent');
    const sessionSegment = sanitizePathSegment(input.sessionId || 'no-session');
    const basePath = [
      this.keyPrefix(),
      ownerSegment,
      'library',
      agentSegment,
      sessionSegment,
      fileId,
    ]
      .filter(Boolean)
      .join('/');
    updateStage('storing the PPTX file');
    const original = await this.storeBuffer(
      storageProvider,
      bucket,
      `${basePath}/original/${originalName}`,
      input.buffer,
      mimeType,
      originalName,
    );
    const storagePath = original.path;

    let extraction: ExtractionResult;
    try {
      updateStage('extracting presentation text');
      extraction = await this.extractFile(
        input.buffer,
        originalName,
        mimeType,
        kind,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Extraction failed for ${originalName}: ${message}`);
      extraction = {
        text: '',
        metadata: {},
        artifacts: [],
        status: 'failed',
        error: message,
      };
    }
    if (input.extractedTextOverride !== undefined) {
      extraction.text = input.extractedTextOverride;
    }
    if (input.additionalArtifacts?.length) {
      extraction.artifacts.push(...input.additionalArtifacts);
      extraction.metadata = {
        ...extraction.metadata,
        derivedArtifactCount: extraction.artifacts.length,
      };
    }

    const persistedArtifacts: PersistedArtifact[] = [];
    if (kind === 'image') {
      const dimensions: { width?: number; height?: number } =
        await this.imageMetadata(input.buffer).catch(() => ({}));
      persistedArtifacts.push({
        kind: 'image',
        storageBucket: bucket,
        storagePath,
        mimeType,
        sizeBytes: input.buffer.length,
        width: dimensions.width,
        height: dimensions.height,
        metadata: { source: 'original' },
      });
    }

    for (const artifact of extraction.artifacts) {
      updateStage(
        `storing presentation preview ${artifact.pageNumber ?? persistedArtifacts.length + 1}`,
      );
      const artifactPath = `${basePath}/derived/${sanitizeFileName(artifact.fileName)}`;
      const storedArtifact = await this.storeBuffer(
        storageProvider,
        bucket,
        artifactPath,
        artifact.buffer,
        artifact.mimeType,
        artifact.fileName,
      );
      persistedArtifacts.push({
        kind: artifact.kind,
        storageBucket: storedArtifact.bucket,
        storagePath: storedArtifact.path,
        mimeType: artifact.mimeType,
        sizeBytes: artifact.buffer.length,
        pageNumber: artifact.pageNumber,
        width: artifact.width,
        height: artifact.height,
        metadata: artifact.metadata,
      });
    }

    const text = this.capExtractedText(extraction.text);
    let textStoragePath = text
      ? `${basePath}/derived/extracted.txt`
      : undefined;
    if (textStoragePath) {
      updateStage('storing extracted presentation text');
      const storedText = await this.storeBuffer(
        storageProvider,
        bucket,
        textStoragePath,
        Buffer.from(text, 'utf8'),
        'text/plain; charset=utf-8',
        'extracted.txt',
      );
      textStoragePath = storedText.path;
    }

    updateStage('creating the presentation library record');
    const [file] = await this.db
      .insert(schema.libraryItem)
      .values({
        itemId: fileId,
        ownerUserId: ownership.ownerUserId,
        sourceAgentId: input.agentId || null,
        sourceSessionId: input.sessionId || null,
        workspaceId: input.workspaceId || ownership.workspaceId || null,
        name: originalName,
        mimeType,
        kind: libraryKind(kind),
        sizeBytes: input.buffer.length,
        sha256,
        source:
          input.source ??
          (input.ownerType === 'agent' ? 'agent_generated' : 'upload'),
        status: extraction.status,
        textPreview: text ? text.slice(0, DEFAULT_PREVIEW_CHARS) : null,
        extractedTextChars: text.length,
        extractionError: extraction.error,
        metadata: {
          ...extraction.metadata,
          ...input.metadata,
          storageProvider,
          maxExtractedTextChars: this.maxExtractedTextChars(),
          originalTextChars: extraction.text.length,
          textTruncated: extraction.text.length > text.length,
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    updateStage('creating presentation blob records');
    await this.db.insert(schema.libraryBlob).values([
      {
        itemId: fileId,
        role: 'original',
        storageProvider,
        storageBucket: bucket,
        storagePath,
        mimeType,
        sizeBytes: input.buffer.length,
        metadata: { contentDisposition: 'attachment' },
      },
      ...persistedArtifacts.map((artifact) => ({
        itemId: fileId,
        role: artifact.kind,
        storageProvider,
        storageBucket: artifact.storageBucket,
        storagePath: artifact.storagePath,
        mimeType: artifact.mimeType,
        sizeBytes: artifact.sizeBytes,
        pageNumber: artifact.pageNumber,
        width: artifact.width,
        height: artifact.height,
        metadata: artifact.metadata,
        createdAt: new Date(),
      })),
      ...(textStoragePath
        ? [
            {
              itemId: fileId,
              role: 'extracted_text',
              storageProvider,
              storageBucket: bucket,
              storagePath: textStoragePath,
              mimeType: 'text/plain; charset=utf-8',
              sizeBytes: Buffer.byteLength(text),
              metadata: {},
            },
          ]
        : []),
    ]);

    if (input.sessionId) {
      updateStage('linking the presentation to the session');
      await this.db
        .insert(schema.libraryLink)
        .values({
          itemId: fileId,
          scopeType: 'session',
          scopeId: input.sessionId,
        })
        .onConflictDoNothing();
    }
    updateStage('indexing presentation text');
    await this.indexText(fileId, text);
    updateStage('auditing presentation creation');
    await this.audit(
      fileId,
      input.ownerType ?? 'user',
      input.ownerId ?? ownership.ownerUserId,
      'created',
    );

    updateStage('loading the completed presentation');
    const artifacts = await this.getArtifacts(fileId);
    return this.toAttachmentRef(file, artifacts);
  }

  private async extractFile(
    buffer: Buffer,
    originalName: string,
    mimeType: string,
    kind: FileKind,
  ): Promise<ExtractionResult> {
    switch (kind) {
      case 'pdf':
        return this.extractPdf(buffer);
      case 'spreadsheet':
        return this.extractSpreadsheet(buffer);
      case 'document':
        return this.extractDocument(buffer, originalName, mimeType);
      case 'presentation':
        return this.extractPresentation(buffer, originalName);
      case 'archive':
        return this.extractArchive(buffer, originalName);
      case 'audio':
      case 'video':
        return this.extractMedia(buffer, originalName, mimeType, kind);
      case 'csv':
      case 'text':
      case 'code':
        return {
          text: buffer.toString('utf8'),
          metadata: { encoding: 'utf8' },
          artifacts: [],
          status: 'ready',
        };
      case 'image': {
        const metadata = await this.imageMetadata(buffer);
        return {
          text: '',
          metadata,
          // Keep a visual artifact alongside the original blob. Agent runs use
          // artifact URLs for multimodal input; without this, an attached image
          // was stored successfully but remained invisible to the model.
          artifacts: [
            {
              kind: 'image',
              fileName: originalName,
              mimeType,
              buffer,
              width: metadata.width,
              height: metadata.height,
              metadata: { source: 'uploaded-image' },
            },
          ],
          status: 'ready',
        };
      }
      default:
        return {
          text: '',
          metadata: { note: 'No extractor available for this file type' },
          artifacts: [],
          status: 'partial',
        };
    }
  }

  private async extractPdf(buffer: Buffer): Promise<ExtractionResult> {
    const pdfjs = (await import('pdfjs-dist/legacy/build/pdf.mjs')) as any;
    const pdfjsRoot = path.dirname(require.resolve('pdfjs-dist/package.json'));
    const loadingTask = pdfjs.getDocument({
      data: new Uint8Array(buffer),
      disableWorker: true,
      // Docker images do not necessarily contain Helvetica/Times/Courier.
      // Always point pdf.js at its packaged fonts so rendered artifacts match
      // the actual PDF instead of silently dropping most glyphs.
      useSystemFonts: false,
      standardFontDataUrl: `${path.join(pdfjsRoot, 'standard_fonts')}${path.sep}`,
      cMapUrl: `${path.join(pdfjsRoot, 'cmaps')}${path.sep}`,
      cMapPacked: true,
    });
    const pdf = await loadingTask.promise;
    const maxTextPages = Math.min(
      pdf.numPages,
      Number(process.env.AGENT_FILE_PDF_TEXT_PAGES ?? 120),
    );
    const pageTexts: string[] = [];
    const artifacts: ExtractedArtifact[] = [];
    const embeddedImagePages = Math.min(
      pdf.numPages,
      Number(
        process.env.AGENT_FILE_PDF_EMBEDDED_IMAGE_PAGES ??
          DEFAULT_PDF_EMBEDDED_IMAGE_PAGES,
      ),
    );
    for (let pageNumber = 1; pageNumber <= maxTextPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const textContent = await page.getTextContent();
      const text = textContent.items
        .map((item: any) => ('str' in item ? item.str : ''))
        .filter(Boolean)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (text) pageTexts.push(`--- Page ${pageNumber} ---\n${text}`);
      if (pageNumber <= embeddedImagePages) {
        const pageImages = await this.extractPdfPageImages(
          pdfjs,
          page,
          pageNumber,
        ).catch((error) => {
          this.logger.warn(
            `Could not extract embedded images from PDF page ${pageNumber}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
          return [];
        });
        artifacts.push(...pageImages);
      }
    }

    const renderPages = Math.min(
      pdf.numPages,
      Number(
        process.env.AGENT_FILE_PDF_RENDER_PAGES ?? DEFAULT_PDF_RENDER_PAGES,
      ),
    );
    for (let pageNumber = 1; pageNumber <= renderPages; pageNumber += 1) {
      const rendered = await this.renderPdfPage(pdf, pageNumber).catch(
        (error) => {
          this.logger.warn(
            `Could not render PDF page ${pageNumber}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
          return null;
        },
      );
      if (rendered) {
        artifacts.push({
          kind: 'pdf_page_image',
          fileName: `page-${pageNumber}.png`,
          mimeType: 'image/png',
          buffer: rendered.buffer,
          pageNumber,
          width: rendered.width,
          height: rendered.height,
          metadata: { source: 'pdf-page-render' },
        });
      }
    }

    await loadingTask.destroy?.();

    const text = pageTexts.join('\n\n');
    return {
      text,
      metadata: {
        pages: pdf.numPages,
        textPagesExtracted: maxTextPages,
        embeddedImages: artifacts.filter(
          (artifact) => artifact.kind === 'pdf_embedded_image',
        ).length,
        renderedPages: artifacts.filter(
          (artifact) => artifact.kind === 'pdf_page_image',
        ).length,
      },
      artifacts,
      status: text || artifacts.length ? 'ready' : 'partial',
    };
  }

  private async extractPdfPageImages(
    pdfjs: any,
    page: any,
    pageNumber: number,
  ): Promise<ExtractedArtifact[]> {
    const operatorList = await page.getOperatorList();
    const imageOperators = new Set([
      pdfjs.OPS.paintImageXObject,
      pdfjs.OPS.paintInlineImageXObject,
    ]);
    const maxImages = Number(
      process.env.AGENT_FILE_PDF_EMBEDDED_IMAGES_PER_PAGE ??
        DEFAULT_PDF_EMBEDDED_IMAGES_PER_PAGE,
    );
    const minPixels = Number(
      process.env.AGENT_FILE_PDF_EMBEDDED_IMAGE_MIN_PIXELS ??
        DEFAULT_PDF_EMBEDDED_IMAGE_MIN_PIXELS,
    );
    const seen = new Set<string>();
    const artifacts: ExtractedArtifact[] = [];

    for (let index = 0; index < operatorList.fnArray.length; index += 1) {
      if (!imageOperators.has(operatorList.fnArray[index])) continue;
      const argument = operatorList.argsArray[index]?.[0];
      const identity =
        typeof argument === 'string' ? argument : `inline-${index}`;
      if (seen.has(identity)) continue;
      seen.add(identity);

      const image =
        typeof argument === 'string'
          ? await this.resolvePdfImageObject(page, argument)
          : argument;
      const width = Number(image?.width ?? 0);
      const height = Number(image?.height ?? 0);
      const data = image?.data;
      if (
        !width ||
        !height ||
        width * height < minPixels ||
        !data ||
        !ArrayBuffer.isView(data)
      ) {
        continue;
      }
      const channels = rawImageChannels(width, height, data.byteLength);
      if (!channels) continue;

      const output = await sharp(
        Buffer.from(data.buffer, data.byteOffset, data.byteLength),
        {
          raw: { width, height, channels },
        },
      )
        .png({ compressionLevel: 8 })
        .toBuffer();
      const imageNumber = artifacts.length + 1;
      artifacts.push({
        kind: 'pdf_embedded_image',
        fileName: `page-${pageNumber}-image-${imageNumber}.png`,
        mimeType: 'image/png',
        buffer: output,
        pageNumber,
        width,
        height,
        metadata: {
          source: 'pdf-embedded-image',
          imageNumber,
          objectId: identity,
        },
      });
      if (artifacts.length >= maxImages) break;
    }

    return artifacts;
  }

  private async resolvePdfImageObject(page: any, objectId: string) {
    return new Promise<any>((resolve, reject) => {
      try {
        const value = page.objs.get(objectId, (resolved: any) =>
          resolve(resolved),
        );
        if (value) resolve(value);
      } catch (error) {
        reject(error);
      }
    });
  }

  private async renderPdfPage(pdf: any, pageNumber: number) {
    const { createCanvas } = await import('@napi-rs/canvas');
    const page = await pdf.getPage(pageNumber);
    const baseViewport = page.getViewport({ scale: 1 });
    const maxDimension = Number(
      process.env.AGENT_FILE_PDF_RENDER_MAX_PX ?? 1400,
    );
    const scale = Math.min(
      2,
      maxDimension / Math.max(baseViewport.width, baseViewport.height),
    );
    const viewport = page.getViewport({ scale });
    const width = Math.ceil(viewport.width);
    const height = Math.ceil(viewport.height);
    const canvas = createCanvas(width, height);
    const canvasContext = canvas.getContext('2d') as any;
    await page.render({ canvasContext, viewport }).promise;
    return {
      buffer: canvas.toBuffer('image/png'),
      width,
      height,
    };
  }

  private async extractSpreadsheet(buffer: Buffer): Promise<ExtractionResult> {
    const workbook = XLSX.read(buffer, {
      type: 'buffer',
      cellDates: true,
      dense: false,
    });
    const parts: string[] = [];
    const sheets = workbook.SheetNames.map((name) => {
      const sheet = workbook.Sheets[name];
      const rows = XLSX.utils.sheet_to_json(sheet, {
        header: 1,
        blankrows: false,
        raw: false,
      }) as any[][];
      const columns = rows.reduce(
        (max, row) => Math.max(max, Array.isArray(row) ? row.length : 0),
        0,
      );
      const csv = XLSX.utils.sheet_to_csv(sheet, { blankrows: false });
      parts.push(`## Sheet: ${name}\n${csv}`);
      return {
        name,
        range: sheet['!ref'] ?? null,
        rows: rows.length,
        columns,
      };
    });

    return {
      text: parts.join('\n\n'),
      metadata: { sheets },
      artifacts: [],
      status: 'ready',
    };
  }

  private async extractDocument(
    buffer: Buffer,
    originalName: string,
    mimeType: string,
  ): Promise<ExtractionResult> {
    if (
      mimeType ===
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      originalName.toLowerCase().endsWith('.docx')
    ) {
      const result = await mammoth.extractRawText({ buffer });
      return {
        text: result.value ?? '',
        metadata: {
          warnings: result.messages?.map((message) => message.message) ?? [],
        },
        artifacts: [],
        status: result.value?.trim() ? 'ready' : 'partial',
      };
    }

    if (
      mimeType === 'application/vnd.oasis.opendocument.text' ||
      originalName.toLowerCase().endsWith('.odt')
    ) {
      return this.extractOpenDocument(buffer, 'document');
    }

    if (
      mimeType === 'application/rtf' ||
      mimeType === 'text/rtf' ||
      originalName.toLowerCase().endsWith('.rtf')
    ) {
      const text = extractRtfText(buffer.toString('latin1'));
      return {
        text,
        metadata: { format: 'rtf' },
        artifacts: [],
        status: text ? 'ready' : 'partial',
      };
    }

    return {
      text: '',
      metadata: {
        note: 'The original document is available to the agent through a signed download URL for computer-assisted processing.',
      },
      artifacts: [],
      status: 'partial',
    };
  }

  private async extractPresentation(
    buffer: Buffer,
    originalName: string,
  ): Promise<ExtractionResult> {
    if (originalName.toLowerCase().endsWith('.odp')) {
      return this.extractOpenDocument(buffer, 'presentation');
    }
    const zip = await JSZip.loadAsync(buffer);
    const slidePaths = Object.keys(zip.files)
      .filter((path) => /^ppt\/slides\/slide\d+\.xml$/i.test(path))
      .sort(naturalArchivePathSort);
    const notePaths = Object.keys(zip.files)
      .filter((path) => /^ppt\/notesSlides\/notesSlide\d+\.xml$/i.test(path))
      .sort(naturalArchivePathSort);
    const slideTexts: string[] = [];
    for (const [index, path] of slidePaths.entries()) {
      const xml = await zip.file(path)!.async('string');
      const lines = extractXmlTextLines(xml);
      const notePath = notePaths[index];
      const notes = notePath
        ? extractXmlTextLines(await zip.file(notePath)!.async('string'))
        : [];
      slideTexts.push(
        [
          `--- Slide ${index + 1} ---`,
          ...lines,
          ...(notes.length ? ['Notes:', ...notes] : []),
        ].join('\n'),
      );
    }
    const text = slideTexts.join('\n\n');
    return {
      text,
      metadata: {
        format: 'pptx',
        slides: slidePaths.length,
        slideTitles: slideTexts
          .map((slide) => slide.split('\n')[1] ?? '')
          .slice(0, 100),
      },
      artifacts: [],
      status: text ? 'ready' : 'partial',
    };
  }

  private async extractOpenDocument(
    buffer: Buffer,
    kind: 'document' | 'presentation',
  ): Promise<ExtractionResult> {
    const zip = await JSZip.loadAsync(buffer);
    const content = zip.file('content.xml');
    if (!content) {
      return {
        text: '',
        metadata: { format: kind === 'presentation' ? 'odp' : 'odt' },
        artifacts: [],
        status: 'partial',
        error: 'OpenDocument content.xml was not found',
      };
    }
    const xml = await content.async('string');
    const lines = extractXmlTextLines(xml);
    const text =
      kind === 'presentation'
        ? lines
            .map((line, index) => `--- Slide content ${index + 1} ---\n${line}`)
            .join('\n\n')
        : lines.join('\n');
    return {
      text,
      metadata: {
        format: kind === 'presentation' ? 'odp' : 'odt',
      },
      artifacts: [],
      status: text ? 'ready' : 'partial',
    };
  }

  private async extractArchive(
    buffer: Buffer,
    originalName: string,
  ): Promise<ExtractionResult> {
    if (!/\.zip$/i.test(originalName)) {
      return {
        text: '',
        metadata: {
          note: 'Archive stored successfully. Use the signed original URL with the agent computer to inspect its contents.',
        },
        artifacts: [],
        status: 'partial',
      };
    }
    const zip = await JSZip.loadAsync(buffer);
    const entries = Object.values(zip.files)
      .filter((entry) => !entry.dir)
      .slice(0, 5_000)
      .map((entry) => entry.name);
    return {
      text: entries.map((entry) => `- ${entry}`).join('\n'),
      metadata: {
        format: 'zip',
        entries: entries.length,
        entriesTruncated: Object.keys(zip.files).length > entries.length,
      },
      artifacts: [],
      status: 'ready',
    };
  }

  private async extractMedia(
    buffer: Buffer,
    originalName: string,
    mimeType: string,
    kind: 'audio' | 'video',
  ): Promise<ExtractionResult> {
    if (
      kind === 'audio' &&
      process.env.AGENT_FILE_AUDIO_TRANSCRIPTION_ENABLED === 'true' &&
      process.env.OPENAI_API_KEY
    ) {
      try {
        const file = new File([new Uint8Array(buffer)], originalName, {
          type: mimeType,
        });
        const transcription = await this.openAI.audio.transcriptions.create({
          file,
          model:
            process.env.AGENT_FILE_AUDIO_TRANSCRIPTION_MODEL ||
            'gpt-4o-mini-transcribe',
        });
        const text = transcription.text ?? '';
        return {
          text,
          metadata: {
            mediaKind: kind,
            transcriptionModel:
              process.env.AGENT_FILE_AUDIO_TRANSCRIPTION_MODEL ||
              'gpt-4o-mini-transcribe',
          },
          artifacts: [],
          status: text ? 'ready' : 'partial',
        };
      } catch (error) {
        this.logger.warn(
          `Audio transcription failed for ${originalName}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
    return {
      text: '',
      metadata: {
        mediaKind: kind,
        note:
          kind === 'audio'
            ? 'Audio is playable in the artifact workspace. Enable AGENT_FILE_AUDIO_TRANSCRIPTION_ENABLED for automatic searchable transcripts.'
            : 'Video is playable in the artifact workspace and available to the agent computer through a signed URL.',
      },
      artifacts: [],
      status: 'partial',
    };
  }

  private async imageMetadata(buffer: Buffer) {
    const metadata = await sharp(buffer).metadata();
    return {
      width: metadata.width,
      height: metadata.height,
      format: metadata.format,
      space: metadata.space,
      pages: metadata.pages,
    };
  }

  private async getFileOrThrow(fileId: string) {
    const file = await this.db.query.libraryItem.findFirst({
      where: (t) => and(eq(t.itemId, fileId), isNull(t.deletedAt)),
    });
    if (!file) throw new NotFoundException(`File ${fileId} not found`);
    return file;
  }

  private async getArtifacts(fileId: string) {
    return this.db.query.libraryBlob.findMany({
      where: (t) =>
        and(
          eq(t.itemId, fileId),
          or(
            eq(t.role, 'image'),
            eq(t.role, 'pdf_page_image'),
            eq(t.role, 'presentation_slide_image'),
            eq(t.role, 'thumbnail'),
          ),
        ),
      orderBy: (t) => t.createdAt,
    });
  }

  private async getBlobs(fileId: string) {
    return this.db.query.libraryBlob.findMany({
      where: (t) => eq(t.itemId, fileId),
      orderBy: (t) => t.createdAt,
    });
  }

  private async assertCanAccess(
    file: {
      itemId: string;
      sourceAgentId: string | null;
      sourceSessionId: string | null;
      ownerUserId: string;
      workspaceId: string | null;
      status: string;
    },
    context: {
      agentId?: string;
      sessionId?: string;
      ownerId?: string;
      workspaceId?: string;
    },
  ) {
    if (['quarantined', 'deleted', 'processing'].includes(file.status)) {
      throw new BadRequestException(
        'File is not available while it is being secured',
      );
    }
    if (context.ownerId && samePrincipal(file.ownerUserId, context.ownerId))
      return;
    if (
      context.workspaceId &&
      file.workspaceId &&
      samePrincipal(file.workspaceId, context.workspaceId)
    ) {
      return;
    }
    if (
      context.agentId &&
      context.sessionId &&
      file.sourceAgentId === context.agentId &&
      file.sourceSessionId === context.sessionId
    )
      return;

    const subjects = [
      context.ownerId ? { type: 'user', id: context.ownerId } : null,
      context.agentId ? { type: 'agent', id: context.agentId } : null,
      context.workspaceId
        ? { type: 'workspace', id: context.workspaceId }
        : null,
    ].filter(Boolean) as Array<{ type: string; id: string }>;
    if (subjects.length) {
      const grant = await this.db.query.libraryGrant.findFirst({
        where: (t) =>
          and(
            eq(t.itemId, file.itemId),
            or(
              ...subjects.map((subject) =>
                and(
                  eq(t.subjectType, subject.type),
                  eq(t.subjectId, subject.id),
                ),
              ),
            ),
            or(isNull(t.expiresAt), gt(t.expiresAt, new Date())),
          ),
      });
      if (grant) return;
    }
    throw new NotFoundException('File not found');
  }

  private async downloadText(bucket: string, path: string) {
    if (bucket === 'ipfs') {
      const data = await this.pinata.fetchFile(path);
      if (typeof data === 'string') return data;
      if (Buffer.isBuffer(data)) return data.toString('utf8');
      if (data instanceof Blob) return data.text();
      if (data instanceof ArrayBuffer)
        return Buffer.from(data).toString('utf8');
      return JSON.stringify(data);
    }
    const response = await this.s3().send(
      new GetObjectCommand({ Bucket: bucket, Key: path }) as any,
    );
    return streamToString((response as any).Body);
  }

  private async downloadBlobBuffer(blob: {
    storageBucket: string;
    storagePath: string;
  }) {
    if (blob.storageBucket === 'ipfs') {
      const data = await this.pinata.fetchFile(blob.storagePath);
      if (Buffer.isBuffer(data)) return data;
      if (typeof data === 'string') return Buffer.from(data);
      if (data instanceof Blob) return Buffer.from(await data.arrayBuffer());
      if (data instanceof ArrayBuffer) return Buffer.from(data);
      if (data instanceof Uint8Array) return Buffer.from(data);
      throw new BadRequestException('The source PDF could not be downloaded');
    }
    const response = await this.s3().send(
      new GetObjectCommand({
        Bucket: blob.storageBucket,
        Key: blob.storagePath,
      }) as any,
    );
    return streamToBuffer((response as any).Body);
  }

  private async createSignedUrl(bucket: string, path: string) {
    if (bucket === 'ipfs') {
      const gateway = (process.env.GATEWAY_URL || 'gateway.pinata.cloud')
        .replace(/^https?:\/\//, '')
        .replace(/\/$/, '');
      return `https://${gateway}/ipfs/${encodeURIComponent(path)}`;
    }
    return getSignedUrl(
      this.s3() as any,
      new GetObjectCommand({ Bucket: bucket, Key: path }) as any,
      {
        expiresIn: Number(
          process.env.AGENT_FILE_SIGNED_URL_SECONDS ??
            DEFAULT_SIGNED_URL_SECONDS,
        ),
      },
    );
  }

  private async uploadBuffer(
    bucket: string,
    path: string,
    buffer: Buffer,
    contentType: string,
  ) {
    await this.s3().send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: path,
        Body: buffer,
        ContentType: contentType,
        ContentDisposition: isSafeInlineType(contentType)
          ? 'inline'
          : 'attachment',
        ServerSideEncryption: process.env.AGENT_FILES_S3_KMS_KEY_ID
          ? 'aws:kms'
          : process.env.AGENT_FILE_S3_SSE === 'false'
            ? undefined
            : 'AES256',
        SSEKMSKeyId: process.env.AGENT_FILES_S3_KMS_KEY_ID,
      }),
    );
  }

  private async storeBuffer(
    provider: 's3' | 'ipfs',
    bucket: string,
    path: string,
    buffer: Buffer,
    contentType: string,
    fileName: string,
  ) {
    if (provider === 'ipfs') {
      if (!process.env.PINATA_JWT) {
        throw new BadRequestException(
          'IPFS storage is not configured. Choose Private S3 or configure Pinata.',
        );
      }
      const result = await this.pinata.uploadFile(
        buffer,
        fileName,
        contentType,
      );
      const cid = result?.IpfsHash;
      if (!cid)
        throw new BadRequestException('IPFS upload did not return a CID');
      return { bucket: 'ipfs', path: cid as string };
    }
    await this.uploadBuffer(bucket, path, buffer, contentType);
    return { bucket, path };
  }

  private async resolveStorageProvider(
    ownerUserId: string,
    override?: 's3' | 'ipfs',
  ): Promise<'s3' | 'ipfs'> {
    if (override) return override;
    const preference = await this.db.query.libraryPreference.findFirst({
      where: (table) => eq(table.ownerUserId, ownerUserId),
    });
    return preference?.defaultStorageProvider === 'ipfs' ? 'ipfs' : 's3';
  }

  private async ensureBucket() {
    if (!this.bucketReady) {
      this.bucketReady = (async () => {
        const bucket = this.bucketName();
        try {
          await this.s3().send(new HeadBucketCommand({ Bucket: bucket }));
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          throw new BadRequestException(
            `S3 file bucket "${bucket}" is not accessible: ${message}`,
          );
        }
      })();
    }
    return this.bucketReady;
  }

  private s3() {
    if (this.s3Client) return this.s3Client;
    const region =
      process.env.AGENT_FILES_S3_REGION ||
      process.env.AWS_REGION ||
      process.env.AWS_DEFAULT_REGION ||
      'us-east-1';
    const sharedConfig = {
      region,
      endpoint: process.env.AGENT_FILES_S3_ENDPOINT,
      forcePathStyle: process.env.AGENT_FILES_S3_FORCE_PATH_STYLE === 'true',
    };
    const credentials = this.s3Credentials(region);
    this.s3Client = new S3Client({
      ...sharedConfig,
      ...(credentials ? { credentials } : {}),
    });
    return this.s3Client;
  }

  private s3Credentials(region: string) {
    const accessKeyId = process.env.AGENT_FILES_AWS_ACCESS_KEY_ID;
    const secretAccessKey = process.env.AGENT_FILES_AWS_SECRET_ACCESS_KEY;
    if (accessKeyId || secretAccessKey) {
      if (!accessKeyId || !secretAccessKey) {
        throw new BadRequestException(
          'Set both AGENT_FILES_AWS_ACCESS_KEY_ID and AGENT_FILES_AWS_SECRET_ACCESS_KEY, or neither.',
        );
      }
      return {
        accessKeyId,
        secretAccessKey,
        sessionToken: process.env.AGENT_FILES_AWS_SESSION_TOKEN,
      };
    }

    const roleArn =
      process.env.AGENT_FILES_AWS_ROLE_ARN || process.env.AWS_ROLE_ARN;
    if (!roleArn) return undefined;

    if (hasVercelOidcEnvironment()) {
      return awsCredentialsProvider({
        roleArn,
        audience: 'https://sts.amazonaws.com',
        clientConfig: { region },
        roleSessionName: 'agent-commons-files',
      });
    }

    this.logger.warn(
      'AGENT_FILES_AWS_ROLE_ARN/AWS_ROLE_ARN is set, but Vercel OIDC is not available. Falling back to the default AWS credential provider chain.',
    );
    return undefined;
  }

  private bucketName() {
    const bucket =
      process.env.AGENT_FILES_S3_BUCKET ||
      process.env.S3_FILE_BUCKET ||
      process.env.AWS_S3_BUCKET;
    if (!bucket) {
      throw new BadRequestException(
        'File storage is not configured. Set AGENT_FILES_S3_BUCKET for chat attachments.',
      );
    }
    return bucket;
  }

  private keyPrefix() {
    return (process.env.AGENT_FILES_S3_PREFIX || 'agent-commons-artifacts')
      .replace(/^\/+|\/+$/g, '')
      .split('/')
      .map(sanitizePathSegment)
      .join('/');
  }

  private maxExtractedTextChars() {
    return Number(
      process.env.AGENT_FILE_EXTRACT_TEXT_MAX_CHARS ?? DEFAULT_MAX_TEXT_CHARS,
    );
  }

  private capExtractedText(text: string) {
    const max = this.maxExtractedTextChars();
    if (text.length <= max) return text;
    return `${text.slice(0, max)}\n\n[truncated: showing first ${max} of ${text.length} extracted characters]`;
  }

  private toAttachmentRef(
    file: typeof schema.libraryItem.$inferSelect,
    artifacts: Array<typeof schema.libraryBlob.$inferSelect>,
  ): FileAttachmentRef {
    return {
      fileId: file.itemId,
      name: file.name,
      mimeType: file.mimeType,
      kind: file.kind as FileKind,
      sizeBytes: file.sizeBytes,
      status: file.status,
      textPreview: file.textPreview,
      extractedTextChars: file.extractedTextChars,
      artifacts: artifacts.map((artifact) => ({
        artifactId: artifact.blobId,
        kind: artifact.role,
        mimeType: artifact.mimeType,
        pageNumber: artifact.pageNumber,
        width: artifact.width,
        height: artifact.height,
      })),
    };
  }

  private async resolveOwnership(input: PersistFileInput) {
    if (input.ownerType === 'user' && input.ownerId) {
      return { ownerUserId: input.ownerId, workspaceId: input.workspaceId };
    }
    if (input.agentId) {
      const row = await this.db.query.agent.findFirst({
        where: (t) => eq(t.agentId, input.agentId!),
      });
      const ownerUserId = row?.ownerUserId ?? row?.owner;
      if (ownerUserId) {
        return {
          ownerUserId,
          workspaceId: input.workspaceId ?? row?.workspaceId,
        };
      }
    }
    if (input.ownerId && input.ownerType === 'service') {
      return { ownerUserId: input.ownerId, workspaceId: input.workspaceId };
    }
    throw new BadRequestException('A verified artifact owner is required');
  }

  private async indexText(itemId: string, text: string) {
    const chunks = chunkText(text);
    if (!chunks.length) return;
    const inserted = await this.db
      .insert(schema.libraryChunk)
      .values(
        chunks.map((content, chunkIndex) => ({
          itemId,
          chunkIndex,
          content,
          tokenCount: Math.ceil(content.length / 4),
          metadata: {},
        })),
      )
      .returning({
        chunkId: schema.libraryChunk.chunkId,
        content: schema.libraryChunk.content,
      });

    if (
      !process.env.OPENAI_API_KEY ||
      process.env.ARTIFACT_EMBEDDINGS_DISABLED === 'true'
    )
      return;
    try {
      const model =
        process.env.ARTIFACT_EMBEDDING_MODEL || 'text-embedding-3-small';
      const response = await this.openAI.embeddings.create({
        model,
        input: inserted.map((chunk) => chunk.content),
        dimensions: 1536,
        encoding_format: 'float',
      });
      for (let index = 0; index < inserted.length; index += 1) {
        const embedding = response.data[index]?.embedding;
        if (!embedding) continue;
        await this.db
          .update(schema.libraryChunk)
          .set({
            embedding,
            embeddingModel: model,
          })
          .where(eq(schema.libraryChunk.chunkId, inserted[index].chunkId));
      }
    } catch (error) {
      this.logger.warn(
        `Artifact embedding deferred for ${itemId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async signedOriginal(
    file: typeof schema.libraryItem.$inferSelect,
    inline = false,
  ) {
    const original = await this.db.query.libraryBlob.findFirst({
      where: (t) => and(eq(t.itemId, file.itemId), eq(t.role, 'original')),
    });
    if (!original) throw new NotFoundException('Original file is unavailable');
    return {
      itemId: file.itemId,
      name: file.name,
      mimeType: file.mimeType,
      url:
        inline && original.storageBucket !== 'ipfs'
          ? await getSignedUrl(
              this.s3() as any,
              new GetObjectCommand({
                Bucket: original.storageBucket,
                Key: original.storagePath,
                ResponseContentType: file.mimeType,
                ResponseContentDisposition: `inline; filename="${file.name.replace(/"/g, '')}"`,
              }) as any,
              {
                expiresIn: Number(
                  process.env.AGENT_FILE_SIGNED_URL_SECONDS ??
                    DEFAULT_SIGNED_URL_SECONDS,
                ),
              },
            )
          : await this.createSignedUrl(
              original.storageBucket,
              original.storagePath,
            ),
      expiresInSeconds: Number(
        process.env.AGENT_FILE_SIGNED_URL_SECONDS ?? DEFAULT_SIGNED_URL_SECONDS,
      ),
    };
  }

  private async audit(
    itemId: string,
    actorType: 'user' | 'agent' | 'service',
    actorId: string,
    action: string,
  ) {
    await this.db.insert(schema.libraryAuditEvent).values({
      itemId,
      actorType,
      actorId,
      action,
    });
  }
}

type NormalizedPresentationTheme = Required<PresentationTheme>;

function normalizePresentationTheme(
  input?: PresentationTheme,
): NormalizedPresentationTheme {
  const accents = (input?.accentColors ?? [])
    .map(normalizeHexColor)
    .filter(Boolean);
  return {
    headFontFace: input?.headFontFace?.trim() || 'Aptos Display',
    bodyFontFace: input?.bodyFontFace?.trim() || 'Aptos',
    backgroundColor: normalizeHexColor(input?.backgroundColor) || 'F8FAFC',
    textColor: normalizeHexColor(input?.textColor) || '111827',
    mutedTextColor: normalizeHexColor(input?.mutedTextColor) || '64748B',
    accentColors:
      accents.length > 0
        ? accents
        : ['7CF2C4', 'FFE166', '8FE8F7', 'DFFF63', 'F8A8C4'],
  };
}

function normalizeHexColor(value?: string) {
  const normalized = String(value ?? '')
    .trim()
    .replace(/^#/, '')
    .toUpperCase();
  return /^[0-9A-F]{6}$/.test(normalized) ? normalized : '';
}

function normalizePresentationImageMime(declaredMime: string, format?: string) {
  if (/^image\/(png|jpeg|gif)$/i.test(declaredMime)) return declaredMime;
  if (format === 'jpeg' || format === 'jpg') return 'image/jpeg';
  if (format === 'gif') return 'image/gif';
  return 'image/png';
}

function addPresentationSlide(
  pptx: PptxGenJS,
  slide: any,
  spec: PresentationSlideSpec,
  theme: NormalizedPresentationTheme,
  image: LoadedPresentationImage | undefined,
  index: number,
) {
  const layout = spec.layout ?? (index === 0 ? 'title' : 'title-and-content');
  const background =
    normalizeHexColor(spec.backgroundColor) || theme.backgroundColor;
  const accent =
    normalizeHexColor(spec.accentColor) ||
    theme.accentColors[index % theme.accentColors.length];
  slide.background = { color: background };

  if (layout === 'full-bleed-image' && image) {
    slide.addImage({
      data: image.dataUri,
      ...(spec.imageFit === 'contain'
        ? containImageInBox(image, { x: 0, y: 0, w: 13.333, h: 7.5 })
        : coverImageOverBox(image, { x: 0, y: 0, w: 13.333, h: 7.5 })),
    });
    return;
  }

  if (layout === 'title' || layout === 'section') {
    slide.addShape(pptx.ShapeType.roundRect, {
      x: 0.72,
      y: layout === 'title' ? 1.62 : 0.84,
      w: 2.05,
      h: 0.18,
      rectRadius: 0.08,
      line: { color: accent, transparency: 100 },
      fill: { color: accent },
    });
    slide.addText(spec.title?.trim() || '', {
      x: 0.72,
      y: layout === 'title' ? 2.06 : 1.32,
      w: 11.5,
      h: layout === 'title' ? 1.35 : 1.05,
      fontFace: theme.headFontFace,
      fontSize: layout === 'title' ? 33 : 29,
      bold: true,
      color: theme.textColor,
      margin: 0,
      fit: 'shrink',
      breakLine: false,
    });
    if (spec.subtitle?.trim()) {
      slide.addText(spec.subtitle.trim(), {
        x: 0.75,
        y: layout === 'title' ? 3.57 : 2.6,
        w: 10.6,
        h: 0.95,
        fontFace: theme.bodyFontFace,
        fontSize: layout === 'title' ? 16 : 15,
        color: theme.mutedTextColor,
        margin: 0,
        fit: 'shrink',
      });
    }
    addPresentationBullets(
      slide,
      spec.bullets,
      theme,
      0.82,
      layout === 'title' ? 4.65 : 3.65,
      11.2,
      layout === 'title' ? 1.65 : 2.55,
      16,
    );
    addSlideNumber(slide, index, theme.mutedTextColor);
    return;
  }

  addPresentationHeader(pptx, slide, spec.title?.trim() || '', theme, accent);

  if (layout === 'overview' || layout === 'takeaways') {
    const cards = (spec.bullets ?? []).slice(0, 6).map(splitCardBullet);
    const columns = cards.length <= 4 ? 2 : 3;
    const rows = Math.ceil(cards.length / columns);
    const gap = 0.3;
    const cardWidth = (11.75 - gap * (columns - 1)) / columns;
    const cardHeight = Math.min(2.05, (4.75 - gap * (rows - 1)) / rows);
    for (const [cardIndex, card] of cards.entries()) {
      const column = cardIndex % columns;
      const row = Math.floor(cardIndex / columns);
      const x = 0.8 + column * (cardWidth + gap);
      const y = 1.7 + row * (cardHeight + gap);
      const cardAccent =
        theme.accentColors[(index + cardIndex) % theme.accentColors.length];
      slide.addShape(pptx.ShapeType.roundRect, {
        x,
        y,
        w: cardWidth,
        h: cardHeight,
        rectRadius: 0.08,
        line: { color: cardAccent, width: 1.2 },
        fill: { color: cardAccent, transparency: 78 },
      });
      slide.addShape(pptx.ShapeType.roundRect, {
        x: x + 0.24,
        y: y + 0.27,
        w: 0.48,
        h: 0.35,
        rectRadius: 0.05,
        line: { color: cardAccent, transparency: 100 },
        fill: { color: cardAccent },
      });
      slide.addText(String(cardIndex + 1).padStart(2, '0'), {
        x: x + 0.24,
        y: y + 0.31,
        w: 0.48,
        h: 0.16,
        fontFace: theme.bodyFontFace,
        fontSize: 8,
        bold: true,
        color: theme.textColor,
        align: 'center',
        margin: 0,
      });
      slide.addText(card.heading, {
        x: x + 0.86,
        y: y + 0.21,
        w: cardWidth - 1.08,
        h: 0.48,
        fontFace: theme.headFontFace,
        fontSize: 15,
        bold: true,
        color: theme.textColor,
        margin: 0,
        fit: 'shrink',
      });
      slide.addText(card.body, {
        x: x + 0.28,
        y: y + 0.83,
        w: cardWidth - 0.56,
        h: cardHeight - 1.05,
        fontFace: theme.bodyFontFace,
        fontSize: 11.5,
        color: theme.mutedTextColor,
        margin: 0,
        valign: 'top',
        fit: 'shrink',
      });
    }
    if (spec.subtitle?.trim()) {
      slide.addText(spec.subtitle.trim(), {
        x: 0.84,
        y: 6.67,
        w: 10.9,
        h: 0.32,
        fontFace: theme.bodyFontFace,
        fontSize: 10.5,
        color: theme.mutedTextColor,
        margin: 0,
        align: 'center',
        fit: 'shrink',
      });
    }
    addSlideNumber(slide, index, theme.mutedTextColor);
    return;
  }

  if ((layout === 'image-left' || layout === 'image-right') && image) {
    const imageOnLeft = layout === 'image-left';
    const imageBox = {
      x: imageOnLeft ? 0.8 : 7.03,
      y: 1.62,
      w: 5.5,
      h: 4.95,
    };
    slide.addShape(pptx.ShapeType.roundRect, {
      ...imageBox,
      line: { color: 'E2E8F0', width: 1 },
      fill: { color: 'FFFFFF' },
      shadow: {
        type: 'outer',
        color: 'CBD5E1',
        blur: 1.5,
        angle: 45,
        distance: 1,
        opacity: 0.2,
      },
    });
    slide.addImage({
      data: image.dataUri,
      ...containImageInBox(image, {
        x: imageBox.x + 0.12,
        y: imageBox.y + 0.12,
        w: imageBox.w - 0.24,
        h: imageBox.h - 0.24,
      }),
    });
    const textX = imageOnLeft ? 6.72 : 0.82;
    addPresentationBullets(
      slide,
      spec.bullets,
      theme,
      textX,
      2.0,
      5.65,
      4.25,
      16,
    );
    if (spec.subtitle?.trim()) {
      slide.addText(spec.subtitle.trim(), {
        x: textX,
        y: 1.5,
        w: 5.65,
        h: 0.36,
        fontFace: theme.bodyFontFace,
        fontSize: 11,
        color: theme.mutedTextColor,
        margin: 0,
        fit: 'shrink',
      });
    }
    addSlideNumber(slide, index, theme.mutedTextColor);
    return;
  }

  if (spec.subtitle?.trim()) {
    slide.addText(spec.subtitle.trim(), {
      x: 0.82,
      y: 1.48,
      w: 11.55,
      h: 0.52,
      fontFace: theme.bodyFontFace,
      fontSize: 12,
      color: theme.mutedTextColor,
      margin: 0,
      fit: 'shrink',
    });
  }
  addPresentationBullets(
    slide,
    spec.bullets,
    theme,
    0.92,
    spec.subtitle?.trim() ? 2.2 : 1.82,
    11.35,
    spec.subtitle?.trim() ? 4.3 : 4.7,
    18,
  );
  addSlideNumber(slide, index, theme.mutedTextColor);
}

function addPresentationHeader(
  pptx: PptxGenJS,
  slide: any,
  title: string,
  theme: NormalizedPresentationTheme,
  accent: string,
) {
  slide.addShape(pptx.ShapeType.roundRect, {
    x: 0.72,
    y: 0.42,
    w: 0.22,
    h: 0.72,
    rectRadius: 0.05,
    line: { color: accent, transparency: 100 },
    fill: { color: accent },
  });
  slide.addText(title, {
    x: 1.14,
    y: 0.42,
    w: 11.1,
    h: 0.72,
    fontFace: theme.headFontFace,
    fontSize: 25,
    bold: true,
    color: theme.textColor,
    margin: 0,
    fit: 'shrink',
  });
}

function addPresentationBullets(
  slide: any,
  bullets: string[] | undefined,
  theme: NormalizedPresentationTheme,
  x: number,
  y: number,
  w: number,
  h: number,
  fontSize: number,
) {
  if (!bullets?.length) return;
  slide.addText(
    bullets.slice(0, 12).map((text) => ({
      text,
      options: {
        bullet: { indent: 18 },
        hanging: 4,
        breakLine: true,
      },
    })),
    {
      x,
      y,
      w,
      h,
      fontFace: theme.bodyFontFace,
      fontSize,
      color: theme.textColor,
      paraSpaceAfter: 13,
      valign: 'top',
      margin: 0,
      breakLine: false,
      fit: 'shrink',
    },
  );
}

function addSlideNumber(slide: any, index: number, color: string) {
  slide.addText(String(index + 1).padStart(2, '0'), {
    x: 12.05,
    y: 7.05,
    w: 0.62,
    h: 0.2,
    fontSize: 8,
    color,
    align: 'right',
    margin: 0,
  });
}

function splitCardBullet(text: string) {
  const parts = String(text).split(/\s+(?:—|–|-)\s+/, 2);
  return {
    heading: parts[0]?.trim() || 'Key point',
    body: parts[1]?.trim() || parts[0]?.trim() || '',
  };
}

function containImageInBox(
  image: Pick<LoadedPresentationImage, 'width' | 'height'>,
  box: { x: number; y: number; w: number; h: number },
) {
  const scale = Math.min(box.w / image.width, box.h / image.height);
  const width = image.width * scale;
  const height = image.height * scale;
  return {
    x: box.x + (box.w - width) / 2,
    y: box.y + (box.h - height) / 2,
    w: width,
    h: height,
  };
}

function coverImageOverBox(
  image: Pick<LoadedPresentationImage, 'width' | 'height'>,
  box: { x: number; y: number; w: number; h: number },
) {
  const scale = Math.max(box.w / image.width, box.h / image.height);
  const width = image.width * scale;
  const height = image.height * scale;
  return {
    x: box.x + (box.w - width) / 2,
    y: box.y + (box.h - height) / 2,
    w: width,
    h: height,
  };
}

async function renderPresentationPreview(
  spec: PresentationSlideSpec,
  theme: NormalizedPresentationTheme,
  image: LoadedPresentationImage | undefined,
  index: number,
): Promise<ExtractedArtifact> {
  const layout = spec.layout ?? (index === 0 ? 'title' : 'title-and-content');
  let buffer: Buffer;
  if (layout === 'full-bleed-image' && image) {
    buffer = await sharp(image.buffer)
      .resize(1280, 720, {
        fit: spec.imageFit === 'contain' ? 'contain' : 'cover',
        background: '#ffffff',
      })
      .png()
      .toBuffer();
  } else {
    const background =
      normalizeHexColor(spec.backgroundColor) || theme.backgroundColor;
    const accent =
      normalizeHexColor(spec.accentColor) ||
      theme.accentColors[index % theme.accentColors.length];
    const cards =
      layout === 'overview' || layout === 'takeaways'
        ? (spec.bullets ?? []).slice(0, 6).map(splitCardBullet)
        : [];
    const bodyLines =
      cards.length === 0
        ? (spec.bullets ?? [])
            .slice(0, 8)
            .flatMap((bullet) => wrapPreviewText(`• ${bullet}`, 62))
        : [];
    const cardMarkup = cards
      .map((card, cardIndex) => {
        const columns = cards.length <= 4 ? 2 : 3;
        const width = columns === 2 ? 548 : 356;
        const x = 78 + (cardIndex % columns) * (width + 26);
        const y = 176 + Math.floor(cardIndex / columns) * 214;
        const color =
          theme.accentColors[(index + cardIndex) % theme.accentColors.length];
        const heading = wrapPreviewText(card.heading, columns === 2 ? 30 : 20)
          .slice(0, 2)
          .map(
            (line, lineIndex) =>
              `<tspan x="${x + 78}" dy="${lineIndex ? 27 : 0}">${escapeXml(line)}</tspan>`,
          )
          .join('');
        const body = wrapPreviewText(card.body, columns === 2 ? 48 : 30)
          .slice(0, 3)
          .map(
            (line, lineIndex) =>
              `<tspan x="${x + 24}" dy="${lineIndex ? 24 : 0}">${escapeXml(line)}</tspan>`,
          )
          .join('');
        return `<rect x="${x}" y="${y}" width="${width}" height="184" rx="18" fill="#${color}" fill-opacity=".2" stroke="#${color}" stroke-width="2"/>
          <rect x="${x + 22}" y="${y + 24}" width="42" height="32" rx="8" fill="#${color}"/>
          <text x="${x + 43}" y="${y + 45}" text-anchor="middle" font-size="13" font-weight="700" fill="#${theme.textColor}">${String(cardIndex + 1).padStart(2, '0')}</text>
          <text x="${x + 78}" y="${y + 46}" font-size="24" font-weight="700" fill="#${theme.textColor}">${heading}</text>
          <text x="${x + 24}" y="${y + 96}" font-size="19" fill="#${theme.mutedTextColor}">${body}</text>`;
      })
      .join('');
    const imageMarkup = image
      ? `<image href="${image.dataUri}" x="${layout === 'image-right' ? 690 : 75}" y="164" width="520" height="475" preserveAspectRatio="xMidYMid meet"/>`
      : '';
    const bodyX = layout === 'image-left' ? 650 : 88;
    const bodyWidth =
      layout === 'image-left' || layout === 'image-right' ? 520 : 1100;
    const svg = `<svg width="1280" height="720" viewBox="0 0 1280 720" xmlns="http://www.w3.org/2000/svg">
      <rect width="1280" height="720" fill="#${background}"/>
      <rect x="70" y="42" width="20" height="70" rx="8" fill="#${accent}"/>
      <text x="112" y="94" font-family="${escapeXml(theme.headFontFace)}, Arial, sans-serif" font-size="46" font-weight="700" fill="#${theme.textColor}">${escapeXml(spec.title ?? '')}</text>
      ${imageMarkup}
      ${cardMarkup}
      ${
        cards.length
          ? ''
          : `<text x="${bodyX}" y="190" font-family="${escapeXml(theme.bodyFontFace)}, Arial, sans-serif" font-size="28" fill="#${theme.textColor}">
          ${bodyLines
            .map(
              (line, lineIndex) =>
                `<tspan x="${bodyX}" dy="${lineIndex ? 43 : 0}">${escapeXml(line.slice(0, bodyWidth / 14))}</tspan>`,
            )
            .join('')}
        </text>`
      }
      <text x="1210" y="685" text-anchor="end" font-family="${escapeXml(theme.bodyFontFace)}, Arial, sans-serif" font-size="15" fill="#${theme.mutedTextColor}">${String(index + 1).padStart(2, '0')}</text>
    </svg>`;
    buffer = await sharp(Buffer.from(svg)).png().toBuffer();
  }
  return {
    kind: 'presentation_slide_image',
    fileName: `slide-${String(index + 1).padStart(3, '0')}.png`,
    mimeType: 'image/png',
    buffer,
    pageNumber: index + 1,
    width: 1280,
    height: 720,
    metadata: {
      source: 'generated_presentation_preview',
      layout,
      imageFileId: spec.imageFileId,
    },
  };
}

function wrapPreviewText(value: string, maxCharacters: number) {
  const words = String(value).trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    if (line && `${line} ${word}`.length > maxCharacters) {
      lines.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function samePrincipal(left: string, right: string) {
  return left.trim().toLowerCase() === right.trim().toLowerCase();
}

function libraryKind(kind: FileKind) {
  return kind === 'unknown' ? 'other' : kind;
}

function isSafeInlineType(contentType: string) {
  return /^(image\/(png|jpeg|gif|webp)|audio\/|video\/|application\/pdf|text\/plain)(;|$)/i.test(
    contentType,
  );
}

function chunkText(text: string) {
  const normalized = text.trim();
  if (!normalized) return [];
  const target = Number(process.env.ARTIFACT_CHUNK_CHARS ?? 3_200);
  const overlap = Math.min(
    Number(process.env.ARTIFACT_CHUNK_OVERLAP_CHARS ?? 400),
    Math.floor(target / 3),
  );
  const chunks: string[] = [];
  let start = 0;
  while (start < normalized.length) {
    let end = Math.min(normalized.length, start + target);
    if (end < normalized.length) {
      const boundary = Math.max(
        normalized.lastIndexOf('\n\n', end),
        normalized.lastIndexOf('. ', end),
        normalized.lastIndexOf(' ', end),
      );
      if (boundary > start + target / 2) end = boundary + 1;
    }
    chunks.push(normalized.slice(start, end).trim());
    if (end >= normalized.length) break;
    start = Math.max(start + 1, end - overlap);
  }
  return chunks.filter(Boolean);
}

function rowsToWorksheet(rows: Array<Record<string, any> | any[]>) {
  if (!rows.length) return XLSX.utils.aoa_to_sheet([]);
  if (rows.every(Array.isArray)) {
    return XLSX.utils.aoa_to_sheet(rows as any[][]);
  }
  const headers = Array.from(
    rows.reduce<Set<string>>((set, row) => {
      if (!Array.isArray(row) && row && typeof row === 'object') {
        Object.keys(row).forEach((key) => set.add(key));
      }
      return set;
    }, new Set<string>()),
  );
  const data = [
    headers,
    ...rows.map((row) =>
      Array.isArray(row) ? row : headers.map((header) => row?.[header] ?? ''),
    ),
  ];
  return XLSX.utils.aoa_to_sheet(data);
}

function sanitizeSheetName(name: string) {
  const cleaned = name.replace(/[\][*?/\\:]/g, ' ').trim() || 'Sheet';
  return cleaned.slice(0, 31);
}

function sanitizeFileName(name: string) {
  const cleaned = name
    .normalize('NFKD')
    .replace(/[^\w.\- ]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned || 'file';
}

function sanitizePathSegment(value: string) {
  return (
    value
      .normalize('NFKD')
      .replace(/[^\w.\-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 120) || 'unknown'
  );
}

export function normalizeMimeType(
  mimeType: string | undefined,
  fileName: string,
) {
  if (mimeType && mimeType !== 'application/octet-stream') return mimeType;
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.pdf')) return 'application/pdf';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.csv')) return 'text/csv';
  if (lower.endsWith('.txt') || lower.endsWith('.md')) return 'text/plain';
  if (lower.endsWith('.docx')) {
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  }
  if (lower.endsWith('.doc')) return 'application/msword';
  if (lower.endsWith('.rtf')) return 'application/rtf';
  if (lower.endsWith('.odt')) return 'application/vnd.oasis.opendocument.text';
  if (lower.endsWith('.pptx')) {
    return 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
  }
  if (lower.endsWith('.ppt')) return 'application/vnd.ms-powerpoint';
  if (lower.endsWith('.odp')) {
    return 'application/vnd.oasis.opendocument.presentation';
  }
  if (lower.endsWith('.xlsx')) {
    return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  }
  if (lower.endsWith('.xls')) return 'application/vnd.ms-excel';
  if (lower.endsWith('.ods')) {
    return 'application/vnd.oasis.opendocument.spreadsheet';
  }
  if (lower.endsWith('.mp3')) return 'audio/mpeg';
  if (lower.endsWith('.wav')) return 'audio/wav';
  if (lower.endsWith('.m4a')) return 'audio/mp4';
  if (lower.endsWith('.ogg')) return 'audio/ogg';
  if (lower.endsWith('.flac')) return 'audio/flac';
  if (lower.endsWith('.mp4') || lower.endsWith('.m4v')) return 'video/mp4';
  if (lower.endsWith('.mov')) return 'video/quicktime';
  if (lower.endsWith('.webm')) return 'video/webm';
  if (lower.endsWith('.avi')) return 'video/x-msvideo';
  if (lower.endsWith('.zip')) return 'application/zip';
  if (lower.endsWith('.tar')) return 'application/x-tar';
  if (lower.endsWith('.gz')) return 'application/gzip';
  if (lower.endsWith('.7z')) return 'application/x-7z-compressed';
  return mimeType || 'application/octet-stream';
}

export function classifyFile(mimeType: string, fileName: string): FileKind {
  const lower = fileName.toLowerCase();
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('audio/')) return 'audio';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType === 'application/pdf' || lower.endsWith('.pdf')) return 'pdf';
  if (
    [
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/vnd.ms-powerpoint',
      'application/vnd.oasis.opendocument.presentation',
    ].includes(mimeType) ||
    /\.(pptx|ppt|odp)$/i.test(lower)
  ) {
    return 'presentation';
  }
  if (
    [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'application/vnd.oasis.opendocument.spreadsheet',
    ].includes(mimeType) ||
    /\.(xlsx|xls|ods)$/i.test(lower)
  ) {
    return 'spreadsheet';
  }
  if (mimeType === 'text/csv' || lower.endsWith('.csv')) return 'csv';
  if (
    /\.(md|json|jsonl|xml|html|htm|css|scss|sass|less|ts|tsx|js|jsx|mjs|cjs|py|rb|php|java|kt|kts|swift|go|rs|c|h|cpp|hpp|cs|sh|zsh|bash|fish|sql|graphql|gql|yaml|yml|toml|ini|env|vue|svelte)$/i.test(
      lower,
    )
  ) {
    return 'code';
  }
  if (mimeType.startsWith('text/') || /\.(txt|log)$/i.test(lower)) {
    return 'text';
  }
  if (
    mimeType ===
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    /\.(docx|doc|rtf|odt)$/i.test(lower)
  ) {
    return 'document';
  }
  if (
    [
      'application/zip',
      'application/x-zip-compressed',
      'application/x-tar',
      'application/gzip',
      'application/x-7z-compressed',
      'application/vnd.rar',
    ].includes(mimeType) ||
    /\.(zip|tar|tgz|gz|7z|rar)$/i.test(lower)
  ) {
    return 'archive';
  }
  return 'unknown';
}

function ensureExtension(fileName: string, extension: string) {
  return fileName.toLowerCase().endsWith(extension)
    ? fileName
    : `${fileName.replace(/\.[^.]+$/, '')}${extension}`;
}

function versionMetadata(sourceFileId?: string) {
  return sourceFileId ? { sourceFileId, revisionOf: sourceFileId } : {};
}

function wrapPdfText(text: string, maxCharacters: number) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [''];
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    if (current && `${current} ${word}`.length > maxCharacters) {
      lines.push(current);
      current = word;
    } else {
      current = current ? `${current} ${word}` : word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

type PdfTextItem = {
  str: string;
  fontName: string;
  transform: number[];
  width: number;
  height: number;
};

type IndexedPdfTextItem = PdfTextItem & {
  text: string;
  start: number;
  end: number;
  x: number;
  y: number;
  fontSize: number;
};

type PdfPageTextIndex = {
  pageNumber: number;
  text: string;
  items: IndexedPdfTextItem[];
  pdfjsPage: any;
};

/**
 * Makes bounded text edits directly on top of the source PDF. Untouched page
 * content, geometry, graphics, and font resources remain byte-for-byte
 * represented in the resulting document; replacement glyphs use the same
 * embedded font resource as the selected source passage.
 */
export async function revisePdfBufferPreservingLayout(
  sourceBuffer: Buffer,
  replacements: PdfTextReplacement[],
  locatorOverride?: {
    document: any;
    destroy?: () => Promise<void> | void;
  },
): Promise<Buffer> {
  if (!replacements.length) {
    throw new BadRequestException('At least one PDF replacement is required');
  }

  let sourcePdf: any;
  let destroyLocator: (() => Promise<void> | void) | undefined;
  if (locatorOverride) {
    sourcePdf = locatorOverride.document;
    destroyLocator = locatorOverride.destroy;
  } else {
    const pdfjs = (await import('pdfjs-dist/legacy/build/pdf.mjs')) as any;
    const pdfjsRoot = path.dirname(require.resolve('pdfjs-dist/package.json'));
    const loadingTask = pdfjs.getDocument({
      data: new Uint8Array(sourceBuffer),
      disableWorker: true,
      useSystemFonts: false,
      standardFontDataUrl: `${path.join(pdfjsRoot, 'standard_fonts')}${path.sep}`,
      cMapUrl: `${path.join(pdfjsRoot, 'cmaps')}${path.sep}`,
      cMapPacked: true,
    });
    sourcePdf = await loadingTask.promise;
    destroyLocator = () => loadingTask.destroy?.();
  }

  try {
    const document = await PDFDocument.load(sourceBuffer, {
      updateMetadata: false,
    });
    if (document.getPageCount() !== sourcePdf.numPages) {
      throw new BadRequestException('The source PDF page index is invalid');
    }

    const pages: PdfPageTextIndex[] = [];
    for (
      let pageNumber = 1;
      pageNumber <= sourcePdf.numPages;
      pageNumber += 1
    ) {
      const pdfjsPage = await sourcePdf.getPage(pageNumber);
      const textContent = await pdfjsPage.getTextContent();
      await pdfjsPage.getOperatorList();
      pages.push(
        indexPdfPageText(
          pageNumber,
          pdfjsPage,
          textContent.items as PdfTextItem[],
        ),
      );
    }

    const occupiedItems = new Set<string>();
    for (const replacement of replacements) {
      const find = normalizePdfSearchText(replacement.find);
      if (!find) {
        throw new BadRequestException('PDF replacement find text is empty');
      }
      const match = findPdfTextMatch(pages, find, replacement.occurrence ?? 1);
      const selectedItems = match.page.items.filter(
        (item) => item.end > match.start && item.start < match.end,
      );
      if (!selectedItems.length) {
        throw new BadRequestException(
          `Could not map PDF text "${previewErrorText(find)}" to a visible text region`,
        );
      }

      for (const item of selectedItems) {
        const key = `${match.page.pageNumber}:${item.start}:${item.end}`;
        if (occupiedItems.has(key)) {
          throw new BadRequestException(
            'PDF replacements overlap. Combine them into one larger exact replacement.',
          );
        }
        occupiedItems.add(key);
      }

      const fontNames = new Set(selectedItems.map((item) => item.fontName));
      if (fontNames.size !== 1) {
        throw new BadRequestException(
          `The passage "${previewErrorText(find)}" crosses differently styled text. Split it into one replacement per style.`,
        );
      }
      if (
        selectedItems.some(
          (item) =>
            Math.abs(item.transform[1] ?? 0) > 0.01 ||
            Math.abs(item.transform[2] ?? 0) > 0.01,
        )
      ) {
        throw new BadRequestException(
          'Rotated PDF text cannot yet be revised without changing its layout.',
        );
      }

      const first = selectedItems[0];
      const last = selectedItems[selectedItems.length - 1];
      const prefix =
        match.start > first.start
          ? first.text.slice(0, match.start - first.start)
          : '';
      const suffix =
        match.end < last.end ? last.text.slice(match.end - last.start) : '';
      const replacementText = normalizePdfReplacementText(
        [prefix, replacement.replace, suffix].filter(Boolean).join(' '),
      );
      const targetPage = document.getPage(match.page.pageNumber - 1);
      const font = resolvePdfFontResource(
        targetPage,
        match.page.pdfjsPage,
        first.fontName,
      );
      const metrics = createPdfFontMetrics(font.dictionary);
      assertPdfFontSupportsText(metrics, replacementText, font.baseFont);

      const lines = groupPdfItemsIntoLines(selectedItems);
      const fontSize = median(selectedItems.map((item) => item.fontSize));
      if (
        selectedItems.some(
          (item) =>
            Math.abs(item.fontSize - fontSize) > Math.max(0.5, fontSize * 0.08),
        )
      ) {
        throw new BadRequestException(
          `The passage "${previewErrorText(find)}" mixes font sizes. Split it into smaller replacements.`,
        );
      }
      const minX = Math.min(...lines.map((line) => line.minX));
      const rightMargin = Math.max(36, Math.min(minX, 90));
      const maxLineWidth = targetPage.getWidth() - minX - rightMargin;
      const wrapped = wrapTextToPdfWidth(
        replacementText,
        maxLineWidth,
        fontSize,
        metrics.widthOfTextAtSize,
      );
      if (wrapped.length > lines.length) {
        throw new BadRequestException(
          `The replacement for "${previewErrorText(find)}" needs ${wrapped.length} lines but the original region has ${lines.length}. Shorten the replacement or split the edit.`,
        );
      }

      for (const line of lines) {
        targetPage.drawRectangle({
          x: Math.max(0, line.minX - 1.5),
          y: Math.max(0, line.baseline - fontSize * 0.28),
          width: Math.min(
            targetPage.getWidth() - line.minX + 1.5,
            line.maxX - line.minX + 3,
          ),
          height: fontSize * 1.24,
          color: rgb(1, 1, 1),
          borderWidth: 0,
        });
      }

      for (let index = 0; index < wrapped.length; index += 1) {
        const line = wrapped[index];
        const baseline = lines[index]?.baseline;
        if (baseline === undefined) {
          throw new BadRequestException(
            'The PDF replacement does not fit the original text region',
          );
        }
        const operators = [
          pushGraphicsState(),
          beginText(),
          setFillingColor(rgb(0, 0, 0)),
          setFontAndSize(font.resourceName, fontSize),
        ];
        let cursorX = lines[index].minX;
        const words = line.split(' ').filter(Boolean);
        for (const word of words) {
          operators.push(
            setTextMatrix(1, 0, 0, 1, cursorX, baseline),
            showText(metrics.encode(word)),
          );
          cursorX += metrics.widthOfTextAtSize(`${word} `, fontSize);
        }
        operators.push(endText(), popGraphicsState());
        targetPage.pushOperators(...operators);
      }
    }

    return Buffer.from(
      await document.save({
        useObjectStreams: false,
        addDefaultPage: false,
        updateFieldAppearances: false,
      }),
    );
  } finally {
    await destroyLocator?.();
  }
}

function indexPdfPageText(
  pageNumber: number,
  pdfjsPage: any,
  rawItems: PdfTextItem[],
): PdfPageTextIndex {
  let text = '';
  const items: IndexedPdfTextItem[] = [];
  for (const item of rawItems) {
    if (!item || typeof item.str !== 'string') continue;
    const normalized = normalizePdfSearchText(item.str);
    if (!normalized) continue;
    if (text) text += ' ';
    const start = text.length;
    text += normalized;
    const fontSize = Math.hypot(
      Number(item.transform?.[0] ?? 0),
      Number(item.transform?.[1] ?? 0),
    );
    items.push({
      ...item,
      text: normalized,
      start,
      end: text.length,
      x: Number(item.transform?.[4] ?? 0),
      y: Number(item.transform?.[5] ?? 0),
      fontSize: fontSize || Number(item.height) || 12,
    });
  }
  return { pageNumber, text, items, pdfjsPage };
}

function findPdfTextMatch(
  pages: PdfPageTextIndex[],
  find: string,
  requestedOccurrence: number,
) {
  const occurrence = Math.max(1, Math.floor(requestedOccurrence));
  let seen = 0;
  for (const page of pages) {
    let offset = 0;
    while (offset <= page.text.length - find.length) {
      const start = page.text.indexOf(find, offset);
      if (start < 0) break;
      seen += 1;
      if (seen === occurrence) {
        return { page, start, end: start + find.length };
      }
      offset = start + Math.max(1, find.length);
    }
  }
  throw new BadRequestException(
    `Could not find occurrence ${occurrence} of "${previewErrorText(find)}" in the source PDF. Copy the exact passage from readUploadedFile.`,
  );
}

function resolvePdfFontResource(
  page: any,
  pdfjsPage: any,
  pdfjsFontName: string,
) {
  const pdfjsFont = pdfjsPage.commonObjs.get(pdfjsFontName);
  const expectedName = String(pdfjsFont?.name || '').replace(/^\//, '');
  const resources = page.node.Resources();
  const fonts = resources?.lookupMaybe(PDFName.of('Font'), PDFDict);
  if (!fonts) {
    throw new BadRequestException('The selected PDF text has no font resource');
  }
  for (const [resourceName, value] of fonts.entries()) {
    const dictionary = page.doc.context.lookup(value, PDFDict);
    const baseFont = dictionary.lookupMaybe(PDFName.of('BaseFont'), PDFName);
    const baseFontName = baseFont?.decodeText() || '';
    if (
      baseFontName === expectedName ||
      removePdfFontSubset(baseFontName) === removePdfFontSubset(expectedName)
    ) {
      return {
        resourceName,
        dictionary,
        baseFont: baseFontName || expectedName || resourceName.decodeText(),
      };
    }
  }
  throw new BadRequestException(
    `Could not reuse the original PDF font "${expectedName || pdfjsFontName}"`,
  );
}

function createPdfFontMetrics(dictionary: PDFDict) {
  const firstChar =
    dictionary.lookupMaybe(PDFName.of('FirstChar'), PDFNumber)?.asNumber() ?? 0;
  const widths = dictionary.lookupMaybe(PDFName.of('Widths'), PDFArray);
  const descriptor = dictionary.lookupMaybe(
    PDFName.of('FontDescriptor'),
    PDFDict,
  );
  const missingWidth =
    descriptor
      ?.lookupMaybe(PDFName.of('MissingWidth'), PDFNumber)
      ?.asNumber() ?? 500;
  const charSetValue = descriptor?.lookup(PDFName.of('CharSet')) as
    | { decodeText?: () => string }
    | undefined;
  const charSet = charSetValue?.decodeText?.().split('/').filter(Boolean);

  const widthAtCode = (code: number) => {
    if (!widths) return code === 32 ? 278 : 500;
    const index = code - firstChar;
    if (index < 0 || index >= widths.size()) return missingWidth;
    return widths.lookup(index, PDFNumber).asNumber();
  };
  return {
    charSet: charSet ? new Set(charSet) : undefined,
    encode(text: string) {
      return PDFHexString.of(
        Buffer.from(text, 'latin1').toString('hex').toUpperCase(),
      );
    },
    widthOfTextAtSize(text: string, size: number) {
      return (
        [...text].reduce(
          (total, character) => total + widthAtCode(character.charCodeAt(0)),
          0,
        ) *
        (size / 1000)
      );
    },
  };
}

function assertPdfFontSupportsText(
  metrics: ReturnType<typeof createPdfFontMetrics>,
  text: string,
  fontName: string,
) {
  if (!metrics.charSet) return;
  const missing = new Set<string>();
  for (const character of text) {
    if (character === ' ') continue;
    const glyph = pdfGlyphName(character);
    if (!glyph || !metrics.charSet.has(glyph)) missing.add(character);
  }
  if (missing.size) {
    throw new BadRequestException(
      `The source PDF embeds a subset of ${fontName} without these replacement glyphs: ${[...missing].join(' ')}. Rephrase the replacement using characters already present in the document so the original font can be preserved.`,
    );
  }
}

function groupPdfItemsIntoLines(items: IndexedPdfTextItem[]) {
  const sorted = [...items].sort((left, right) => {
    if (
      Math.abs(right.y - left.y) >
      Math.max(left.fontSize, right.fontSize) * 0.45
    ) {
      return right.y - left.y;
    }
    return left.x - right.x;
  });
  const lines: Array<{
    baseline: number;
    minX: number;
    maxX: number;
    items: IndexedPdfTextItem[];
  }> = [];
  for (const item of sorted) {
    const line = lines.find(
      (candidate) =>
        Math.abs(candidate.baseline - item.y) <=
        Math.max(1.5, item.fontSize * 0.35),
    );
    if (line) {
      line.items.push(item);
      line.minX = Math.min(line.minX, item.x);
      line.maxX = Math.max(line.maxX, item.x + item.width);
    } else {
      lines.push({
        baseline: item.y,
        minX: item.x,
        maxX: item.x + item.width,
        items: [item],
      });
    }
  }
  return lines.sort((left, right) => right.baseline - left.baseline);
}

function wrapTextToPdfWidth(
  text: string,
  maxWidth: number,
  fontSize: number,
  widthOfTextAtSize: (text: string, size: number) => number,
) {
  const words = text.split(/\s+/).filter(Boolean);
  if (!words.length) return [''];
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    if (widthOfTextAtSize(word, fontSize) > maxWidth) {
      throw new BadRequestException(
        `The word "${previewErrorText(word)}" is wider than the original PDF text region`,
      );
    }
    const candidate = current ? `${current} ${word}` : word;
    if (current && widthOfTextAtSize(candidate, fontSize) > maxWidth) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function normalizePdfSearchText(text: string) {
  return String(text ?? '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizePdfReplacementText(text: string) {
  return normalizePdfSearchText(text)
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/…/g, '...')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7e]/g, '');
}

function applyPdfTextReplacements(
  extractedText: string,
  replacements: PdfTextReplacement[],
) {
  let output = extractedText;
  for (const replacement of replacements) {
    const find = normalizePdfSearchText(replacement.find);
    if (!find) continue;
    const indexed = indexNormalizedText(output);
    const match = findNthText(indexed.text, find, replacement.occurrence ?? 1);
    if (!match) continue;
    const start = indexed.originalOffsets[match.start] ?? 0;
    const lastNormalizedIndex = match.end - 1;
    const end =
      (indexed.originalOffsets[lastNormalizedIndex] ?? output.length - 1) + 1;
    output =
      output.slice(0, start) +
      normalizePdfReplacementText(replacement.replace) +
      output.slice(end);
  }
  return output;
}

function indexNormalizedText(text: string) {
  let normalized = '';
  const originalOffsets: number[] = [];
  let pendingSpace: number | undefined;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (/\s/.test(character)) {
      if (normalized && pendingSpace === undefined) pendingSpace = index;
      continue;
    }
    if (pendingSpace !== undefined) {
      normalized += ' ';
      originalOffsets.push(pendingSpace);
      pendingSpace = undefined;
    }
    normalized += character;
    originalOffsets.push(index);
  }
  return { text: normalized.trim(), originalOffsets };
}

function findNthText(text: string, find: string, requestedOccurrence: number) {
  const occurrence = Math.max(1, Math.floor(requestedOccurrence));
  let seen = 0;
  let offset = 0;
  while (offset <= text.length - find.length) {
    const start = text.indexOf(find, offset);
    if (start < 0) return null;
    seen += 1;
    if (seen === occurrence) return { start, end: start + find.length };
    offset = start + Math.max(1, find.length);
  }
  return null;
}

function removePdfFontSubset(name: string) {
  return name.replace(/^[A-Z]{6}\+/, '');
}

function median(values: number[]) {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function previewErrorText(text: string) {
  return text.length > 72 ? `${text.slice(0, 69)}...` : text;
}

function pdfGlyphName(character: string) {
  if (/^[A-Za-z]$/.test(character)) return character;
  const names: Record<string, string> = {
    '0': 'zero',
    '1': 'one',
    '2': 'two',
    '3': 'three',
    '4': 'four',
    '5': 'five',
    '6': 'six',
    '7': 'seven',
    '8': 'eight',
    '9': 'nine',
    "'": 'quoteright',
    '"': 'quotedbl',
    ',': 'comma',
    '-': 'hyphen',
    '.': 'period',
    '/': 'slash',
    ':': 'colon',
    ';': 'semicolon',
    '?': 'question',
    '!': 'exclam',
    '@': 'at',
    '&': 'ampersand',
    '(': 'parenleft',
    ')': 'parenright',
    '[': 'bracketleft',
    ']': 'bracketright',
    '+': 'plus',
    '=': 'equal',
    '%': 'percent',
    '#': 'numbersign',
    '|': 'bar',
    _: 'underscore',
  };
  return names[character];
}

async function buildDocxBuffer(input: {
  title?: string;
  sections: Array<{
    heading?: string;
    paragraphs: string[];
    bullets: string[];
  }>;
}) {
  const zip = new JSZip();
  const paragraphs: string[] = [];
  if (input.title?.trim()) {
    paragraphs.push(docxParagraph(input.title.trim(), 'Title'));
  }
  for (const section of input.sections) {
    if (section.heading?.trim()) {
      paragraphs.push(docxParagraph(section.heading.trim(), 'Heading1'));
    }
    section.paragraphs.forEach((text) => paragraphs.push(docxParagraph(text)));
    section.bullets.forEach((text) =>
      paragraphs.push(docxParagraph(`• ${text}`)),
    );
  }
  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
</Types>`,
  );
  zip.file(
    '_rels/.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
</Relationships>`,
  );
  zip.file(
    'word/_rels/document.xml.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`,
  );
  zip.file(
    'word/document.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${paragraphs.join('\n    ')}
    <w:sectPr>
      <w:pgSz w:w="12240" w:h="15840"/>
      <w:pgMar w:top="1080" w:right="1080" w:bottom="1080" w:left="1080"/>
    </w:sectPr>
  </w:body>
</w:document>`,
  );
  zip.file(
    'word/styles.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal">
    <w:name w:val="Normal"/>
    <w:rPr><w:rFonts w:ascii="Aptos" w:hAnsi="Aptos"/><w:sz w:val="22"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Title">
    <w:name w:val="Title"/><w:basedOn w:val="Normal"/>
    <w:pPr><w:spacing w:after="320"/></w:pPr>
    <w:rPr><w:b/><w:sz w:val="40"/><w:color w:val="111827"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading1">
    <w:name w:val="heading 1"/><w:basedOn w:val="Normal"/>
    <w:pPr><w:spacing w:before="260" w:after="120"/></w:pPr>
    <w:rPr><w:b/><w:sz w:val="30"/><w:color w:val="1F2937"/></w:rPr>
  </w:style>
</w:styles>`,
  );
  zip.file(
    'docProps/core.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/">
  <dc:title>${escapeXml(input.title || 'Agent Commons document')}</dc:title>
  <dc:creator>Agent Commons</dc:creator>
</cp:coreProperties>`,
  );
  return zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
}

function docxParagraph(text: string, style?: string) {
  const lines = String(text ?? '').split('\n');
  const runs = lines
    .map(
      (line, index) =>
        `${index ? '<w:r><w:br/></w:r>' : ''}<w:r><w:t xml:space="preserve">${escapeXml(line)}</w:t></w:r>`,
    )
    .join('');
  return `<w:p>${style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : '<w:pPr><w:spacing w:after="140" w:line="276" w:lineRule="auto"/></w:pPr>'}${runs}</w:p>`;
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function naturalArchivePathSort(left: string, right: string) {
  return left.localeCompare(right, undefined, {
    numeric: true,
    sensitivity: 'base',
  });
}

function extractXmlTextLines(xml: string) {
  const withBreaks = xml
    .replace(/<\/(?:a:p|w:p|text:p|text:h|draw:page)>/gi, '\n')
    .replace(/<a:br\s*\/>/gi, '\n');
  const matches = [
    ...withBreaks.matchAll(
      /<(?:a:t|w:t|text:span|text:p|text:h)(?:\s[^>]*)?>([\s\S]*?)<\/(?:a:t|w:t|text:span|text:p|text:h)>/gi,
    ),
  ];
  const text = matches.length
    ? matches.map((match) => match[1]).join(' ')
    : withBreaks.replace(/<[^>]+>/g, ' ');
  return decodeXmlEntities(text)
    .split(/\n+/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

function decodeXmlEntities(value: string) {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) =>
      String.fromCodePoint(Number.parseInt(code, 16)),
    );
}

function extractRtfText(rtf: string) {
  return rtf
    .replace(/\\par[d]?/g, '\n')
    .replace(/\\tab/g, '\t')
    .replace(/\\'[0-9a-f]{2}/gi, (value) =>
      Buffer.from(value.slice(2), 'hex').toString('latin1'),
    )
    .replace(/\\u(-?\d+)\??/g, (_, value) =>
      String.fromCharCode(
        Number(value) < 0 ? Number(value) + 65536 : Number(value),
      ),
    )
    .replace(/\{\\\*[\s\S]*?\}/g, '')
    .replace(/\\[a-z]+-?\d* ?/gi, '')
    .replace(/[{}]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function hasVercelOidcEnvironment() {
  return Boolean(
    process.env.VERCEL ||
      process.env.VERCEL_OIDC_TOKEN ||
      process.env.VERCEL_OIDC_TOKEN_FILE ||
      process.env.VERCEL_PROJECT_ID,
  );
}

async function streamToString(body: any): Promise<string> {
  if (!body) return '';
  if (typeof body.transformToString === 'function') {
    return body.transformToString();
  }
  if (body instanceof Uint8Array) return Buffer.from(body).toString('utf8');
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    body.on('data', (chunk: Buffer | Uint8Array | string) => {
      if (Buffer.isBuffer(chunk)) chunks.push(chunk);
      else if (typeof chunk === 'string') chunks.push(Buffer.from(chunk));
      else
        chunks.push(
          Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength),
        );
    });
    body.on('error', reject);
    body.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
  });
}

async function streamToBuffer(body: any): Promise<Buffer> {
  if (!body) return Buffer.alloc(0);
  if (typeof body.transformToByteArray === 'function') {
    return Buffer.from(await body.transformToByteArray());
  }
  if (body instanceof Uint8Array) return Buffer.from(body);
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    body.on('data', (chunk: Buffer | Uint8Array | string) => {
      if (Buffer.isBuffer(chunk)) chunks.push(chunk);
      else if (typeof chunk === 'string') chunks.push(Buffer.from(chunk));
      else
        chunks.push(
          Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength),
        );
    });
    body.on('error', reject);
    body.on('end', () => resolve(Buffer.concat(chunks)));
  });
}

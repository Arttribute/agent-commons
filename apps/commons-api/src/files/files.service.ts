import * as schema from '#/models/schema';
import {
  BadRequestException,
  Injectable,
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
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
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
    slides: Array<{
      title: string;
      subtitle?: string;
      bullets?: string[];
      notes?: string;
    }>;
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
    const pptx = new PptxGenJS();
    pptx.layout = 'LAYOUT_WIDE';
    pptx.author = 'Agent Commons';
    pptx.subject = input.title || 'Agent Commons presentation';
    pptx.title = input.title || input.slides[0].title;
    pptx.company = 'Agent Commons';
    pptx.theme = {
      headFontFace: 'Aptos Display',
      bodyFontFace: 'Aptos',
    };
    for (const [index, spec] of input.slides.entries()) {
      const slide = pptx.addSlide();
      slide.background = { color: index === 0 ? '111827' : 'F8FAFC' };
      slide.addShape(pptx.ShapeType.rect, {
        x: 0,
        y: 0,
        w: 0.12,
        h: 7.5,
        line: { color: '6366F1', transparency: 100 },
        fill: { color: '6366F1' },
      });
      slide.addText(spec.title, {
        x: 0.72,
        y: index === 0 ? 2.15 : 0.55,
        w: 11.7,
        h: index === 0 ? 1.2 : 0.75,
        fontFace: 'Aptos Display',
        fontSize: index === 0 ? 31 : 24,
        bold: true,
        color: index === 0 ? 'FFFFFF' : '111827',
        margin: 0,
        breakLine: false,
        fit: 'shrink',
      });
      if (spec.subtitle?.trim()) {
        slide.addText(spec.subtitle.trim(), {
          x: 0.75,
          y: index === 0 ? 3.55 : 1.45,
          w: 11.2,
          h: 0.75,
          fontSize: index === 0 ? 16 : 13,
          color: index === 0 ? 'CBD5E1' : '64748B',
          margin: 0,
          fit: 'shrink',
        });
      }
      if (spec.bullets?.length) {
        slide.addText(
          spec.bullets.slice(0, 12).map((text) => ({
            text,
            options: { bullet: { indent: 18 }, hanging: 4, breakLine: true },
          })),
          {
            x: 0.9,
            y: index === 0 ? 4.45 : 2.2,
            w: 11.1,
            h: index === 0 ? 2 : 4.3,
            fontSize: index === 0 ? 15 : 18,
            color: index === 0 ? 'E2E8F0' : '334155',
            paraSpaceAfter: 12,
            valign: 'top',
            margin: 0,
            breakLine: false,
            fit: 'shrink',
          },
        );
      }
      slide.addText(String(index + 1).padStart(2, '0'), {
        x: 12,
        y: 7.05,
        w: 0.65,
        h: 0.2,
        fontSize: 8,
        color: index === 0 ? '94A3B8' : '94A3B8',
        align: 'right',
        margin: 0,
      });
      if (spec.notes?.trim()) slide.addNotes(spec.notes.trim());
    }
    const output = await pptx.write({ outputType: 'nodebuffer' });
    const buffer = Buffer.isBuffer(output)
      ? output
      : Buffer.from(output as ArrayBuffer);
    return this.persistFile({
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
      metadata: versionMetadata(input.sourceFileId),
    });
  }

  async createPdfFile(input: {
    fileName: string;
    title?: string;
    sections: Array<{ heading?: string; body: string }>;
    agentId: string;
    sessionId?: string;
    sourceFileId?: string;
  }) {
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
        ['image', 'pdf_embedded_image', 'pdf_page_image'].includes(artifact.role),
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
    const ownership = await this.resolveOwnership(input);
    const storageProvider = await this.resolveStorageProvider(
      ownership.ownerUserId,
      input.storageProvider,
    );
    const bucket = storageProvider === 's3' ? this.bucketName() : 'ipfs';
    if (storageProvider === 's3') await this.ensureBucket();
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
      await this.db
        .insert(schema.libraryLink)
        .values({
          itemId: fileId,
          scopeType: 'session',
          scopeId: input.sessionId,
        })
        .onConflictDoNothing();
    }
    await this.indexText(fileId, text);
    await this.audit(
      fileId,
      input.ownerType ?? 'user',
      input.ownerId ?? ownership.ownerUserId,
      'created',
    );

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
    const loadingTask = pdfjs.getDocument({
      data: new Uint8Array(buffer),
      disableWorker: true,
      useSystemFonts: true,
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
      const identity = typeof argument === 'string' ? argument : `inline-${index}`;
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

      const output = await sharp(Buffer.from(data.buffer, data.byteOffset, data.byteLength), {
        raw: { width, height, channels },
      })
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
        const value = page.objs.get(objectId, (resolved: any) => resolve(resolved));
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

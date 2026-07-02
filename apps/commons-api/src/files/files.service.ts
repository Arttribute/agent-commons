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
import { eq, inArray } from 'drizzle-orm';
import crypto from 'crypto';
import sharp from 'sharp';
import mammoth from 'mammoth';
import * as XLSX from 'xlsx';
import { v4 as uuidv4 } from 'uuid';
import { DatabaseService } from '~/modules/database/database.service';

type FileKind =
  | 'image'
  | 'pdf'
  | 'spreadsheet'
  | 'document'
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
const DEFAULT_PDF_RENDER_PAGES = 3;
const DEFAULT_SIGNED_URL_SECONDS = 60 * 30;

@Injectable()
export class FilesService {
  private readonly logger = new Logger(FilesService.name);
  private s3Client?: S3Client;
  private bucketReady?: Promise<void>;

  constructor(private readonly db: DatabaseService) {}

  async createFromUploads(
    files: Express.Multer.File[],
    input: Omit<PersistFileInput, 'buffer' | 'originalName' | 'mimeType'>,
  ): Promise<FileAttachmentRef[]> {
    if (!files?.length) throw new BadRequestException('No files were uploaded');
    const maxFiles = Number(process.env.AGENT_FILE_UPLOAD_MAX_FILES ?? 10);
    if (files.length > maxFiles) {
      throw new BadRequestException(`Upload at most ${maxFiles} files at a time`);
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
      throw new BadRequestException('createSpreadsheetFile requires at least one sheet');
    }
    if (input.sheets.length > 20) {
      throw new BadRequestException('createSpreadsheetFile supports up to 20 sheets');
    }

    const workbook = XLSX.utils.book_new();
    for (const sheet of input.sheets) {
      const rows = sheet.rows ?? [];
      if (rows.length > 10_000) {
        throw new BadRequestException(`Sheet "${sheet.name}" exceeds the 10,000 row limit`);
      }
      const worksheet = rowsToWorksheet(rows);
      XLSX.utils.book_append_sheet(
        workbook,
        worksheet,
        sanitizeSheetName(sheet.name || `Sheet ${workbook.SheetNames.length + 1}`),
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

  async readFileForAgent(input: {
    fileId: string;
    agentId?: string;
    sessionId?: string;
    ownerId?: string;
    offset?: number;
    maxChars?: number;
    includeImageUrls?: boolean;
    pageNumber?: number;
  }) {
    const file = await this.getFileOrThrow(input.fileId);
    this.assertCanAccess(file, input);

    const maxChars = clamp(
      Number(input.maxChars ?? DEFAULT_MAX_READ_CHARS),
      1,
      ABSOLUTE_MAX_READ_CHARS,
    );
    const offset = Math.max(0, Number(input.offset ?? 0));
    const fullText = file.textStoragePath
      ? await this.downloadText(file.storageBucket, file.textStoragePath)
      : (file.textPreview ?? '');
    const content = fullText.slice(offset, offset + maxChars);
    const nextOffset = offset + content.length;
    const artifacts = await this.getArtifacts(file.fileId);
    const filteredArtifacts = input.pageNumber
      ? artifacts.filter((artifact) => artifact.pageNumber === input.pageNumber)
      : artifacts;

    return {
      fileId: file.fileId,
      name: file.originalName,
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
      artifacts: await Promise.all(
        filteredArtifacts.map(async (artifact) => ({
          artifactId: artifact.artifactId,
          kind: artifact.kind,
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

    const rows = await this.db.query.fileAttachment.findMany({
      where: (t) => inArray(t.fileId, ids),
      orderBy: (t) => t.createdAt,
    });
    const rowsById = new Map(rows.map((row) => [row.fileId, row]));
    const ordered = ids.map((id) => rowsById.get(id)).filter(Boolean);
    for (const file of ordered) this.assertCanAccess(file!, context);

    const bindToSessionIds = context.sessionId
      ? ordered
          .filter(
            (file) =>
              file &&
              !file.sessionId &&
              (!file.agentId || file.agentId === context.agentId) &&
              (!file.ownerId || file.ownerId === context.ownerId),
          )
          .map((file) => file!.fileId)
      : [];
    if (bindToSessionIds.length) {
      await this.db
        .update(schema.fileAttachment)
        .set({ sessionId: context.sessionId, updatedAt: new Date() })
        .where(inArray(schema.fileAttachment.fileId, bindToSessionIds));
      for (const file of ordered) {
        if (file && bindToSessionIds.includes(file.fileId)) {
          file.sessionId = context.sessionId!;
        }
      }
    }

    const artifacts = ordered.length
      ? await this.db.query.fileArtifact.findMany({
          where: (t) => inArray(t.fileId, ordered.map((file) => file!.fileId)),
          orderBy: (t) => t.createdAt,
        })
      : [];
    const artifactsByFile = new Map<string, typeof artifacts>();
    for (const artifact of artifacts) {
      const list = artifactsByFile.get(artifact.fileId) ?? [];
      list.push(artifact);
      artifactsByFile.set(artifact.fileId, list);
    }

    const attachments = ordered.map((file) =>
      this.toAttachmentRef(file!, artifactsByFile.get(file!.fileId) ?? []),
    );

    const lines = [
      '## Uploaded Files',
      'The user attached these files. Do not ask for them again. Use readUploadedFile with the fileId to read chunked extracted content, sheet text, or PDF page-image URLs. File bytes and base64 are intentionally unavailable in chat history.',
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

    const imageParts: Array<{ type: 'image_url'; image_url: { url: string } }> = [];
    if (context.includeImageParts) {
      const maxImageParts = clamp(Number(context.maxImageParts ?? 4), 0, 8);
      const visualArtifacts = artifacts.filter((artifact) =>
        ['image', 'pdf_page_image'].includes(artifact.kind),
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
    context: { agentId?: string; sessionId?: string; ownerId?: string },
  ) {
    const file = await this.getFileOrThrow(fileId);
    this.assertCanAccess(file, context);
    return this.toAttachmentRef(file, await this.getArtifacts(file.fileId));
  }

  private async persistFile(input: PersistFileInput): Promise<FileAttachmentRef> {
    const maxBytes = Number(
      process.env.AGENT_FILE_UPLOAD_MAX_BYTES ?? 50 * 1024 * 1024,
    );
    if (!input.buffer?.length) throw new BadRequestException('Uploaded file is empty');
    if (input.buffer.length > maxBytes) {
      throw new BadRequestException(
        `File exceeds upload limit (${formatBytes(maxBytes)})`,
      );
    }

    const bucket = this.bucketName();
    await this.ensureBucket();

    const fileId = uuidv4();
    const originalName = sanitizeFileName(input.originalName || 'upload');
    const mimeType = normalizeMimeType(input.mimeType, originalName);
    const kind = classifyFile(mimeType, originalName);
    const sha256 = crypto.createHash('sha256').update(input.buffer).digest('hex');
    const ownerSegment = sanitizePathSegment(
      input.workspaceId || input.ownerId || 'unowned',
    );
    const agentSegment = sanitizePathSegment(input.agentId || 'no-agent');
    const sessionSegment = sanitizePathSegment(input.sessionId || 'no-session');
    const basePath = [
      this.keyPrefix(),
      ownerSegment,
      agentSegment,
      sessionSegment,
      fileId,
    ].filter(Boolean).join('/');
    const storagePath = `${basePath}/original/${originalName}`;

    await this.uploadBuffer(bucket, storagePath, input.buffer, mimeType);

    let extraction: ExtractionResult;
    try {
      extraction = await this.extractFile(input.buffer, originalName, mimeType, kind);
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
      await this.uploadBuffer(bucket, artifactPath, artifact.buffer, artifact.mimeType);
      persistedArtifacts.push({
        kind: artifact.kind,
        storageBucket: bucket,
        storagePath: artifactPath,
        mimeType: artifact.mimeType,
        sizeBytes: artifact.buffer.length,
        pageNumber: artifact.pageNumber,
        width: artifact.width,
        height: artifact.height,
        metadata: artifact.metadata,
      });
    }

    const text = this.capExtractedText(extraction.text);
    const textStoragePath = text
      ? `${basePath}/derived/extracted.txt`
      : undefined;
    if (textStoragePath) {
      await this.uploadBuffer(
        bucket,
        textStoragePath,
        Buffer.from(text, 'utf8'),
        'text/plain; charset=utf-8',
      );
    }

    const [file] = await this.db
      .insert(schema.fileAttachment)
      .values({
        fileId,
        agentId: input.agentId || null,
        sessionId: input.sessionId || null,
        ownerId: input.ownerId || null,
        ownerType: input.ownerType ?? 'user',
        workspaceId: input.workspaceId || null,
        storageBucket: bucket,
        storagePath,
        originalName,
        mimeType,
        kind,
        sizeBytes: input.buffer.length,
        sha256,
        status: extraction.status,
        textStoragePath,
        textPreview: text ? text.slice(0, DEFAULT_PREVIEW_CHARS) : null,
        extractedTextChars: text.length,
        extractionError: extraction.error,
        metadata: {
          ...extraction.metadata,
          maxExtractedTextChars: this.maxExtractedTextChars(),
          originalTextChars: extraction.text.length,
          textTruncated: extraction.text.length > text.length,
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    if (persistedArtifacts.length) {
      await this.db.insert(schema.fileArtifact).values(
        persistedArtifacts.map((artifact) => ({
          fileId,
          kind: artifact.kind,
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
      );
    }

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
      case 'csv':
      case 'text':
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
          artifacts: [],
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
    }

    const artifacts: ExtractedArtifact[] = [];
    const renderPages = Math.min(
      pdf.numPages,
      Number(process.env.AGENT_FILE_PDF_RENDER_PAGES ?? DEFAULT_PDF_RENDER_PAGES),
    );
    for (let pageNumber = 1; pageNumber <= renderPages; pageNumber += 1) {
      const rendered = await this.renderPdfPage(pdf, pageNumber).catch((error) => {
        this.logger.warn(
          `Could not render PDF page ${pageNumber}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        return null;
      });
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
        renderedPages: artifacts.length,
      },
      artifacts,
      status: text || artifacts.length ? 'ready' : 'partial',
    };
  }

  private async renderPdfPage(pdf: any, pageNumber: number) {
    const { createCanvas } = await import('@napi-rs/canvas');
    const page = await pdf.getPage(pageNumber);
    const baseViewport = page.getViewport({ scale: 1 });
    const maxDimension = Number(process.env.AGENT_FILE_PDF_RENDER_MAX_PX ?? 1400);
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
        status: 'ready',
      };
    }

    return {
      text: '',
      metadata: { note: 'Document extractor currently supports .docx' },
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
    const file = await this.db.query.fileAttachment.findFirst({
      where: (t) => eq(t.fileId, fileId),
    });
    if (!file) throw new NotFoundException(`File ${fileId} not found`);
    return file;
  }

  private async getArtifacts(fileId: string) {
    return this.db.query.fileArtifact.findMany({
      where: (t) => eq(t.fileId, fileId),
      orderBy: (t) => t.createdAt,
    });
  }

  private assertCanAccess(
    file: { agentId: string | null; sessionId: string | null; ownerId: string | null },
    context: { agentId?: string; sessionId?: string; ownerId?: string },
  ) {
    if (context.ownerId && file.ownerId === context.ownerId) return;
    if (context.sessionId && file.sessionId === context.sessionId) return;
    if (
      context.agentId &&
      file.agentId === context.agentId &&
      (file.ownerId === context.agentId || (!file.ownerId && !file.sessionId))
    ) {
      return;
    }
    if (!file.agentId && !file.sessionId && !file.ownerId) return;
    throw new BadRequestException('File is not available in this context');
  }

  private async downloadText(bucket: string, path: string) {
    const response = await this.s3().send(
      new GetObjectCommand({ Bucket: bucket, Key: path }) as any,
    );
    return streamToString((response as any).Body);
  }

  private async createSignedUrl(bucket: string, path: string) {
    return getSignedUrl(
      this.s3() as any,
      new GetObjectCommand({ Bucket: bucket, Key: path }) as any,
      {
        expiresIn: Number(
          process.env.AGENT_FILE_SIGNED_URL_SECONDS ?? DEFAULT_SIGNED_URL_SECONDS,
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
        ServerSideEncryption:
          process.env.AGENT_FILE_S3_SSE === 'false' ? undefined : 'AES256',
      }),
    );
  }

  private async ensureBucket() {
    if (!this.bucketReady) {
      this.bucketReady = (async () => {
        const bucket = this.bucketName();
        try {
          await this.s3().send(new HeadBucketCommand({ Bucket: bucket }));
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
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
    const roleArn =
      process.env.AGENT_FILES_AWS_ROLE_ARN ||
      process.env.AWS_ROLE_ARN;
    const sharedConfig = {
      region,
      endpoint: process.env.AGENT_FILES_S3_ENDPOINT,
      forcePathStyle: process.env.AGENT_FILES_S3_FORCE_PATH_STYLE === 'true',
    };
    if (roleArn) {
      this.s3Client = new S3Client({
        ...sharedConfig,
        credentials: awsCredentialsProvider({
          roleArn,
          audience: 'https://sts.amazonaws.com',
          clientConfig: { region },
          roleSessionName: 'agent-commons-files',
        }),
      });
      return this.s3Client;
    }
    this.s3Client = new S3Client({
      ...sharedConfig,
    });
    return this.s3Client;
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
    return (process.env.AGENT_FILES_S3_PREFIX || 'agent-commons-files')
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
    file: typeof schema.fileAttachment.$inferSelect,
    artifacts: Array<typeof schema.fileArtifact.$inferSelect>,
  ): FileAttachmentRef {
    return {
      fileId: file.fileId,
      name: file.originalName,
      mimeType: file.mimeType,
      kind: file.kind as FileKind,
      sizeBytes: file.sizeBytes,
      status: file.status,
      textPreview: file.textPreview,
      extractedTextChars: file.extractedTextChars,
      artifacts: artifacts.map((artifact) => ({
        artifactId: artifact.artifactId,
        kind: artifact.kind,
        mimeType: artifact.mimeType,
        pageNumber: artifact.pageNumber,
        width: artifact.width,
        height: artifact.height,
      })),
    };
  }
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
  return value
    .normalize('NFKD')
    .replace(/[^\w.\-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120) || 'unknown';
}

function normalizeMimeType(mimeType: string | undefined, fileName: string) {
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
  if (lower.endsWith('.xlsx')) {
    return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  }
  if (lower.endsWith('.xls')) return 'application/vnd.ms-excel';
  return mimeType || 'application/octet-stream';
}

function classifyFile(mimeType: string, fileName: string): FileKind {
  const lower = fileName.toLowerCase();
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType === 'application/pdf' || lower.endsWith('.pdf')) return 'pdf';
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
  if (mimeType.startsWith('text/') || /\.(txt|md|json|xml|html|css|ts|tsx|js|jsx|py|sql)$/i.test(lower)) {
    return 'text';
  }
  if (
    mimeType ===
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    /\.(docx|doc|rtf|odt)$/i.test(lower)
  ) {
    return 'document';
  }
  return 'unknown';
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
      else chunks.push(Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength));
    });
    body.on('error', reject);
    body.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
  });
}

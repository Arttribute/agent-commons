import {
  Body,
  BadRequestException,
  CanActivate,
  Controller,
  ExecutionContext,
  ForbiddenException,
  Get,
  Headers,
  Param,
  Post,
  Query,
  Req,
  OnModuleInit,
  OnModuleDestroy,
  UploadedFiles,
  UploadedFile,
  UseInterceptors,
  UseGuards,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { sql } from 'drizzle-orm';
import sharp from 'sharp';
import { FilesService } from './files.service';
import { DatabaseService } from '~/modules/database/database.service';
import { Public } from '~/modules/auth/public.decorator';
import { PinataService } from '~/pinata/pinata.service';

const uploadLimitBytes = Number(
  process.env.AGENT_FILE_UPLOAD_MAX_BYTES ?? 50 * 1024 * 1024,
);
const uploadLimitFiles = Number(process.env.AGENT_FILE_UPLOAD_MAX_FILES ?? 10);
const DIRECT_UPLOAD_LIMIT = 25 * 1024 * 1024;

type UploadTicket = { nonce: string; ownerId: string; workspaceId?: string; agentId?: string; sessionId?: string; storageProvider?: 's3' | 'ipfs'; name: string; mimeType: string; size: number; expiresAt: number };

function ticketSecret() {
  const secret = process.env.AGENT_FILE_UPLOAD_TICKET_SECRET || process.env.API_SECRET_KEY;
  if (!secret) throw new Error('File upload tickets require AGENT_FILE_UPLOAD_TICKET_SECRET or API_SECRET_KEY');
  return secret;
}

function signTicket(ticket: UploadTicket) {
  const data = Buffer.from(JSON.stringify(ticket)).toString('base64url');
  const signature = createHmac('sha256', ticketSecret()).update(data).digest('base64url');
  return `${data}.${signature}`;
}

function verifyTicket(value: unknown): UploadTicket {
  if (typeof value !== 'string' || value.length > 4096) throw new ForbiddenException('Invalid upload ticket');
  const [data, signature, extra] = value.split('.');
  if (!data || !signature || extra || !/^[A-Za-z0-9_-]+$/.test(data) || !/^[A-Za-z0-9_-]+$/.test(signature)) throw new ForbiddenException('Invalid upload ticket');
  const expected = createHmac('sha256', ticketSecret()).update(data).digest();
  const actual = Buffer.from(signature, 'base64url');
  // Reject alternate base64url spellings with ignored trailing bits. A signed
  // ticket has exactly one canonical representation for audit and replay logs.
  if (actual.toString('base64url') !== signature || actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new ForbiddenException('Invalid upload ticket');
  let ticket: UploadTicket;
  try {
    const payload = Buffer.from(data, 'base64url');
    if (payload.toString('base64url') !== data) throw new Error('Noncanonical payload');
    ticket = JSON.parse(payload.toString('utf8')) as UploadTicket;
  }
  catch { throw new ForbiddenException('Invalid upload ticket'); }
  if (!ticket || typeof ticket !== 'object' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ticket.nonce) || !ticket.ownerId || !ticket.name || !Number.isFinite(ticket.size) || ticket.size < 1 || ticket.size > DIRECT_UPLOAD_LIMIT || !Number.isSafeInteger(ticket.expiresAt) || ticket.expiresAt < Date.now()) {
    throw new ForbiddenException('Upload ticket expired or invalid');
  }
  return ticket;
}

class UploadTicketGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest();
    request.uploadTicket = verifyTicket(request.query?.ticket);
    return true;
  }
}

@Controller({ version: '1', path: 'files' })
export class FilesController implements OnModuleInit, OnModuleDestroy {
  private ticketPruneTimer?: NodeJS.Timeout;
  constructor(private readonly files: FilesService, private readonly pinata: PinataService, private readonly db: DatabaseService) {}

  onModuleInit() {
    const prune = () => {
      void this.db.execute(sql`DELETE FROM agent_file_upload_ticket_use WHERE used_at < now() - interval '1 day'`).catch(() => undefined);
    };
    prune();
    this.ticketPruneTimer = setInterval(prune, 60 * 60 * 1000);
    this.ticketPruneTimer.unref?.();
  }

  onModuleDestroy() {
    if (this.ticketPruneTimer) clearInterval(this.ticketPruneTimer);
  }

  @Post('profile-avatar')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 2 * 1024 * 1024, files: 1 } }))
  async uploadProfileAvatar(@UploadedFile() file: Express.Multer.File) {
    if (!file?.buffer?.length) throw new BadRequestException('Choose a profile image under 2 MB.');
    let image: Buffer;
    try {
      const input = sharp(file.buffer, { limitInputPixels: 16_000_000, animated: false });
      const metadata = await input.metadata();
      if (!metadata.format || !['png', 'jpeg', 'webp', 'gif'].includes(metadata.format)) throw new Error('Unsupported image format');
      image = await input.rotate().resize(512, 512, { fit: 'cover', withoutEnlargement: true }).png().toBuffer();
    } catch {
      throw new BadRequestException('Choose a valid PNG, JPEG, WebP, or GIF image.');
    }
    const result = await this.pinata.uploadFile(image, `profile-${randomUUID()}.png`, 'image/png');
    if (!result?.IpfsHash) throw new BadRequestException('Could not save the profile image.');
    return { data: { url: `https://${process.env.GATEWAY_URL ?? 'gateway.pinata.cloud'}/ipfs/${result.IpfsHash}` } };
  }

  @Post('upload-ticket')
  issueUploadTicket(
    @Body() body: { name?: string; mimeType?: string; size?: number; workspaceId?: string; agentId?: string; sessionId?: string; storageProvider?: 's3' | 'ipfs' },
    @Headers('x-initiator') initiatorHeader: string | undefined,
    @Req() req: any,
  ) {
    const ownerId = req.principal?.principalType === 'user' ? req.principal.principalId : initiatorHeader;
    const name = String(body.name ?? '').trim().slice(0, 255);
    const size = Number(body.size);
    if (!ownerId || !name || !Number.isInteger(size) || size < 1 || size > DIRECT_UPLOAD_LIMIT) {
      throw new BadRequestException('Choose a file up to 25 MB');
    }
    return { data: { ticket: signTicket({ nonce: randomUUID(), ownerId, workspaceId: req.principal?.workspaceId ?? body.workspaceId, agentId: body.agentId?.slice(0, 160), sessionId: body.sessionId?.slice(0, 160), storageProvider: body.storageProvider === 'ipfs' ? 'ipfs' : undefined, name, mimeType: String(body.mimeType || 'application/octet-stream'), size, expiresAt: Date.now() + 5 * 60_000 }) } };
  }

  @Public()
  @Post('upload-direct')
  @UseGuards(UploadTicketGuard)
  @UseInterceptors(FilesInterceptor('files', 1, { storage: memoryStorage(), limits: { fileSize: DIRECT_UPLOAD_LIMIT, files: 1 } }))
  async uploadDirect(@UploadedFiles() files: Express.Multer.File[], @Req() req: any) {
    const ticket = req.uploadTicket as UploadTicket;
    const file = files?.[0];
    if (!file || file.size !== ticket.size || file.originalname !== ticket.name) throw new BadRequestException('Uploaded file does not match its ticket');
    const claimed = (await this.db.execute(sql`
      INSERT INTO agent_file_upload_ticket_use (nonce) VALUES (${ticket.nonce}::uuid)
      ON CONFLICT (nonce) DO NOTHING RETURNING nonce
    `)) as any[];
    if (!claimed[0]) throw new ForbiddenException('Upload ticket has already been used');
    const data = await this.files.createFromUploads([file], { ownerId: ticket.ownerId, ownerType: 'user', workspaceId: ticket.workspaceId ?? null, agentId: ticket.agentId ?? null, sessionId: ticket.sessionId ?? null, storageProvider: ticket.storageProvider });
    return { data };
  }

  @Post('upload')
  @UseInterceptors(
    FilesInterceptor('files', uploadLimitFiles, {
      storage: memoryStorage(),
      limits: { fileSize: uploadLimitBytes, files: uploadLimitFiles },
    }),
  )
  async uploadFiles(
    @UploadedFiles() files: Express.Multer.File[],
    @Body()
    body: {
      agentId?: string;
      sessionId?: string;
      workspaceId?: string;
      storageProvider?: 's3' | 'ipfs';
    },
    @Headers('x-initiator') initiatorHeader: string | undefined,
    @Headers('x-owner-id') ownerHeader: string | undefined,
    @Req() req: any,
  ) {
    const principal = req.principal as
      | {
          principalId: string;
          principalType: 'user' | 'agent' | 'service';
          workspaceId?: string | null;
        }
      | undefined;
    const ownerId =
      principal?.principalType === 'user'
        ? principal.principalId
        : ownerHeader || initiatorHeader || undefined;
    const ownerType =
      principal?.principalType === 'agent'
        ? 'agent'
        : principal?.principalType === 'service'
          ? 'service'
          : 'user';

    const data = await this.files.createFromUploads(files, {
      agentId: body.agentId || null,
      sessionId: body.sessionId || null,
      ownerId,
      ownerType,
      workspaceId: principal?.workspaceId ?? body.workspaceId ?? null,
      storageProvider: body.storageProvider,
    });
    return { data };
  }

  @Get(':fileId')
  async getFile(
    @Param('fileId') fileId: string,
    @Query('agentId') agentId: string | undefined,
    @Query('sessionId') sessionId: string | undefined,
    @Headers('x-initiator') initiatorHeader: string | undefined,
    @Req() req: any,
  ) {
    const principal = req.principal as
      | {
          principalId: string;
          principalType: 'user' | 'agent' | 'service';
          workspaceId?: string | null;
        }
      | undefined;
    const ownerId =
      principal?.principalType === 'user'
        ? principal.principalId
        : initiatorHeader || undefined;
    const data = await this.files.getFileMetadata(fileId, {
      agentId,
      sessionId,
      ownerId,
      workspaceId: principal?.workspaceId ?? undefined,
    });
    return { data };
  }

  @Get(':fileId/content')
  async getFileContent(
    @Param('fileId') fileId: string,
    @Query('agentId') agentId: string | undefined,
    @Query('sessionId') sessionId: string | undefined,
    @Query('offset') offset: string | undefined,
    @Query('maxChars') maxChars: string | undefined,
    @Query('includeImageUrls') includeImageUrls: string | undefined,
    @Query('includeDownloadUrl') includeDownloadUrl: string | undefined,
    @Headers('x-initiator') initiatorHeader: string | undefined,
    @Req() req: any,
  ) {
    const principal = req.principal as
      | {
          principalId: string;
          principalType: 'user' | 'agent' | 'service';
          workspaceId?: string | null;
        }
      | undefined;
    const ownerId =
      principal?.principalType === 'user'
        ? principal.principalId
        : initiatorHeader || undefined;
    const data = await this.files.readFileForAgent({
      fileId,
      agentId,
      sessionId,
      ownerId,
      workspaceId: principal?.workspaceId ?? undefined,
      offset: offset ? Number(offset) : undefined,
      maxChars: maxChars ? Number(maxChars) : undefined,
      includeImageUrls: includeImageUrls === 'true',
      includeDownloadUrl: includeDownloadUrl === 'true',
    });
    return { data };
  }
}

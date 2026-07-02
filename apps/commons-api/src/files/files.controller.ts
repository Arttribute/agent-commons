import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
  Req,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { FilesService } from './files.service';

const uploadLimitBytes = Number(
  process.env.AGENT_FILE_UPLOAD_MAX_BYTES ?? 50 * 1024 * 1024,
);
const uploadLimitFiles = Number(process.env.AGENT_FILE_UPLOAD_MAX_FILES ?? 10);

@Controller({ version: '1', path: 'files' })
export class FilesController {
  constructor(private readonly files: FilesService) {}

  @Post('upload')
  @UseInterceptors(
    FilesInterceptor('files', uploadLimitFiles, {
      storage: memoryStorage(),
      limits: { fileSize: uploadLimitBytes, files: uploadLimitFiles },
    }),
  )
  async uploadFiles(
    @UploadedFiles() files: Express.Multer.File[],
    @Body() body: {
      agentId?: string;
      sessionId?: string;
      workspaceId?: string;
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
      | { principalId: string; principalType: 'user' | 'agent' | 'service' }
      | undefined;
    const ownerId =
      principal?.principalType === 'user'
        ? principal.principalId
        : initiatorHeader || undefined;
    const data = await this.files.getFileMetadata(fileId, {
      agentId,
      sessionId,
      ownerId,
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
    @Headers('x-initiator') initiatorHeader: string | undefined,
    @Req() req: any,
  ) {
    const principal = req.principal as
      | { principalId: string; principalType: 'user' | 'agent' | 'service' }
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
      offset: offset ? Number(offset) : undefined,
      maxChars: maxChars ? Number(maxChars) : undefined,
      includeImageUrls: includeImageUrls === 'true',
    });
    return { data };
  }
}

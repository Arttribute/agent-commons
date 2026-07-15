import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  Public,
  RateLimit,
  resolveCallerId,
  type ApiKeyPrincipal,
} from '~/modules/auth';
import { LibraryService, type LibraryPrincipal } from './library.service';

@Controller({ version: '1', path: 'library' })
export class LibraryController {
  constructor(private readonly library: LibraryService) {}

  @Get('preferences/storage')
  storagePreference(@Req() req: Request) {
    return this.library.getStoragePreference(principalFrom(req));
  }

  @Patch('preferences/storage')
  updateStoragePreference(
    @Req() req: Request,
    @Body() body: { defaultStorageProvider: 's3' | 'ipfs' },
  ) {
    return this.library.setStoragePreference(
      principalFrom(req),
      body.defaultStorageProvider,
    );
  }

  @Get()
  list(
    @Req() req: Request,
    @Query('query') query?: string,
    @Query('view') view?: string,
    @Query('source') source?: string,
    @Query('favorite') favorite?: string,
    @Query('sessionId') sessionId?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.library.list(principalFrom(req), {
      query,
      view,
      source,
      favorite: favorite === 'true',
      sessionId,
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
    });
  }

  @Get(':itemId')
  get(@Req() req: Request, @Param('itemId') itemId: string) {
    return this.library.get(itemId, principalFrom(req));
  }

  @Get(':itemId/download')
  @RateLimit({ limit: 60, windowMs: 60_000, keyStrategy: 'user' })
  download(@Req() req: Request, @Param('itemId') itemId: string) {
    return this.library.download(itemId, principalFrom(req));
  }

  @Patch(':itemId')
  update(
    @Req() req: Request,
    @Param('itemId') itemId: string,
    @Body()
    body: { name?: string; description?: string; isFavorite?: boolean },
  ) {
    return this.library.update(itemId, principalFrom(req), body);
  }

  @Delete(':itemId')
  remove(@Req() req: Request, @Param('itemId') itemId: string) {
    return this.library.remove(itemId, principalFrom(req));
  }

  @Post(':itemId/grants')
  grant(
    @Req() req: Request,
    @Param('itemId') itemId: string,
    @Body()
    body: {
      subjectType: 'user' | 'agent' | 'workspace';
      subjectId: string;
      permission?: 'read' | 'edit' | 'manage';
      expiresAt?: string | null;
    },
  ) {
    return this.library.setGrant(itemId, principalFrom(req), body);
  }

  @Delete(':itemId/grants/:grantId')
  revokeGrant(
    @Req() req: Request,
    @Param('itemId') itemId: string,
    @Param('grantId') grantId: string,
  ) {
    return this.library.revokeGrant(itemId, grantId, principalFrom(req));
  }

  @Post(':itemId/share-links')
  createShare(
    @Req() req: Request,
    @Param('itemId') itemId: string,
    @Body() body: { expiresAt?: string | null } = {},
  ) {
    return this.library.createShareLink(itemId, principalFrom(req), body);
  }

  @Delete(':itemId/share-links/:shareId')
  revokeShare(
    @Req() req: Request,
    @Param('itemId') itemId: string,
    @Param('shareId') shareId: string,
  ) {
    return this.library.revokeShareLink(itemId, shareId, principalFrom(req));
  }
}

@Public()
@Controller({ version: '1', path: 'shared/artifacts' })
export class SharedArtifactController {
  constructor(private readonly library: LibraryService) {}

  @Get(':token')
  @RateLimit({ limit: 30, windowMs: 60_000, keyStrategy: 'ip' })
  resolve(@Param('token') token: string) {
    return this.library.resolveShare(token);
  }
}

function principalFrom(req: Request): LibraryPrincipal {
  const principal = (req as any).principal as ApiKeyPrincipal | undefined;
  const principalId = resolveCallerId(req);
  if (!principalId) throw new Error('Authenticated principal required');
  return {
    principalId,
    principalType: principal?.principalType ?? 'user',
    workspaceId: principal?.workspaceId,
  };
}

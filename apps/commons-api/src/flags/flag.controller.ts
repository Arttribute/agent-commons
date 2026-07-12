import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Post,
  Put,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { FlagService, FlagPrincipal } from './flag.service';
import { resolveCallerId, type ApiKeyPrincipal } from '~/modules/auth';

function principalFrom(req: Request): FlagPrincipal {
  const p = (req as any).principal as ApiKeyPrincipal | undefined;
  const principalId = resolveCallerId(req);
  if (!principalId) throw new ForbiddenException('Authentication required');
  return { principalId, workspaceId: p?.workspaceId ?? null };
}

function assertFlagAdmin(req: Request) {
  const p = (req as any).principal as ApiKeyPrincipal | undefined;
  const ok =
    p?.scopes?.includes('flags:admin') ||
    p?.scopes?.includes('platform:admin') ||
    p?.scopes?.includes('legacy:delegate');
  if (!ok) throw new ForbiddenException('flags:admin scope required');
}

@Controller('v1/flags')
export class FlagController {
  constructor(private readonly flags: FlagService) {}

  /** Bulk-evaluate all flags for the caller (one call at app boot). */
  @Get()
  async evaluateAll(@Req() req: Request) {
    const data = await this.flags.evaluateAll(principalFrom(req));
    return { data };
  }

  // ── Admin (must precede :key to avoid capture) ─────────────────────────────

  @Get('admin/all')
  async adminList(@Req() req: Request) {
    assertFlagAdmin(req);
    return { data: await this.flags.list() };
  }

  @Put('admin/:key')
  async adminUpsert(
    @Param('key') key: string,
    @Body() body: any,
    @Req() req: Request,
  ) {
    assertFlagAdmin(req);
    const data = await this.flags.upsert({ ...body, flagKey: key });
    return { data };
  }

  @Post('admin/:key/override')
  async adminOverride(
    @Param('key') key: string,
    @Body()
    body: {
      subjectType: 'user' | 'workspace';
      subjectId: string;
      variantKey?: string | null;
      enabled?: boolean | null;
    },
    @Req() req: Request,
  ) {
    assertFlagAdmin(req);
    await this.flags.setOverride({ ...body, flagKey: key });
    return { success: true };
  }

  @Delete('admin/:key')
  async adminArchive(@Param('key') key: string, @Req() req: Request) {
    assertFlagAdmin(req);
    await this.flags.archive(key);
    return { success: true };
  }

  /** Evaluate a single flag for the caller. */
  @Get(':key')
  async evaluate(@Param('key') key: string, @Req() req: Request) {
    const data = await this.flags.evaluate(key, principalFrom(req));
    return { data };
  }
}

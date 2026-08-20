import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { resolveCallerId, type ApiKeyPrincipal } from '~/modules/auth';
import { CreateUiPluginInput, UiPluginService } from './ui-plugin.service';

@Controller({ version: '1', path: 'ui-plugins' })
export class UiPluginController {
  constructor(private readonly plugins: UiPluginService) {}

  @Get()
  async list(@Req() request: Request, @Query('active') active?: string) {
    return {
      data: await this.plugins.list(requester(request).principalId, {
        activeOnly: active === 'true',
      }),
    };
  }

  @Get('slug/:slug')
  async get(@Req() request: Request, @Param('slug') slug: string) {
    return {
      data: await this.plugins.getBySlug(requester(request).principalId, slug),
    };
  }

  @Put()
  async create(@Req() request: Request, @Body() body: CreateUiPluginInput) {
    const principal = requester(request);
    return {
      data: await this.plugins.create(
        principal.principalId,
        principal.workspaceId,
        body,
      ),
    };
  }

  @Put(':pluginId/status')
  async status(
    @Req() request: Request,
    @Param('pluginId') pluginId: string,
    @Body() body: { status: 'draft' | 'active' | 'disabled' },
  ) {
    return {
      data: await this.plugins.setStatus(
        requester(request).principalId,
        pluginId,
        body.status,
      ),
    };
  }

  @Delete(':pluginId')
  remove(@Req() request: Request, @Param('pluginId') pluginId: string) {
    return this.plugins.remove(requester(request).principalId, pluginId);
  }
}

function requester(request: Request) {
  const principal = (request as any).principal as ApiKeyPrincipal | undefined;
  const principalId = resolveCallerId(request);
  if (!principalId) throw new Error('Authenticated principal required');
  return { principalId, workspaceId: principal?.workspaceId ?? null };
}

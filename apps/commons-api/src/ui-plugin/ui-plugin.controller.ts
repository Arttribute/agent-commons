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
import {
  CreateUiPluginInput,
  MAX_PINNED_APPS,
  UiPluginService,
  type UpdateUiPluginGrantsInput,
} from './ui-plugin.service';
import { UI_PLUGIN_CAPABILITIES } from './ui-plugin.capabilities';
import {
  AppDataService,
  type AppStorageInput,
} from './app-data/app-data.service';
import { AppNetworkService } from './app-network/app-network.service';

@Controller({ version: '1', path: 'ui-plugins' })
export class UiPluginController {
  constructor(
    private readonly plugins: UiPluginService,
    private readonly data: AppDataService,
    private readonly network: AppNetworkService,
  ) {}

  @Get()
  async list(@Req() request: Request, @Query('active') active?: string) {
    return {
      data: await this.plugins.list(requester(request).principalId, {
        activeOnly: active === 'true',
      }),
    };
  }

  /** The capability catalog, so clients render permissions from one source. */
  @Get('capabilities')
  capabilities() {
    return { data: UI_PLUGIN_CAPABILITIES };
  }

  @Get('layout')
  async layout(@Req() request: Request) {
    return {
      data: {
        maxPinned: MAX_PINNED_APPS,
        scopes: await this.plugins.getLayout(requester(request).principalId),
      },
    };
  }

  @Put('layout')
  async setLayout(
    @Req() request: Request,
    @Body() body: { scope: string; pluginIds: string[] },
  ) {
    return {
      data: {
        maxPinned: MAX_PINNED_APPS,
        scopes: await this.plugins.setLayout(
          requester(request).principalId,
          body?.scope,
          body?.pluginIds,
        ),
      },
    };
  }

  @Delete('layout')
  async resetLayout(@Req() request: Request, @Query('scope') scope: string) {
    return {
      data: {
        maxPinned: MAX_PINNED_APPS,
        scopes: await this.plugins.resetLayout(
          requester(request).principalId,
          scope,
        ),
      },
    };
  }

  @Get('slug/:slug')
  async get(@Req() request: Request, @Param('slug') slug: string) {
    return {
      data: await this.plugins.getBySlug(requester(request).principalId, slug),
    };
  }

  @Get(':pluginId')
  async getById(
    @Req() request: Request,
    @Param('pluginId') pluginId: string,
    @Query('active') active?: string,
  ) {
    return {
      data: await this.plugins.getById(
        requester(request).principalId,
        pluginId,
        { activeOnly: active === 'true' },
      ),
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
    @Body()
    body: {
      status: 'draft' | 'active' | 'disabled';
      grants?: UpdateUiPluginGrantsInput;
    },
  ) {
    return {
      data: await this.plugins.setStatus(
        requester(request).principalId,
        pluginId,
        body.status,
        body.grants,
      ),
    };
  }

  @Put(':pluginId/grants')
  async grants(
    @Req() request: Request,
    @Param('pluginId') pluginId: string,
    @Body() body: UpdateUiPluginGrantsInput,
  ) {
    return {
      data: await this.plugins.updateGrants(
        requester(request).principalId,
        pluginId,
        body ?? {},
      ),
    };
  }

  @Put(':pluginId/appearance')
  async appearance(
    @Req() request: Request,
    @Param('pluginId') pluginId: string,
    @Body() body: { iconUrl?: string | null },
  ) {
    return {
      data: await this.plugins.updateAppearance(
        requester(request).principalId,
        pluginId,
        body ?? {},
      ),
    };
  }

  @Get(':pluginId/connections')
  async connections(
    @Req() request: Request,
    @Param('pluginId') pluginId: string,
  ) {
    const ownerId = requester(request).principalId;
    const plugin = await this.plugins.findOwned(ownerId, pluginId);
    return { data: await this.network.listConnections(ownerId, plugin) };
  }

  @Put(':pluginId/connections/:key')
  async saveConnection(
    @Req() request: Request,
    @Param('pluginId') pluginId: string,
    @Param('key') key: string,
    @Body() body: { secret?: string | null; enabled?: boolean },
  ) {
    const ownerId = requester(request).principalId;
    const plugin = await this.plugins.findOwned(ownerId, pluginId);
    return {
      data: await this.network.saveConnection(ownerId, plugin, key, body ?? {}),
    };
  }

  @Get(':pluginId/storage')
  async storage(@Req() request: Request, @Param('pluginId') pluginId: string) {
    const ownerId = requester(request).principalId;
    const plugin = await this.plugins.findOwned(ownerId, pluginId);
    return { data: await this.data.getStorage(ownerId, plugin) };
  }

  @Put(':pluginId/storage')
  async setStorage(
    @Req() request: Request,
    @Param('pluginId') pluginId: string,
    @Body() body: AppStorageInput,
  ) {
    const ownerId = requester(request).principalId;
    const plugin = await this.plugins.findOwned(ownerId, pluginId);
    return { data: await this.data.setStorage(ownerId, plugin, body) };
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

import { Body, Controller, Delete, Get, Param, Put, Req } from '@nestjs/common';
import type { Request } from 'express';
import { resolveCallerId, type ApiKeyPrincipal } from '~/modules/auth';
import {
  CapabilityProviderInput,
  CapabilityProviderService,
  type CapabilityName,
} from './capability-provider.service';

@Controller({ version: '1', path: 'providers' })
export class CapabilityProviderController {
  constructor(private readonly providers: CapabilityProviderService) {}

  @Get()
  list(@Req() request: Request) {
    const principal = requester(request);
    return this.providers.list(principal.principalId);
  }

  @Put(':capability')
  async upsert(
    @Req() request: Request,
    @Param('capability') capability: CapabilityName,
    @Body() body: CapabilityProviderInput,
  ) {
    const principal = requester(request);
    return {
      data: await this.providers.upsert(
        principal.principalId,
        principal.workspaceId,
        capability,
        body,
      ),
    };
  }

  @Delete(':capability')
  remove(
    @Req() request: Request,
    @Param('capability') capability: CapabilityName,
  ) {
    return this.providers.remove(requester(request).principalId, capability);
  }
}

function requester(request: Request) {
  const principal = (request as any).principal as ApiKeyPrincipal | undefined;
  const principalId = resolveCallerId(request);
  if (!principalId) throw new Error('Authenticated principal required');
  return { principalId, workspaceId: principal?.workspaceId ?? null };
}

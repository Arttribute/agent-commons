// src/tool/tool-key.controller.ts

import {
  Controller,
  Post,
  Get,
  Put,
  Delete,
  Body,
  Param,
  Req,
  ForbiddenException,
} from '@nestjs/common';
import { Request } from 'express';
import { ToolKeyService, KeyOwner } from './tool-key.service';
import { resolveCallerId, type ApiKeyPrincipal } from '~/modules/auth';

/**
 * Resolve the owning principal for a tool-key operation from the auth context.
 * The owner is always derived from the authenticated caller — never from a
 * value supplied in the request body or query string:
 *   - a direct agent key → that agent owns the key;
 *   - a direct user token, or a trusted service delegating on a user's behalf
 *     (commons-app proxy, via x-owner-id / x-initiator) → that user owns it.
 */
function keyOwner(req: Request): KeyOwner {
  const principal = (req as any).principal as ApiKeyPrincipal | undefined;
  if (principal?.principalType === 'agent') {
    return { ownerId: principal.principalId, ownerType: 'agent' };
  }
  const callerId = resolveCallerId(req);
  if (!callerId) {
    throw new ForbiddenException(
      'A user or agent principal is required to manage tool keys',
    );
  }
  return { ownerId: callerId, ownerType: 'user' };
}

@Controller({ version: '1', path: 'tool-keys' })
export class ToolKeyController {
  constructor(private readonly toolKeyService: ToolKeyService) {}

  /**
   * POST /v1/tool-keys
   * Create a new encrypted API key. Owner is taken from the auth context.
   */
  @Post()
  async createKey(
    @Body()
    body: {
      keyName: string;
      value: string;
      toolId?: string;
      displayName?: string;
      description?: string;
      keyType?: 'api-key' | 'bearer-token' | 'oauth-token' | 'secret';
      expiresAt?: string;
    },
    @Req() req: Request,
  ) {
    const owner = keyOwner(req);
    const key = await this.toolKeyService.createKey({
      ...body,
      ownerId: owner.ownerId,
      ownerType: owner.ownerType,
      expiresAt: body.expiresAt ? new Date(body.expiresAt) : undefined,
    });

    return { success: true, data: key };
  }

  /**
   * GET /v1/tool-keys
   * List all keys for the authenticated owner.
   */
  @Get()
  async listKeys(@Req() req: Request) {
    const owner = keyOwner(req);
    const keys = await this.toolKeyService.listKeys(
      owner.ownerId,
      owner.ownerType,
    );
    return { success: true, data: keys };
  }

  /**
   * GET /v1/tool-keys/:keyId
   * Get key metadata (without decrypted value)
   */
  @Get(':keyId')
  async getKeyMetadata(@Param('keyId') keyId: string, @Req() req: Request) {
    const key = await this.toolKeyService.getKeyMetadata(keyId, keyOwner(req));
    return { success: true, data: key };
  }

  /**
   * PUT /v1/tool-keys/:keyId/metadata
   * Update key metadata (not the value)
   */
  @Put(':keyId/metadata')
  async updateKeyMetadata(
    @Param('keyId') keyId: string,
    @Body()
    body: {
      displayName?: string;
      description?: string;
      isActive?: boolean;
      expiresAt?: string;
    },
    @Req() req: Request,
  ) {
    const updated = await this.toolKeyService.updateKeyMetadata(
      keyId,
      {
        ...body,
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : undefined,
      },
      keyOwner(req),
    );

    return { success: true, data: updated };
  }

  /**
   * PUT /v1/tool-keys/:keyId/value
   * Update key value (re-encrypts with new value)
   */
  @Put(':keyId/value')
  async updateKeyValue(
    @Param('keyId') keyId: string,
    @Body() body: { value: string },
    @Req() req: Request,
  ) {
    const result = await this.toolKeyService.updateKeyValue(
      keyId,
      body.value,
      keyOwner(req),
    );

    return { success: true, data: result };
  }

  /**
   * DELETE /v1/tool-keys/:keyId
   * Delete a key
   */
  @Delete(':keyId')
  async deleteKey(@Param('keyId') keyId: string, @Req() req: Request) {
    const result = await this.toolKeyService.deleteKey(keyId, keyOwner(req));
    return result;
  }

  /**
   * POST /v1/tool-keys/:keyId/test
   * Test if a key is valid
   */
  @Post(':keyId/test')
  async testKey(@Param('keyId') keyId: string, @Req() req: Request) {
    const result = await this.toolKeyService.testKey(keyId, keyOwner(req));
    return { success: true, data: result };
  }

  /**
   * POST /v1/tool-keys/map
   * Map a key to a tool for a specific context
   */
  @Post('map')
  async mapKeyToTool(
    @Body()
    body: {
      toolId: string;
      keyId: string;
      contextId: string;
      contextType: 'user' | 'agent' | 'global';
      priority?: number;
    },
    @Req() req: Request,
  ) {
    const mapping = await this.toolKeyService.mapKeyToTool(body, keyOwner(req));
    return { success: true, data: mapping };
  }

  /**
   * DELETE /v1/tool-keys/map/:mappingId
   * Remove a key mapping
   */
  @Delete('map/:mappingId')
  async removeKeyMapping(
    @Param('mappingId') mappingId: string,
    @Req() req: Request,
  ) {
    const result = await this.toolKeyService.removeKeyMapping(
      mappingId,
      keyOwner(req),
    );
    return result;
  }
}

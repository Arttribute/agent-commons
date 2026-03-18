// src/tool/tool-key.controller.ts

import {
  Controller,
  Post,
  Get,
  Put,
  Delete,
  Body,
  Param,
  Query,
} from '@nestjs/common';
import { ToolKeyService } from './tool-key.service';

@Controller({ version: '1', path: 'tool-keys' })
export class ToolKeyController {
  constructor(private readonly toolKeyService: ToolKeyService) {}

  /**
   * POST /v1/tool-keys
   * Create a new encrypted API key
   */
  @Post()
  async createKey(
    @Body()
    body: {
      keyName: string;
      value: string;
      ownerId: string;
      ownerType: 'user' | 'agent';
      toolId?: string;
      displayName?: string;
      description?: string;
      keyType?: 'api-key' | 'bearer-token' | 'oauth-token' | 'secret';
      expiresAt?: string;
    },
  ) {
    const key = await this.toolKeyService.createKey({
      ...body,
      expiresAt: body.expiresAt ? new Date(body.expiresAt) : undefined,
    });

    return { success: true, data: key };
  }

  /**
   * GET /v1/tool-keys
   * List all keys for an owner (user or agent)
   */
  @Get()
  async listKeys(
    @Query('ownerId') ownerId: string,
    @Query('ownerType') ownerType: 'user' | 'agent',
  ) {
    const keys = await this.toolKeyService.listKeys(ownerId, ownerType);
    return { success: true, data: keys };
  }

  /**
   * GET /v1/tool-keys/:keyId
   * Get key metadata (without decrypted value)
   */
  @Get(':keyId')
  async getKeyMetadata(@Param('keyId') keyId: string) {
    const key = await this.toolKeyService.getKeyMetadata(keyId);
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
  ) {
    const updated = await this.toolKeyService.updateKeyMetadata(keyId, {
      ...body,
      expiresAt: body.expiresAt ? new Date(body.expiresAt) : undefined,
    });

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
  ) {
    const result = await this.toolKeyService.updateKeyValue(
      keyId,
      body.value,
    );

    return { success: true, data: result };
  }

  /**
   * DELETE /v1/tool-keys/:keyId
   * Delete a key
   */
  @Delete(':keyId')
  async deleteKey(@Param('keyId') keyId: string) {
    const result = await this.toolKeyService.deleteKey(keyId);
    return result;
  }

  /**
   * POST /v1/tool-keys/:keyId/test
   * Test if a key is valid
   */
  @Post(':keyId/test')
  async testKey(@Param('keyId') keyId: string) {
    const result = await this.toolKeyService.testKey(keyId);
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
  ) {
    const mapping = await this.toolKeyService.mapKeyToTool(body);
    return { success: true, data: mapping };
  }

  /**
   * DELETE /v1/tool-keys/map/:mappingId
   * Remove a key mapping
   */
  @Delete('map/:mappingId')
  async removeKeyMapping(@Param('mappingId') mappingId: string) {
    const result = await this.toolKeyService.removeKeyMapping(mappingId);
    return result;
  }

  /**
   * POST /v1/tool-keys/:keyId/rotate
   * Rotate key encryption
   */
  @Post(':keyId/rotate')
  async rotateKeyEncryption(@Param('keyId') keyId: string) {
    const result = await this.toolKeyService.rotateKeyEncryption(keyId);
    return result;
  }
}

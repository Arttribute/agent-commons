import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiKeyService, ApiKeyPrincipal } from './api-key.service';
import { CreateApiKeyDto } from './dto/api-key.dto';

@Controller('v1/auth/api-keys')
export class AuthController {
  constructor(private readonly apiKeyService: ApiKeyService) {}

  /**
   * POST /v1/auth/api-keys
   *
   * Management key callers (commons-app): can create keys for any principal.
   * Per-principal key callers: can only create keys for themselves.
   */
  @Post()
  async create(@Body() dto: CreateApiKeyDto, @Req() req: any) {
    const caller = req.principal as ApiKeyPrincipal | undefined;

    if (caller) {
      const isSelf =
        dto.principalId?.toLowerCase() === caller.principalId.toLowerCase() &&
        dto.principalType === caller.principalType;
      if (!isSelf) {
        throw new ForbiddenException('You can only create API keys for yourself');
      }
    }

    const { key, record } = await this.apiKeyService.generate(
      dto.principalId,
      dto.principalType,
      dto.label,
    );

    return { key, id: record.id, label: record.label, createdAt: record.createdAt };
  }

  /**
   * GET /v1/auth/api-keys?principalId=<id>&principalType=<user|agent>
   *
   * Management key callers: can list any principal's keys.
   * Per-principal key callers: can only list their own keys.
   */
  @Get()
  async list(
    @Query('principalId') principalId: string,
    @Query('principalType') principalType: 'user' | 'agent',
    @Req() req: any,
  ) {
    const caller = req.principal as ApiKeyPrincipal | undefined;

    if (caller && caller.principalId.toLowerCase() !== principalId?.toLowerCase()) {
      throw new ForbiddenException('You can only list your own API keys');
    }

    return this.apiKeyService.list(principalId, principalType);
  }

  /**
   * DELETE /v1/auth/api-keys/:id
   */
  @Delete(':id')
  async revoke(@Param('id') id: string) {
    await this.apiKeyService.revoke(id);
    return { revoked: true };
  }
}

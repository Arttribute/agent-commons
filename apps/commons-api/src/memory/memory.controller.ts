import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Version,
} from '@nestjs/common';
import { MemoryService, MemoryType } from './memory.service';

class CreateMemoryDto {
  agentId: string;
  sessionId?: string;
  memoryType?: MemoryType;
  content: string;
  summary: string;
  importanceScore?: number;
  tags?: string[];
}

class UpdateMemoryDto {
  content?: string;
  summary?: string;
  importanceScore?: number;
  tags?: string[];
  isActive?: boolean;
  memoryType?: MemoryType;
}

@Controller('memory')
export class MemoryController {
  constructor(private memoryService: MemoryService) {}

  /** GET /v1/memory/agents/:agentId — list all memories for an agent */
  @Get('agents/:agentId')
  @Version('1')
  async list(
    @Param('agentId') agentId: string,
    @Query('type') type?: MemoryType,
    @Query('limit') limit?: string,
  ) {
    const data = await this.memoryService.getMemories(agentId, {
      activeOnly: true,
      type,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
    return { data };
  }

  /** GET /v1/memory/agents/:agentId/stats */
  @Get('agents/:agentId/stats')
  @Version('1')
  async stats(@Param('agentId') agentId: string) {
    const data = await this.memoryService.getStats(agentId);
    return { data };
  }

  /** GET /v1/memory/agents/:agentId/retrieve?q=<query> */
  @Get('agents/:agentId/retrieve')
  @Version('1')
  async retrieve(
    @Param('agentId') agentId: string,
    @Query('q') query: string,
    @Query('limit') limit?: string,
  ) {
    const data = await this.memoryService.retrieveRelevant(
      agentId,
      query ?? '',
      limit ? parseInt(limit, 10) : 10,
    );
    return { data };
  }

  /** GET /v1/memory/:memoryId */
  @Get(':memoryId')
  @Version('1')
  async getOne(@Param('memoryId') memoryId: string) {
    const data = await this.memoryService.getMemory(memoryId);
    if (!data) throw new NotFoundException('Memory not found');
    return { data };
  }

  /** POST /v1/memory — manually create a memory */
  @Post()
  @Version('1')
  async create(@Body() dto: CreateMemoryDto) {
    const data = await this.memoryService.createMemory({
      agentId: dto.agentId,
      sessionId: dto.sessionId as any,
      memoryType: dto.memoryType ?? 'semantic',
      content: dto.content,
      summary: dto.summary,
      importanceScore: dto.importanceScore ?? 0.5,
      tags: dto.tags ?? [],
      sourceType: 'manual',
      isActive: true,
    });
    return { data };
  }

  /** PATCH /v1/memory/:memoryId */
  @Patch(':memoryId')
  @Version('1')
  async update(
    @Param('memoryId') memoryId: string,
    @Body() dto: UpdateMemoryDto,
  ) {
    const data = await this.memoryService.updateMemory(memoryId, dto);
    if (!data) throw new NotFoundException('Memory not found');
    return { data };
  }

  /** DELETE /v1/memory/:memoryId */
  @Delete(':memoryId')
  @Version('1')
  @HttpCode(204)
  async remove(@Param('memoryId') memoryId: string): Promise<void> {
    await this.memoryService.deleteMemory(memoryId);
  }
}

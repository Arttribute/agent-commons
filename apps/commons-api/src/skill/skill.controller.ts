import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  Query,
  Req,
  HttpCode,
  HttpStatus,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Request } from 'express';
import { resolveCallerId, type ApiKeyPrincipal } from '~/modules/auth';
import { SkillService, CreateSkillDto } from './skill.service';

@Controller({ version: '1', path: 'skills' })
export class SkillController {
  constructor(private readonly skillService: SkillService) {}

  @Get()
  async list(
    @Req() req: Request,
    @Query('ownerId') ownerId?: string,
    @Query('ownerType') ownerType?: string,
    @Query('isPublic') isPublic?: string,
  ) {
    const filter: any = {};
    if (ownerId) filter.ownerId = ownerId;
    if (ownerType) filter.ownerType = ownerType;
    if (isPublic !== undefined) filter.isPublic = isPublic === 'true';

    const principal = principalFrom(req);
    const skills = await this.skillService.list(
      Object.keys(filter).length ? filter : undefined,
      principal.principalId,
    );
    return { data: skills };
  }

  @Get('index')
  async getIndex(@Req() req: Request, @Query('ownerId') ownerId?: string) {
    const index = await this.skillService.getIndex(
      ownerId,
      principalFrom(req),
    );
    return { data: index };
  }

  @Get('agents/:agentId')
  async listForAgent(@Req() req: Request, @Param('agentId') agentId: string) {
    return {
      data: await this.skillService.listForAgent(agentId, principalFrom(req)),
    };
  }

  @Put(':id/agents/:agentId')
  async assignToAgent(
    @Req() req: Request,
    @Param('id') id: string,
    @Param('agentId') agentId: string,
    @Body() body: { isEnabled?: boolean },
  ) {
    return {
      data: await this.skillService.assignToAgent(
        id,
        agentId,
        body.isEnabled !== false,
        principalFrom(req),
      ),
    };
  }

  @Get(':id')
  async get(@Req() req: Request, @Param('id') id: string) {
    const skill = await this.skillService.get(id, principalFrom(req));
    return { data: skill };
  }

  @Post()
  async create(@Req() req: Request, @Body() dto: CreateSkillDto) {
    const skill = await this.skillService.create(dto, principalFrom(req));
    return { data: skill };
  }

  @Post('import')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024, files: 1 },
    }),
  )
  async importSkill(
    @Req() req: Request,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    return {
      data: await this.skillService.importSkillFile(file, principalFrom(req)),
    };
  }

  @Put(':id')
  async update(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() updates: Partial<CreateSkillDto>,
  ) {
    const skill = await this.skillService.update(
      id,
      updates,
      principalFrom(req),
    );
    return { data: skill };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async delete(@Req() req: Request, @Param('id') id: string) {
    return this.skillService.delete(id, principalFrom(req));
  }
}

function principalFrom(req: Request) {
  const principal = (req as any).principal as ApiKeyPrincipal | undefined;
  const principalId = resolveCallerId(req);
  if (!principalId) throw new Error('Authenticated principal required');
  return {
    principalId,
    workspaceId: principal?.workspaceId,
  };
}

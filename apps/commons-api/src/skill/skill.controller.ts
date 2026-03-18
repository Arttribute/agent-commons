import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { SkillService, CreateSkillDto } from './skill.service';

@Controller({ version: '1', path: 'skills' })
export class SkillController {
  constructor(private readonly skillService: SkillService) {}

  @Get()
  async list(
    @Query('ownerId') ownerId?: string,
    @Query('ownerType') ownerType?: string,
    @Query('isPublic') isPublic?: string,
  ) {
    const filter: any = {};
    if (ownerId) filter.ownerId = ownerId;
    if (ownerType) filter.ownerType = ownerType;
    if (isPublic !== undefined) filter.isPublic = isPublic === 'true';

    const skills = await this.skillService.list(Object.keys(filter).length ? filter : undefined);
    return { data: skills };
  }

  @Get('index')
  async getIndex(@Query('ownerId') ownerId?: string) {
    const index = await this.skillService.getIndex(ownerId);
    return { data: index };
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    const skill = await this.skillService.get(id);
    return { data: skill };
  }

  @Post()
  async create(@Body() dto: CreateSkillDto) {
    const skill = await this.skillService.create(dto);
    return { data: skill };
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() updates: Partial<CreateSkillDto>) {
    const skill = await this.skillService.update(id, updates);
    return { data: skill };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async delete(@Param('id') id: string) {
    return this.skillService.delete(id);
  }
}

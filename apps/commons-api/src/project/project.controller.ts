import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { resolveCallerId, type ApiKeyPrincipal } from '~/modules/auth';
import { ProjectService, type ProjectInput } from './project.service';

function caller(request: Request) {
  const principal = (request as any).principal as ApiKeyPrincipal | undefined;
  const ownerId = resolveCallerId(request);
  if (!ownerId || principal?.principalType === 'agent') {
    throw new UnauthorizedException('A signed-in user is required');
  }
  return { ownerId, workspaceId: principal?.workspaceId ?? null };
}

@Controller({ version: '1', path: 'projects' })
export class ProjectController {
  constructor(private readonly projects: ProjectService) {}

  @Get()
  async list(@Req() request: Request) {
    return { data: await this.projects.list(caller(request).ownerId) };
  }

  @Post()
  async create(@Req() request: Request, @Body() body: ProjectInput) {
    const { ownerId, workspaceId } = caller(request);
    return { data: await this.projects.create(ownerId, workspaceId, body ?? {}) };
  }

  @Get(':projectId')
  async get(@Req() request: Request, @Param('projectId') projectId: string) {
    return { data: await this.projects.get(caller(request).ownerId, projectId) };
  }

  @Patch(':projectId')
  async update(
    @Req() request: Request,
    @Param('projectId') projectId: string,
    @Body() body: ProjectInput,
  ) {
    return {
      data: await this.projects.update(caller(request).ownerId, projectId, body ?? {}),
    };
  }

  @Delete(':projectId')
  async remove(@Req() request: Request, @Param('projectId') projectId: string) {
    return { data: await this.projects.remove(caller(request).ownerId, projectId) };
  }

  @Get(':projectId/sessions')
  async sessions(@Req() request: Request, @Param('projectId') projectId: string) {
    return { data: await this.projects.sessions(caller(request).ownerId, projectId) };
  }
}

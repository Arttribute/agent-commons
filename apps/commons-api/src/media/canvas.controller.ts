import { Body, Controller, Get, Param, Patch, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { RateLimit, resolveCallerId, type ApiKeyPrincipal } from '~/modules/auth';
import { CanvasService } from './canvas.service';
import { MediaService } from './media.service';
import type { CreateMediaGenerationInput, MediaPrincipal } from './media.types';

@Controller({ version: '1', path: 'canvas' })
export class CanvasController {
  constructor(
    private readonly canvas: CanvasService,
    private readonly media: MediaService,
  ) {}

  @Get('models')
  models() {
    return this.media.catalog();
  }

  @Post('projects/open')
  open(@Req() request: Request, @Body() body: { artifactId: string }) {
    return this.canvas.openArtifact(body.artifactId, requester(request));
  }

  @Get('projects/:projectId')
  get(@Req() request: Request, @Param('projectId') projectId: string) {
    return this.canvas.getProject(projectId, requester(request));
  }

  @Patch('projects/:projectId')
  update(
    @Req() request: Request,
    @Param('projectId') projectId: string,
    @Body()
    body: {
      name?: string;
      description?: string;
      activeRevisionId?: string;
      settings?: Record<string, unknown>;
    },
  ) {
    return this.canvas.updateProject(projectId, requester(request), body);
  }

  @Post('projects/:projectId/annotations')
  annotation(
    @Req() request: Request,
    @Param('projectId') projectId: string,
    @Body() body: Parameters<CanvasService['createAnnotation']>[2],
  ) {
    return this.canvas.createAnnotation(projectId, requester(request), body);
  }

  @Post('projects/:projectId/assets')
  addAsset(
    @Req() request: Request,
    @Param('projectId') projectId: string,
    @Body() body: { itemId: string },
  ) {
    return this.canvas.addAsset(projectId, requester(request), body.itemId);
  }

  @Post('projects/:projectId/timeline/actions')
  editTimeline(
    @Req() request: Request,
    @Param('projectId') projectId: string,
    @Body() body: Parameters<CanvasService['editTimeline']>[2],
  ) {
    return this.canvas.editTimeline(projectId, requester(request), body);
  }

  @Patch('projects/:projectId/annotations/:annotationId')
  updateAnnotation(
    @Req() request: Request,
    @Param('projectId') projectId: string,
    @Param('annotationId') annotationId: string,
    @Body() body: Parameters<CanvasService['updateAnnotation']>[3],
  ) {
    return this.canvas.updateAnnotation(
      projectId,
      annotationId,
      requester(request),
      body,
    );
  }

  @Post('generations')
  @RateLimit({ limit: 20, windowMs: 60_000, keyStrategy: 'user' })
  generate(@Req() request: Request, @Body() body: CreateMediaGenerationInput) {
    return this.media.createGeneration(body, requester(request));
  }

  @Post('quote')
  quote(@Req() request: Request, @Body() body: CreateMediaGenerationInput) {
    return this.media.quote(body, requester(request));
  }

  @Get('generations/:jobId')
  getGeneration(@Req() request: Request, @Param('jobId') jobId: string) {
    return this.media.getGeneration(jobId, requester(request));
  }
}

function requester(request: Request): MediaPrincipal {
  const principal = (request as any).principal as ApiKeyPrincipal | undefined;
  const principalId = resolveCallerId(request);
  if (!principalId) throw new Error('Authenticated principal required');
  return {
    principalId,
    principalType: principal?.principalType ?? 'user',
    workspaceId: principal?.workspaceId ?? null,
  };
}

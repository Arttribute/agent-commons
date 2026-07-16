import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { OwnerGuard, OwnerOnly, Public, RateLimit } from '~/modules/auth';
import { CodeProjectService } from './code-project.service';
import type {
  BrowserCheckAction,
  CodeProjectFileInput,
} from './code-project.types';

@Controller({ version: '1', path: 'agents/:agentId/projects' })
@UseGuards(OwnerGuard)
@OwnerOnly({ table: 'agent', idParam: 'agentId' })
export class CodeProjectController {
  constructor(private readonly projects: CodeProjectService) {}

  @Get()
  async list(@Param('agentId') agentId: string) {
    return { data: await this.projects.list(agentId) };
  }

  @Post()
  @RateLimit({ limit: 20, windowMs: 60_000, keyStrategy: 'user' })
  async create(
    @Param('agentId') agentId: string,
    @Body()
    body: {
      name: string;
      description?: string;
      sessionId?: string;
      files?: CodeProjectFileInput[];
    },
  ) {
    return {
      data: await this.projects.create({ agentId, ...body }),
    };
  }

  @Get(':projectId')
  async get(
    @Param('agentId') agentId: string,
    @Param('projectId') projectId: string,
  ) {
    return { data: await this.projects.get(agentId, projectId) };
  }

  @Put(':projectId/files')
  @RateLimit({ limit: 60, windowMs: 60_000, keyStrategy: 'user' })
  async writeFiles(
    @Param('agentId') agentId: string,
    @Param('projectId') projectId: string,
    @Body() body: { files: CodeProjectFileInput[]; replace?: boolean },
  ) {
    return {
      data: await this.projects.writeFiles({
        agentId,
        projectId,
        files: body.files,
        replace: body.replace,
      }),
    };
  }

  @Post(':projectId/publish')
  @RateLimit({ limit: 15, windowMs: 60_000, keyStrategy: 'user' })
  async publish(
    @Param('agentId') agentId: string,
    @Param('projectId') projectId: string,
  ) {
    return {
      data: await this.projects.publish({ agentId, projectId }),
    };
  }

  @Post(':projectId/verify')
  @RateLimit({ limit: 15, windowMs: 60_000, keyStrategy: 'user' })
  async verify(
    @Param('agentId') agentId: string,
    @Param('projectId') projectId: string,
    @Body() body: { actions?: BrowserCheckAction[] } = {},
  ) {
    return {
      data: await this.projects.verify({
        agentId,
        projectId,
        actions: body.actions,
      }),
    };
  }

  @Post(':projectId/export')
  @RateLimit({ limit: 10, windowMs: 60_000, keyStrategy: 'user' })
  async exportToComputer(
    @Param('agentId') agentId: string,
    @Param('projectId') projectId: string,
    @Body() body: { directory?: string; sessionId?: string } = {},
  ) {
    return {
      data: await this.projects.exportToComputer({
        agentId,
        projectId,
        ...body,
      }),
    };
  }

  @Post(':projectId/github')
  @RateLimit({ limit: 5, windowMs: 60_000, keyStrategy: 'user' })
  async exportToGitHub(
    @Param('agentId') agentId: string,
    @Param('projectId') projectId: string,
    @Body() body: { repositoryName?: string; private?: boolean } = {},
  ) {
    return { data: await this.projects.exportToGitHub({ agentId, projectId, ...body }) };
  }
}

@Public()
@Controller({ version: '1', path: 'previews' })
export class PublicCodeProjectController {
  constructor(private readonly projects: CodeProjectService) {}

  @Get(':slug')
  async index(
    @Param('slug') slug: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    if (!req.originalUrl.split('?')[0].endsWith('/')) {
      const query = req.originalUrl.includes('?')
        ? req.originalUrl.slice(req.originalUrl.indexOf('?'))
        : '';
      return res.redirect(308, `${req.originalUrl.split('?')[0]}/${query}`);
    }
    return this.serve(slug, undefined, req, res);
  }

  @Get(':slug/*path')
  async asset(
    @Param('slug') slug: string,
    @Param('path') path: string | string[],
    @Req() req: Request,
    @Res() res: Response,
  ) {
    return this.serve(
      slug,
      Array.isArray(path) ? path.join('/') : path,
      req,
      res,
    );
  }

  private async serve(
    slug: string,
    path: string | undefined,
    _req: Request,
    res: Response,
  ) {
    const asset = await this.projects.publicAsset(slug, path);
    res.removeHeader('X-Frame-Options');
    res.removeHeader('Cross-Origin-Opener-Policy');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Content-Type', asset.contentType);
    res.setHeader('Cache-Control', asset.cacheControl);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader(
      'Content-Security-Policy',
      [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline' https://esm.sh",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "font-src 'self' data: https://fonts.gstatic.com",
        "img-src 'self' data: blob: https:",
        "connect-src 'self' https://esm.sh",
        'frame-ancestors *',
        "base-uri 'none'",
        "object-src 'none'",
      ].join('; '),
    );
    res.status(200).send(asset.bytes);
  }
}

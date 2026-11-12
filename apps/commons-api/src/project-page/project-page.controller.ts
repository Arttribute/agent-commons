import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  Res,
  UnauthorizedException,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request, Response } from 'express';
import { COMMONS_PAGE_RUNTIME } from './page-runtime';
import {
  Public,
  RateLimit,
  resolveCallerId,
  type ApiKeyPrincipal,
} from '~/modules/auth';
import { ProjectPageService } from './project-page.service';
import { PublicPageChatService } from './public-page-chat.service';
import type { CreatePageInput, PageInput } from './page-input';
import type { CodeProjectFileInput } from '~/code-project/code-project.types';
function owner(req: Request) {
  const id = resolveCallerId(req);
  const principal = (req as any).principal as ApiKeyPrincipal | undefined;
  if (!id || principal?.principalType === 'agent')
    throw new UnauthorizedException('A signed-in user is required');
  return id;
}
@Controller({ version: '1', path: 'projects/:projectId/pages' })
export class ProjectPageController {
  constructor(private readonly pages: ProjectPageService) {}
  @Get() list(@Req() req: Request, @Param('projectId') id: string) {
    return this.pages.list(owner(req), id).then((data) => ({ data }));
  }
  @Post()
  @RateLimit({ limit: 10, windowMs: 60000, keyStrategy: 'user' })
  create(
    @Req() req: Request,
    @Param('projectId') id: string,
    @Body() body: CreatePageInput,
  ) {
    return this.pages
      .create(owner(req), id, body ?? {})
      .then((data) => ({ data }));
  }
  @Get(':pageId') get(
    @Req() req: Request,
    @Param('projectId') id: string,
    @Param('pageId') pageId: string,
  ) {
    return this.pages.get(owner(req), id, pageId).then((data) => ({ data }));
  }
  @Patch(':pageId') update(
    @Req() req: Request,
    @Param('projectId') id: string,
    @Param('pageId') pageId: string,
    @Body() body: PageInput,
  ) {
    return this.pages
      .update(owner(req), id, pageId, body)
      .then((data) => ({ data }));
  }
  @Put(':pageId/files') write(
    @Req() req: Request,
    @Param('projectId') id: string,
    @Param('pageId') pageId: string,
    @Body() body: { files: CodeProjectFileInput[] },
  ) {
    return this.pages
      .writeFiles(owner(req), id, pageId, body?.files)
      .then((data) => ({ data }));
  }
  @Post(':pageId/import')
  @RateLimit({ limit: 5, windowMs: 60000, keyStrategy: 'user' })
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 8000000, files: 1 } }),
  )
  import(
    @Req() req: Request,
    @Param('projectId') id: string,
    @Param('pageId') pageId: string,
    @UploadedFile() file: { buffer: Buffer },
  ) {
    if (!file?.buffer)
      throw new BadRequestException('Choose a ZIP of your built website');
    return this.pages
      .import(owner(req), id, pageId, file.buffer)
      .then((data) => ({ data }));
  }
  @Post(':pageId/preview')
  @RateLimit({ limit: 10, windowMs: 60000, keyStrategy: 'user' })
  preview(
    @Req() req: Request,
    @Param('projectId') id: string,
    @Param('pageId') pageId: string,
  ) {
    return this.pages
      .preview(owner(req), id, pageId)
      .then((data) => ({ data }));
  }
  @Post(':pageId/publish')
  @RateLimit({ limit: 10, windowMs: 60000, keyStrategy: 'user' })
  publish(
    @Req() req: Request,
    @Param('projectId') id: string,
    @Param('pageId') pageId: string,
  ) {
    return this.pages
      .publish(owner(req), id, pageId)
      .then((data) => ({ data }));
  }
  @Post(':pageId/unpublish') unpublish(
    @Req() req: Request,
    @Param('projectId') id: string,
    @Param('pageId') pageId: string,
  ) {
    return this.pages
      .unpublish(owner(req), id, pageId)
      .then((data) => ({ data }));
  }
  @Delete(':pageId') remove(
    @Req() req: Request,
    @Param('projectId') id: string,
    @Param('pageId') pageId: string,
  ) {
    return this.pages
      .unpublish(owner(req), id, pageId, true)
      .then((data) => ({ data }));
  }
}
@Controller({ version: '1', path: 'project-pages' })
export class ProjectPagesController {
  constructor(private readonly pages: ProjectPageService, private readonly chat: PublicPageChatService) {}
  @Get() list(@Req() req: Request, @Query('surface') surface?: string) {
    return this.pages
      .list(owner(req), undefined, surface)
      .then((data) => ({ data }));
  }
  @Public()
  @Get(':slug')
  @Header('Cache-Control', 'no-store')
  @RateLimit({ limit: 90, windowMs: 60000, keyStrategy: 'ip' })
  publicPage(@Param('slug') slug: string) {
    return this.pages.publicPage(slug).then((data) => ({ data }));
  }
  @Public()
  @Post(':slug/chat')
  @Header('Cache-Control', 'no-store')
  @RateLimit({ limit: 8, windowMs: 60000, keyStrategy: 'ip' })
  publicChat(@Param('slug') slug: string, @Body() body: unknown) {
    return this.chat.answer(slug, body).then((data) => ({ data }));
  }
}

@Public()
@Controller({ version: '1', path: 'project-page-sdk.js' })
export class ProjectPageSdkController {
  @Get() script(@Res() response: Response) {
    response.setHeader('Content-Type', 'text/javascript; charset=utf-8');
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader('Cache-Control', 'public, max-age=3600');
    return response.send(COMMONS_PAGE_RUNTIME);
  }
}

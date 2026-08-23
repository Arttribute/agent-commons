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
  BrowserCheckCapability,
  BrowserCheckSurface,
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
    @Body()
    body: {
      actions?: BrowserCheckAction[];
      surfaces?: BrowserCheckSurface[];
      capabilities?: BrowserCheckCapability[];
    } = {},
  ) {
    return {
      data: await this.projects.verify({
        agentId,
        projectId,
        actions: body.actions,
        surfaces: body.surfaces,
        capabilities: body.capabilities,
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
    return {
      data: await this.projects.exportToGitHub({ agentId, projectId, ...body }),
    };
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

  @Get(':slug/deployments/:deploymentId')
  async deploymentIndex(
    @Param('slug') slug: string,
    @Param('deploymentId') deploymentId: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    if (!req.originalUrl.split('?')[0].endsWith('/')) {
      const query = req.originalUrl.includes('?')
        ? req.originalUrl.slice(req.originalUrl.indexOf('?'))
        : '';
      return res.redirect(308, `${req.originalUrl.split('?')[0]}/${query}`);
    }
    return this.serve(slug, undefined, req, res, deploymentId);
  }

  @Get(':slug/deployments/:deploymentId/*path')
  async deploymentAsset(
    @Param('slug') slug: string,
    @Param('deploymentId') deploymentId: string,
    @Param('path') path: string | string[],
    @Req() req: Request,
    @Res() res: Response,
  ) {
    return this.serve(
      slug,
      Array.isArray(path) ? path.join('/') : path,
      req,
      res,
      deploymentId,
    );
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
    deploymentId?: string,
  ) {
    const asset = await this.projects.publicAsset(slug, path, deploymentId);
    res.removeHeader('X-Frame-Options');
    res.removeHeader('Cross-Origin-Opener-Policy');
    res.removeHeader('Access-Control-Allow-Credentials');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Content-Type', asset.contentType);
    res.setHeader('Cache-Control', asset.cacheControl);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader(
      'Content-Security-Policy',
      previewContentSecurityPolicy(asset),
    );
    res.status(200).send(asset.bytes);
  }
}

@Public()
@Controller({ version: '1', path: 'ui-plugin-host' })
export class PublicUiPluginHostController {
  @Get()
  host(@Req() req: Request, @Res() res: Response) {
    const entry = singleQueryValue(req.query.entry);
    const parentOrigin = singleQueryValue(req.query.commonsHostOrigin);
    const surface = singleQueryValue(req.query.commonsSurface) === 'widget'
      ? 'widget'
      : 'page';
    const theme = singleQueryValue(req.query.commonsTheme) === 'dark'
      ? 'dark'
      : 'light';
    const entryUrl = safeImmutablePreviewUrl(entry);
    if (!entryUrl || !isAllowedPluginParent(parentOrigin)) {
      return res.status(400).type('text/plain').send('Invalid plugin host request');
    }
    const allowedParentOrigin = parentOrigin!;
    entryUrl.searchParams.set('commonsSurface', surface);
    entryUrl.searchParams.set('commonsTheme', theme);
    entryUrl.searchParams.set('commonsHostOrigin', entryUrl.origin);

    res.removeHeader('X-Frame-Options');
    res.removeHeader('Cross-Origin-Opener-Policy');
    res.removeHeader('Access-Control-Allow-Credentials');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader(
      'Content-Security-Policy',
      [
        "default-src 'none'",
        "script-src 'unsafe-inline'",
        "style-src 'unsafe-inline'",
        `frame-src ${entryUrl.origin}`,
        `frame-ancestors ${pluginFrameAncestors(false)}`,
        "connect-src 'none'",
        "img-src 'none'",
        "font-src 'none'",
        "form-action 'none'",
        "base-uri 'none'",
        "object-src 'none'",
      ].join('; '),
    );
    return res
      .status(200)
      .type('text/html; charset=utf-8')
      .send(renderPluginHost(entryUrl.toString(), allowedParentOrigin, surface));
  }
}

function previewContentSecurityPolicy(asset: {
  bytes: Buffer;
  contentType: string;
}) {
  const runtimeV2 =
    asset.contentType.startsWith('text/html') &&
    asset.bytes
      .subarray(0, Math.min(asset.bytes.length, 16_384))
      .toString('utf8')
      .includes('name="agent-commons-runtime" content="2"');
  const common = [
    `frame-ancestors ${pluginFrameAncestors(true)}`,
    "form-action 'none'",
    "base-uri 'none'",
    "object-src 'none'",
  ];
  if (!runtimeV2 && asset.contentType.startsWith('text/html')) {
    return [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' https://esm.sh",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' data: https://fonts.gstatic.com",
      "img-src 'self' data: blob:",
      "connect-src https://esm.sh",
      "frame-src 'none'",
      ...common,
    ].join('; ');
  }
  return [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self' data:",
    "img-src 'self' data: blob:",
    "connect-src 'none'",
    "frame-src 'none'",
    ...common,
  ].join('; ');
}

function pluginFrameAncestors(includeSelf: boolean) {
  const configured = pluginParentOrigins();
  const sources = [
    ...(includeSelf ? ["'self'"] : []),
    ...configured,
  ];
  return sources.length
    ? [...new Set(sources)].join(' ')
    : "'none'";
}

function pluginParentOrigins() {
  const raw =
    process.env.PLUGIN_FRAME_ANCESTORS ||
    [process.env.APP_ORIGIN, process.env.CORS_ORIGIN]
      .filter(Boolean)
      .join(',');
  const configured = raw
    .split(/[\s,]+/)
    .map((value) => value.trim())
    .filter(Boolean)
    .flatMap((value) => {
      try {
        const url = new URL(value);
        return ['http:', 'https:'].includes(url.protocol) ? [url.origin] : [];
      } catch {
        return [];
      }
    });
  if (configured.length) return [...new Set(configured)];
  return ['http://localhost:*', 'http://127.0.0.1:*'];
}

function isAllowedPluginParent(value: string | undefined) {
  if (!value) return false;
  let origin: string;
  try {
    origin = new URL(value).origin;
  } catch {
    return false;
  }
  if (/^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/.test(origin)) {
    return true;
  }
  return pluginParentOrigins().includes(origin);
}

function safeImmutablePreviewUrl(value: string | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      !/\/v1\/previews\/[^/]+\/deployments\/[0-9a-f-]+\/?$/i.test(
        url.pathname,
      )
    ) {
      return null;
    }
    url.search = '';
    url.hash = '';
    return url;
  } catch {
    return null;
  }
}

function singleQueryValue(value: unknown) {
  return typeof value === 'string' ? value : undefined;
}

function renderPluginHost(
  entryUrl: string,
  parentOrigin: string,
  surface: 'page' | 'widget',
) {
  const config = JSON.stringify({ entryUrl, parentOrigin }).replace(
    /</g,
    '\\u003c',
  );
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Agent Commons app sandbox</title>
    <style>
      * { box-sizing: border-box; }
      html, body, #app { width: 100%; height: 100%; margin: 0; overflow: hidden; }
      #app { display: block; border: 0; background: transparent; }
    </style>
  </head>
  <body>
    <iframe id="app" title="Sandboxed Agent Commons app" sandbox="allow-scripts" referrerpolicy="no-referrer" scrolling="${surface === 'widget' ? 'no' : 'auto'}"></iframe>
    <script>
      (() => {
        const config = ${config};
        const frame = document.getElementById('app');
        window.addEventListener('message', (event) => {
          if (!event.data || typeof event.data !== 'object') return;
          if (event.source === window.parent && event.origin === config.parentOrigin) {
            frame.contentWindow?.postMessage(event.data, '*');
            return;
          }
          if (event.source === frame.contentWindow && event.origin === 'null') {
            window.parent.postMessage(event.data, config.parentOrigin);
          }
        });
        frame.src = config.entryUrl;
      })();
    </script>
  </body>
</html>`;
}

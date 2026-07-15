import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { and, desc, eq, notInArray, sql } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import * as schema from '#/models/schema';
import { agentRunProgress } from '~/agent/run-progress';
import { ComputerService } from '~/computer';
import { DatabaseService } from '~/modules/database/database.service';
import { CodeProjectBuilder } from './code-project.builder';
import { CodeProjectStorage } from './code-project.storage';
import type {
  BrowserCheckAction,
  CodeProjectFileInput,
} from './code-project.types';
import { CodeProjectVerifier } from './code-project.verifier';
import { OAuthTokenInjectionService } from '~/oauth/oauth-token-injection.service';

const MAX_FILES = 80;
const MAX_FILE_BYTES = 250_000;
const MAX_PROJECT_BYTES = 1_500_000;

@Injectable()
export class CodeProjectService {
  constructor(
    private readonly db: DatabaseService,
    private readonly builder: CodeProjectBuilder,
    private readonly storage: CodeProjectStorage,
    private readonly verifier: CodeProjectVerifier,
    private readonly computers: ComputerService,
    private readonly oauthTokens: OAuthTokenInjectionService,
  ) {}

  async create(args: {
    agentId: string;
    sessionId?: string;
    name: string;
    description?: string;
    files?: CodeProjectFileInput[];
    runId?: string;
    toolCallId?: string;
  }) {
    const agent = await this.assertAgent(args.agentId);
    const name = args.name.trim().slice(0, 100);
    if (!name) throw new BadRequestException('name is required');
    const projectId = uuidv4();
    const slug = `${slugify(name)}-${projectId.slice(0, 8)}`;
    const ownerUserId = agent.ownerUserId ?? agent.owner;
    if (!ownerUserId) throw new BadRequestException('A verified project owner is required');
    const [libraryItem] = await this.db.insert(schema.libraryItem).values({
      ownerUserId,
      workspaceId: agent.workspaceId,
      sourceAgentId: args.agentId,
      sourceSessionId: args.sessionId,
      kind: 'app',
      name,
      description: args.description?.trim().slice(0, 1_000),
      mimeType: 'application/vnd.agent-commons.nextjs-project',
      sizeBytes: 0,
      sha256: checksum(projectId),
      source: 'code_project',
      metadata: { projectId, framework: 'nextjs' },
    }).returning();
    const [project] = await this.db
      .insert(schema.codeProject)
      .values({
        projectId,
        agentId: args.agentId,
        sessionId: args.sessionId,
        ownerUserId,
        workspaceId: agent.workspaceId,
        name,
        slug,
        description: args.description?.trim().slice(0, 1_000),
        framework: 'nextjs',
        entryFile: 'app/page.tsx',
        libraryItemId: libraryItem.itemId,
      })
      .returning();
    await this.db.insert(schema.libraryLink).values([
      { itemId: libraryItem.itemId, scopeType: 'code_project', scopeId: projectId },
      ...(args.sessionId ? [{ itemId: libraryItem.itemId, scopeType: 'session', scopeId: args.sessionId }] : []),
    ]);

    const files = args.files?.length ? args.files : starterFiles(name);
    await this.writeFiles({
      agentId: args.agentId,
      projectId,
      files,
      replace: true,
      runId: args.runId,
      toolCallId: args.toolCallId,
    });
    return this.get(args.agentId, project.projectId);
  }

  async list(agentId: string) {
    await this.assertAgent(agentId);
    const projects = await this.db.query.codeProject.findMany({
      where: (table) => eq(table.agentId, agentId),
      orderBy: (table) => desc(table.updatedAt),
    });
    return Promise.all(
      projects.map((project) => this.toPublicProject(project)),
    );
  }

  async exportToGitHub(args: {
    agentId: string;
    projectId: string;
    repositoryName?: string;
    private?: boolean;
  }) {
    const project = await this.assertProject(args.agentId, args.projectId);
    const ownerId = project.ownerUserId;
    if (!ownerId) throw new BadRequestException('Project owner is required');
    const connection = await this.oauthTokens.resolveOAuthConnection({
      providerKey: 'github',
      sessionInitiator: ownerId,
      agentOwnerId: ownerId,
    });
    if (!connection) {
      throw new BadRequestException('Connect GitHub before exporting this app');
    }
    const token = await this.oauthTokens.getFreshAccessToken(connection.connectionId);
    const headers = {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'Agent-Commons',
      'Content-Type': 'application/json',
    };
    let fullName: string;
    let repositoryUrl = project.repositoryUrl;
    if (!repositoryUrl) {
      const repositoryName = slugify(args.repositoryName || project.name).slice(0, 100);
      const created = await fetch('https://api.github.com/user/repos', {
        method: 'POST', headers,
        body: JSON.stringify({ name: repositoryName, private: args.private !== false, description: project.description || `Next.js app created with Agent Commons`, auto_init: false }),
      });
      const payload = await created.json() as any;
      if (!created.ok) throw new BadRequestException(payload?.message || 'GitHub repository creation failed');
      fullName = payload.full_name;
      repositoryUrl = payload.html_url;
    } else {
      const parsed = new URL(repositoryUrl);
      fullName = parsed.pathname.replace(/^\/+|\/+$/g, '').replace(/\.git$/, '');
    }
    const files = await this.db.query.codeProjectFile.findMany({ where: (table) => eq(table.projectId, args.projectId) });
    for (const file of files) {
      const endpoint = `https://api.github.com/repos/${fullName}/contents/${file.path.split('/').map(encodeURIComponent).join('/')}`;
      const existing = await fetch(endpoint, { headers }).then(async (response) => response.ok ? response.json() as Promise<any> : null);
      const response = await fetch(endpoint, { method: 'PUT', headers, body: JSON.stringify({ message: `Update ${file.path} from Agent Commons`, content: Buffer.from(file.content).toString('base64'), sha: existing?.sha }) });
      if (!response.ok) { const payload = await response.json() as any; throw new BadRequestException(payload?.message || `Could not push ${file.path}`); }
    }
    await this.db.update(schema.codeProject).set({ repositoryUrl, updatedAt: new Date() }).where(eq(schema.codeProject.projectId, args.projectId));
    return { repositoryUrl, repository: fullName, files: files.length };
  }

  async get(agentId: string, projectId: string) {
    const project = await this.assertProject(agentId, projectId);
    const [files, deployments] = await Promise.all([
      this.db.query.codeProjectFile.findMany({
        where: (table) => eq(table.projectId, projectId),
        orderBy: (table) => table.path,
      }),
      this.db.query.codeProjectDeployment.findMany({
        where: (table) => eq(table.projectId, projectId),
        orderBy: (table) => desc(table.createdAt),
        limit: 10,
      }),
    ]);
    return {
      ...(await this.toPublicProject(project)),
      files,
      deployments,
    };
  }

  async writeFiles(args: {
    agentId: string;
    projectId: string;
    files: CodeProjectFileInput[];
    replace?: boolean;
    runId?: string;
    toolCallId?: string;
  }) {
    await this.assertProject(args.agentId, args.projectId);
    const files = validateFiles(args.files);
    const current = await this.db.query.codeProjectFile.findMany({
      where: (table) => eq(table.projectId, args.projectId),
    });
    const merged = new Map(current.map((file) => [file.path, file.content]));
    if (args.replace) merged.clear();
    for (const file of files) merged.set(file.path, file.content);
    validateFiles(
      [...merged.entries()].map(([path, content]) => ({ path, content })),
    );

    this.emit(
      args.runId,
      'running',
      'Writing project files',
      {
        projectId: args.projectId,
        toolCallId: args.toolCallId,
        files: files.map((file) => ({
          path: file.path,
          content: file.content,
        })),
      },
      'writeCodeProjectFiles',
    );

    await this.db.transaction(async (tx) => {
      for (const file of files) {
        const sizeBytes = Buffer.byteLength(file.content);
        await tx
          .insert(schema.codeProjectFile)
          .values({
            projectId: args.projectId,
            path: file.path,
            content: file.content,
            mimeType: mimeTypeFor(file.path),
            sizeBytes,
            checksum: checksum(file.content),
          })
          .onConflictDoUpdate({
            target: [
              schema.codeProjectFile.projectId,
              schema.codeProjectFile.path,
            ],
            set: {
              content: file.content,
              mimeType: mimeTypeFor(file.path),
              sizeBytes,
              checksum: checksum(file.content),
              version: sql`${schema.codeProjectFile.version} + 1`,
              updatedAt: new Date(),
            },
          });
      }
      if (args.replace && files.length > 0) {
        await tx.delete(schema.codeProjectFile).where(
          and(
            eq(schema.codeProjectFile.projectId, args.projectId),
            notInArray(
              schema.codeProjectFile.path,
              files.map((file) => file.path),
            ),
          ),
        );
      }
      await tx
        .update(schema.codeProject)
        .set({ status: 'draft', updatedAt: new Date() })
        .where(eq(schema.codeProject.projectId, args.projectId));
      const project = await tx.query.codeProject.findFirst({
        where: (table) => eq(table.projectId, args.projectId),
      });
      if (project?.libraryItemId) {
        const contents = [...merged.values()].join('\n');
        await tx.update(schema.libraryItem).set({
          sizeBytes: Buffer.byteLength(contents),
          sha256: checksum(contents),
          textPreview: contents.slice(0, 2_000),
          extractedTextChars: contents.length,
          updatedAt: new Date(),
        }).where(eq(schema.libraryItem.itemId, project.libraryItemId));
      }
    });

    this.emit(
      args.runId,
      'completed',
      'Project files updated',
      {
        projectId: args.projectId,
        toolCallId: args.toolCallId,
        paths: files.map((file) => file.path),
      },
      'writeCodeProjectFiles',
    );
    return this.get(args.agentId, args.projectId);
  }

  async publish(args: {
    agentId: string;
    projectId: string;
    runId?: string;
    toolCallId?: string;
  }) {
    const project = await this.assertProject(args.agentId, args.projectId);
    const files = await this.db.query.codeProjectFile.findMany({
      where: (table) => eq(table.projectId, args.projectId),
    });
    const [deployment] = await this.db
      .insert(schema.codeProjectDeployment)
      .values({ projectId: args.projectId, status: 'building' })
      .returning();
    await this.db
      .update(schema.codeProject)
      .set({ status: 'building', updatedAt: new Date() })
      .where(eq(schema.codeProject.projectId, args.projectId));
    this.emit(
      args.runId,
      'running',
      'Building public prototype',
      {
        projectId: args.projectId,
        deploymentId: deployment.deploymentId,
        toolCallId: args.toolCallId,
      },
      'publishCodeProject',
    );

    try {
      const built = await this.builder.build({
        name: project.name,
        entryFile: project.entryFile,
        files: files.map((file) => ({
          path: file.path,
          content: file.content,
        })),
      });
      const storagePrefix = this.storage.deploymentPrefix(
        args.projectId,
        deployment.deploymentId,
      );
      await this.storage.publish(storagePrefix, built.assets);
      const publicUrl = this.publicUrl(project.slug);
      await this.db.transaction(async (tx) => {
        await tx
          .update(schema.codeProjectDeployment)
          .set({
            status: 'ready',
            storagePrefix,
            publicUrl,
            buildErrors: built.warnings,
            publishedAt: new Date(),
          })
          .where(
            eq(
              schema.codeProjectDeployment.deploymentId,
              deployment.deploymentId,
            ),
          );
        await tx
          .update(schema.codeProject)
          .set({
            status: 'ready',
            visibility: 'public',
            latestDeploymentId: deployment.deploymentId,
            updatedAt: new Date(),
          })
          .where(eq(schema.codeProject.projectId, args.projectId));
      });
      this.emit(
        args.runId,
        'completed',
        'Public prototype is live',
        {
          projectId: args.projectId,
          deploymentId: deployment.deploymentId,
          publicUrl,
          bytes: built.bytes,
          toolCallId: args.toolCallId,
        },
        'publishCodeProject',
      );
      return {
        projectId: args.projectId,
        deploymentId: deployment.deploymentId,
        status: 'ready',
        publicUrl,
        bytes: built.bytes,
        warnings: built.warnings,
      };
    } catch (error: any) {
      const errors = buildErrorsFrom(error);
      await this.db.transaction(async (tx) => {
        await tx
          .update(schema.codeProjectDeployment)
          .set({ status: 'failed', buildErrors: errors })
          .where(
            eq(
              schema.codeProjectDeployment.deploymentId,
              deployment.deploymentId,
            ),
          );
        await tx
          .update(schema.codeProject)
          .set({ status: 'failed', updatedAt: new Date() })
          .where(eq(schema.codeProject.projectId, args.projectId));
      });
      this.emit(
        args.runId,
        'failed',
        'Prototype build failed',
        {
          projectId: args.projectId,
          deploymentId: deployment.deploymentId,
          errors,
          toolCallId: args.toolCallId,
        },
        'publishCodeProject',
      );
      throw error;
    }
  }

  async verify(args: {
    agentId: string;
    projectId: string;
    actions?: BrowserCheckAction[];
    runId?: string;
    toolCallId?: string;
  }) {
    const project = await this.assertProject(args.agentId, args.projectId);
    if (!project.latestDeploymentId) {
      throw new BadRequestException('Publish the project before testing it');
    }
    const deployment = await this.db.query.codeProjectDeployment.findFirst({
      where: (table) =>
        eq(table.deploymentId, project.latestDeploymentId as string),
    });
    if (!deployment?.publicUrl || !deployment.storagePrefix) {
      throw new BadRequestException('The latest deployment is not ready');
    }
    this.emit(
      args.runId,
      'running',
      'Testing prototype in a real browser',
      {
        projectId: args.projectId,
        publicUrl: deployment.publicUrl,
        toolCallId: args.toolCallId,
      },
      'testCodeProject',
    );
    const result = await this.verifier.verify(
      deployment.publicUrl,
      args.actions ?? [],
    );
    let screenshotUrl: string | undefined;
    if (result.screenshot) {
      await this.storage.put(deployment.storagePrefix, {
        path: 'verification.png',
        content: result.screenshot,
        contentType: 'image/png',
        cacheControl: 'no-cache',
      });
      screenshotUrl = `${deployment.publicUrl.replace(/\/$/, '')}/verification.png`;
    }
    const verification = { ...result, screenshot: undefined, screenshotUrl };
    await this.db
      .update(schema.codeProjectDeployment)
      .set({ verification })
      .where(
        eq(schema.codeProjectDeployment.deploymentId, deployment.deploymentId),
      );
    this.emit(
      args.runId,
      result.passed ? 'completed' : 'failed',
      result.passed ? 'Browser checks passed' : 'Browser checks found issues',
      {
        projectId: args.projectId,
        publicUrl: deployment.publicUrl,
        verification,
        toolCallId: args.toolCallId,
      },
      'testCodeProject',
    );
    return verification;
  }

  async exportToComputer(args: {
    agentId: string;
    projectId: string;
    directory?: string;
    sessionId?: string;
    runId?: string;
    toolCallId?: string;
  }) {
    const project = await this.get(args.agentId, args.projectId);
    const computer = await this.computers.startComputer({
      agentId: args.agentId,
      sessionId: args.sessionId,
      reason: `Continue coding ${project.name}`,
      actorId: args.agentId,
      actorType: 'agent',
      runId: args.runId,
      toolCallId: args.toolCallId,
    });
    const directory = normalizeDirectory(
      args.directory || `projects/${slugify(project.name)}`,
    );
    const filePayload = project.files.map((file: any) => ({
      path: `${directory}/${file.path}`,
      content: file.content,
    }));
    const response = await this.computers.sendInstruction({
      agentId: args.agentId,
      computerId: computer.computerId,
      sessionId: args.sessionId,
      eventType: 'workspace.write',
      summary: `Export ${filePayload.length} project files to ${directory}`,
      instruction: [
        'Use cli_write_file to write every file below exactly as provided.',
        'Create parent directories as needed. Do not abbreviate or replace content.',
        'After writing, use cli_list_directory to verify the project directory and report all paths.',
        '',
        JSON.stringify(filePayload),
      ].join('\n'),
      waitMs: 300_000,
      actorId: args.agentId,
      actorType: 'agent',
      runId: args.runId,
      toolCallId: args.toolCallId,
    });
    return {
      projectId: args.projectId,
      computerId: computer.computerId,
      directory: `/mnt/shared/${directory}`,
      files: filePayload.map((file: any) => file.path),
      response,
    };
  }

  async publicAsset(slug: string, requestedPath?: string) {
    const project = await this.db.query.codeProject.findFirst({
      where: (table) =>
        and(eq(table.slug, slug), eq(table.visibility, 'public')),
    });
    if (!project?.latestDeploymentId) throw new NotFoundException();
    const deployment = await this.db.query.codeProjectDeployment.findFirst({
      where: (table) =>
        and(
          eq(table.deploymentId, project.latestDeploymentId as string),
          eq(table.status, 'ready'),
        ),
    });
    if (!deployment?.storagePrefix) throw new NotFoundException();
    const path = normalizePublicPath(requestedPath);
    const asset = await this.storage
      .get(deployment.storagePrefix, path)
      .catch(() => null);
    if (asset) return asset;
    if (!posixHasExtension(path)) {
      const fallback = await this.storage.get(
        deployment.storagePrefix,
        'index.html',
      );
      if (fallback) return fallback;
    }
    throw new NotFoundException();
  }

  private async toPublicProject(
    project: typeof schema.codeProject.$inferSelect,
  ) {
    return {
      ...project,
      publicUrl:
        project.visibility === 'public' ? this.publicUrl(project.slug) : null,
    };
  }

  private publicUrl(slug: string) {
    const explicit = process.env.PROTOTYPE_PUBLIC_BASE_URL?.replace(/\/$/, '');
    if (explicit) return `${explicit}/${slug}/`;
    const port = process.env.PORT || '3001';
    return `http://localhost:${port}/v1/previews/${slug}/`;
  }

  private async assertAgent(agentId: string) {
    const agent = await this.db.query.agent.findFirst({
      where: (table) => eq(table.agentId, agentId),
    });
    if (!agent) throw new NotFoundException('Agent not found');
    return agent;
  }

  private async assertProject(agentId: string, projectId: string) {
    const project = await this.db.query.codeProject.findFirst({
      where: (table) =>
        and(eq(table.projectId, projectId), eq(table.agentId, agentId)),
    });
    if (!project) throw new NotFoundException('Code project not found');
    return project;
  }

  private emit(
    runId: string | undefined,
    status: 'running' | 'completed' | 'failed',
    message: string,
    payload: Record<string, any>,
    toolName:
      | 'writeCodeProjectFiles'
      | 'publishCodeProject'
      | 'testCodeProject',
  ) {
    agentRunProgress.emit(runId, {
      type: 'toolProgress',
      toolName,
      stage: payload.verification
        ? 'project_test'
        : payload.publicUrl || payload.deploymentId
          ? 'project_build'
          : 'project_files',
      status,
      message,
      detail: payload.publicUrl ?? payload.projectId,
      payload,
    });
  }
}

function validateFiles(files: CodeProjectFileInput[]) {
  if (!Array.isArray(files) || files.length === 0) {
    throw new BadRequestException('files must contain at least one file');
  }
  if (files.length > MAX_FILES) {
    throw new BadRequestException(
      `A project can contain at most ${MAX_FILES} files`,
    );
  }
  let total = 0;
  const seen = new Set<string>();
  const normalized = files.map((file) => {
    const path = normalizeProjectPath(file.path);
    if (seen.has(path))
      throw new BadRequestException(`Duplicate file path: ${path}`);
    seen.add(path);
    if (typeof file.content !== 'string') {
      throw new BadRequestException(`File content must be text: ${path}`);
    }
    const bytes = Buffer.byteLength(file.content);
    if (bytes > MAX_FILE_BYTES) {
      throw new BadRequestException(`File is too large: ${path}`);
    }
    total += bytes;
    return { path, content: file.content };
  });
  if (total > MAX_PROJECT_BYTES) {
    throw new BadRequestException('Project source exceeds the 1.5 MB limit');
  }
  return normalized;
}

function normalizeProjectPath(value: string) {
  const path = String(value ?? '')
    .trim()
    .replaceAll('\\', '/')
    .replace(/^\.\//, '');
  if (
    !path ||
    path.startsWith('/') ||
    path.includes('\0') ||
    path.split('/').some((part) => !part || part === '.' || part === '..') ||
    path.length > 240
  ) {
    throw new BadRequestException(`Invalid project path: ${value}`);
  }
  return path;
}

function normalizeDirectory(value: string) {
  return normalizeProjectPath(value).replace(/\/$/, '');
}

function normalizePublicPath(value?: string) {
  if (!value) return 'index.html';
  let decoded: string;
  try {
    decoded = decodeURIComponent(value).replace(/^\//, '');
  } catch {
    throw new BadRequestException('Invalid preview asset path');
  }
  if (
    decoded.split('/').some((part) => part === '..') ||
    decoded.includes('\0')
  ) {
    throw new BadRequestException('Invalid preview path');
  }
  return decoded || 'index.html';
}

function posixHasExtension(path: string) {
  return /\.[a-z0-9]+$/i.test(path);
}

function checksum(content: string) {
  return createHash('sha256').update(content).digest('hex');
}

function slugify(value: string) {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 50) || 'prototype'
  );
}

function mimeTypeFor(path: string) {
  if (/\.tsx?$/.test(path)) return 'text/typescript';
  if (/\.jsx?$/.test(path)) return 'text/javascript';
  if (path.endsWith('.css')) return 'text/css';
  if (path.endsWith('.json')) return 'application/json';
  if (path.endsWith('.svg')) return 'image/svg+xml';
  return 'text/plain';
}

function buildErrorsFrom(error: any) {
  const response = error?.getResponse?.();
  if (Array.isArray(response?.errors)) return response.errors;
  return [{ message: response?.message ?? error?.message ?? String(error) }];
}

function starterFiles(name: string): CodeProjectFileInput[] {
  return [
    {
      path: 'app/page.tsx',
      content: `'use client';
import './globals.css';

export default function Page() {
  return (
    <main className="shell">
      <p className="eyebrow">Agent Commons prototype</p>
      <h1>${name.replaceAll('`', '')}</h1>
      <p className="lede">Start shaping this interface with your agent.</p>
      <button type="button">Get started</button>
    </main>
  );
}
`,
    },
    {
      path: 'app/globals.css',
      content: `:root { font-family: Inter, ui-sans-serif, system-ui, sans-serif; color: #18181b; background: #f4f4f5; }
* { box-sizing: border-box; }
body { margin: 0; min-width: 320px; min-height: 100vh; }
button { border: 0; border-radius: 6px; padding: 12px 18px; background: #18181b; color: white; font: inherit; cursor: pointer; }
.shell { min-height: 100vh; display: grid; place-content: center; gap: 18px; padding: 32px; text-align: center; }
.eyebrow { margin: 0; color: #4f46e5; font-size: 12px; font-weight: 700; text-transform: uppercase; }
h1 { margin: 0; font-size: clamp(42px, 8vw, 88px); line-height: 0.95; }
.lede { margin: 0; color: #52525b; font-size: 18px; }
`,
    },
    { path: 'app/layout.tsx', content: `import type { ReactNode } from 'react';\nexport default function RootLayout({ children }: { children: ReactNode }) { return <html lang="en"><body>{children}</body></html>; }\n` },
    { path: 'next.config.ts', content: `import type { NextConfig } from 'next';\nconst config: NextConfig = { output: 'export' };\nexport default config;\n` },
    { path: 'package.json', content: JSON.stringify({ scripts: { dev: 'next dev', build: 'next build' }, dependencies: { next: '^15.5.0', react: '^19.0.0', 'react-dom': '^19.0.0' }, devDependencies: { typescript: '^5.0.0', '@types/react': '^19.0.0', '@types/node': '^20.0.0' } }, null, 2) },
  ];
}

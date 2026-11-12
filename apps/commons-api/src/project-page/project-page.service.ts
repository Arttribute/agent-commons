import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import * as schema from '#/models/schema';
import { DatabaseService } from '~/modules/database/database.service';
import { ProjectService } from '~/project/project.service';
import { CodeProjectService } from '~/code-project/code-project.service';
import type { CodeProjectFileInput } from '~/code-project/code-project.types';
import { createPageFiles, CAMP_PUBLIC_CONTEXT } from './templates';
import {
  CreatePageInput,
  PageInput,
  isPageId,
  pageConfig,
  pageSlug,
  pageSurface,
  publicHttpsUrl,
} from './page-input';
import { importStaticBuild } from './static-import';

type PageRow = typeof schema.projectPage.$inferSelect;
@Injectable()
export class ProjectPageService {
  constructor(
    private readonly db: DatabaseService,
    private readonly projects: ProjectService,
    private readonly code: CodeProjectService,
  ) {}
  private owned(ownerId: string) {
    return and(
      sql`lower(${schema.projectPage.ownerUserId}) = lower(${ownerId})`,
      isNull(schema.projectPage.deletedAt),
    );
  }
  async requirePage(ownerId: string, projectId: string, pageId: string) {
    await this.projects.requireProject(ownerId, projectId);
    if (!isPageId(pageId)) throw new NotFoundException('Page not found');
    const [page] = await this.db
      .select()
      .from(schema.projectPage)
      .where(
        and(
          this.owned(ownerId),
          eq(schema.projectPage.projectId, projectId),
          eq(schema.projectPage.pageId, pageId),
        ),
      )
      .limit(1);
    if (!page) throw new NotFoundException('Page not found');
    return page;
  }
  async list(ownerId: string, projectId?: string, surface?: unknown) {
    if (projectId) await this.projects.requireProject(ownerId, projectId);
    return this.db
      .select({ page: schema.projectPage, projectName: schema.project.name })
      .from(schema.projectPage)
      .innerJoin(
        schema.project,
        eq(schema.project.projectId, schema.projectPage.projectId),
      )
      .where(
        and(
          this.owned(ownerId),
          isNull(schema.project.deletedAt),
          projectId ? eq(schema.projectPage.projectId, projectId) : undefined,
          surface === undefined
            ? undefined
            : eq(schema.projectPage.surface, pageSurface(surface)),
        ),
      )
      .orderBy(desc(schema.projectPage.updatedAt))
      .then((rows) =>
        rows.map(({ page, projectName }) => ({
          ...this.view(page),
          projectName,
        })),
      );
  }
  async create(ownerId: string, projectId: string, input: CreatePageInput) {
    const project = await this.projects.requireProject(ownerId, projectId);
    const slug = pageSlug(input?.slug);
    const surface = pageSurface(input.surface);
    const template = input.template ?? 'blank';
    if (!['blank', 'ai-kids-camp'].includes(template))
      throw new BadRequestException('Unknown page starter');
    const config = pageConfig({
      ...input,
      publicContext:
        input.publicContext ??
        (template === 'ai-kids-camp' ? CAMP_PUBLIC_CONTEXT : ''),
    });
    const [taken] = await this.db
      .select({ pageId: schema.projectPage.pageId })
      .from(schema.projectPage)
      .where(eq(schema.projectPage.slug, slug))
      .limit(1);
    if (taken)
      throw new ConflictException('That page address is already in use');
    const agentId = input.agentId ?? project.agentId;
    if (!agentId || typeof agentId !== 'string')
      throw new BadRequestException(
        'Choose an agent for this project before creating a page',
      );
    const [agent] = await this.db
      .select({ agentId: schema.agent.agentId })
      .from(schema.agent)
      .where(
        and(
          eq(schema.agent.agentId, agentId),
          sql`(lower(${schema.agent.ownerUserId}) = lower(${ownerId}) OR lower(${schema.agent.owner}) = lower(${ownerId}))`,
        ),
      )
      .limit(1);
    if (!agent) throw new BadRequestException('Choose one of your own agents');
    const registrationUrl = publicHttpsUrl(
      input.registrationUrl,
      'Registration URL',
    );
    const code = await this.code.create({
      agentId,
      name: config.title,
      description: config.description,
      files: createPageFiles(template, {
        title: config.title,
        registrationUrl,
      }),
    });
    try {
      const [row] = await this.db
        .insert(schema.projectPage)
        .values({
          projectId,
          codeProjectId: code.projectId,
          ownerUserId: ownerId.toLowerCase(),
          slug,
          surface,
          draftConfig: config,
        })
        .returning();
      return this.get(ownerId, projectId, row.pageId);
    } catch (error: any) {
      // The code project remains a private Library item if a concurrent create
      // wins the slug. Never publish or delete unrelated owner content here.
      if (error?.code === '23505' || error?.cause?.code === '23505')
        throw new ConflictException(
          'That page address was just taken. Choose another address.',
        );
      throw error;
    }
  }
  async get(ownerId: string, projectId: string, pageId: string) {
    const page = await this.requirePage(ownerId, projectId, pageId);
    const [source] = await this.db
      .select()
      .from(schema.codeProject)
      .where(eq(schema.codeProject.projectId, page.codeProjectId))
      .limit(1);
    if (!source || source.ownerUserId?.toLowerCase() !== ownerId.toLowerCase())
      throw new NotFoundException('Page source not found');
    const code = await this.code.get(source.agentId, source.projectId);
    // Binary files remain in storage and ZIP/GitHub exports, not the editor or AI prompt.
    return {
      ...this.view(page),
      source: {
        ...code,
        files: code.files.map((file) =>
          file.content.startsWith('base64:')
            ? { ...file, content: '', binary: true }
            : { ...file, binary: false },
        ),
      },
    };
  }
  async update(
    ownerId: string,
    projectId: string,
    pageId: string,
    input: PageInput,
  ) {
    const page = await this.requirePage(ownerId, projectId, pageId);
    await this.db
      .update(schema.projectPage)
      .set({
        draftConfig: pageConfig(input, page.draftConfig),
        revision: sql`${schema.projectPage.revision} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(schema.projectPage.pageId, pageId));
    return this.get(ownerId, projectId, pageId);
  }
  private async source(ownerId: string, projectId: string, pageId: string) {
    const page = await this.requirePage(ownerId, projectId, pageId);
    const [source] = await this.db
      .select()
      .from(schema.codeProject)
      .where(
        and(
          eq(schema.codeProject.projectId, page.codeProjectId),
          sql`lower(${schema.codeProject.ownerUserId}) = lower(${ownerId})`,
        ),
      )
      .limit(1);
    if (!source) throw new NotFoundException('Page source not found');
    return { page, source };
  }
  async writeFiles(
    ownerId: string,
    projectId: string,
    pageId: string,
    files: CodeProjectFileInput[],
  ) {
    const { source } = await this.source(ownerId, projectId, pageId);
    await this.code.writeFiles({
      agentId: source.agentId,
      projectId: source.projectId,
      files,
    });
    await this.touch(pageId);
    return this.get(ownerId, projectId, pageId);
  }
  async import(
    ownerId: string,
    projectId: string,
    pageId: string,
    zip: Buffer,
  ) {
    const { source } = await this.source(ownerId, projectId, pageId);
    const files = await importStaticBuild(zip);
    await this.code.writeFiles({
      agentId: source.agentId,
      projectId: source.projectId,
      files,
      replace: true,
      framework: 'static',
    });
    await this.touch(pageId);
    return this.get(ownerId, projectId, pageId);
  }
  /** Explicitly creates an unlisted preview URL. It does not change the friendly live page. */
  async preview(ownerId: string, projectId: string, pageId: string) {
    const { page, source } = await this.source(ownerId, projectId, pageId);
    const built = await this.code.publish({
      agentId: source.agentId,
      projectId: source.projectId,
    });
    await this.enableAssets(ownerId, page, {});
    return { ...built, visibility: 'unlisted' as const };
  }
  async publish(ownerId: string, projectId: string, pageId: string) {
    const { page, source } = await this.source(ownerId, projectId, pageId);
    const config = pageConfig(page.draftConfig);
    const built = await this.code.publish({
      agentId: source.agentId,
      projectId: source.projectId,
    });
    // A ready immutable deployment is pinned. Later source edits or preview builds
    // cannot move this page to another deployment or expose draft public context.
    const [deployment] = await this.db
      .select()
      .from(schema.codeProjectDeployment)
      .where(
        and(
          eq(schema.codeProjectDeployment.deploymentId, built.deploymentId),
          eq(schema.codeProjectDeployment.projectId, page.codeProjectId),
          eq(schema.codeProjectDeployment.status, 'ready'),
        ),
      )
      .limit(1);
    if (!deployment?.publicUrl)
      throw new BadRequestException(
        'The build did not produce a ready deployment',
      );
    await this.projects.requireProject(ownerId, projectId);
    await this.enableAssets(ownerId, page, {
      status: 'published',
      publishedConfig: config,
      publishedDeploymentId: deployment.deploymentId,
      publishedAt: new Date(),
    });
    return this.get(ownerId, projectId, pageId);
  }
  async unpublish(
    ownerId: string,
    projectId: string,
    pageId: string,
    remove = false,
  ) {
    const { page } = await this.source(ownerId, projectId, pageId);
    await this.db.transaction(async (tx) => {
      await tx
        .update(schema.projectPage)
        .set({
          status: 'draft',
          assetsEnabled: false,
          revision: sql`${schema.projectPage.revision} + 1`,
          ...(remove ? { deletedAt: new Date() } : {}),
          updatedAt: new Date(),
        })
        .where(eq(schema.projectPage.pageId, pageId));
      await tx
        .update(schema.codeProject)
        .set({ visibility: 'private', updatedAt: new Date() })
        .where(eq(schema.codeProject.projectId, page.codeProjectId));
    });
    return remove
      ? { pageId, removed: true }
      : this.get(ownerId, projectId, pageId);
  }
  async publicPage(slugValue: string) {
    let slug: string;
    try {
      slug = pageSlug(slugValue);
    } catch {
      throw new NotFoundException('Page not found');
    }
    const [result] = await this.db
      .select({
        page: schema.projectPage,
        deployment: schema.codeProjectDeployment,
      })
      .from(schema.projectPage)
      .innerJoin(
        schema.project,
        eq(schema.project.projectId, schema.projectPage.projectId),
      )
      .innerJoin(
        schema.codeProject,
        eq(schema.codeProject.projectId, schema.projectPage.codeProjectId),
      )
      .innerJoin(
        schema.codeProjectDeployment,
        and(
          eq(
            schema.codeProjectDeployment.deploymentId,
            schema.projectPage.publishedDeploymentId,
          ),
          eq(
            schema.codeProjectDeployment.projectId,
            schema.projectPage.codeProjectId,
          ),
        ),
      )
      .where(
        and(
          eq(schema.projectPage.slug, slug),
          eq(schema.projectPage.status, 'published'),
          isNull(schema.projectPage.deletedAt),
          isNull(schema.project.deletedAt),
          eq(schema.codeProject.visibility, 'public'),
          eq(schema.codeProjectDeployment.status, 'ready'),
        ),
      )
      .limit(1);
    if (!result?.page.publishedConfig || !result.deployment.publicUrl)
      throw new NotFoundException('Page not found');
    const { page, deployment } = result;
    const config = pageConfig(page.publishedConfig!);
    return {
      slug: page.slug,
      surface: page.surface,
      title: config.title,
      description: config.description,
      publicContext: config.publicContext,
      chatEnabled: config.chatEnabled,
      chatName: config.chatName,
      chatAvatarUrl: config.chatAvatarUrl,
      chatGreeting: config.chatGreeting,
      registrationUrl: config.registrationSlug
        ? `/register/${config.registrationSlug}`
        : undefined,
      imageUrl: config.imageUrl,
      entryUrl: deployment.publicUrl,
      publishedAt: page.publishedAt,
    };
  }
  private async enableAssets(
    ownerId: string,
    page: PageRow,
    values: Partial<typeof schema.projectPage.$inferInsert>,
  ) {
    const changed = await this.db
      .update(schema.projectPage)
      .set({
        ...values,
        assetsEnabled: true,
        revision: sql`${schema.projectPage.revision} + 1`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.projectPage.pageId, page.pageId),
          eq(schema.projectPage.revision, page.revision),
          this.owned(ownerId),
        ),
      )
      .returning({ pageId: schema.projectPage.pageId });
    if (!changed.length)
      throw new ConflictException(
        'The page changed while building. Review the current draft and try again.',
      );
  }
  private touch(pageId: string) {
    return this.db
      .update(schema.projectPage)
      .set({
        revision: sql`${schema.projectPage.revision} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(schema.projectPage.pageId, pageId));
  }
  private view(page: PageRow) {
    return {
      ...page,
      publicPath: `/p/${page.slug}`,
      chatPath: `/p/${page.slug}/chat`,
    };
  }
}

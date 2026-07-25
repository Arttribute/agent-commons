import {
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { DatabaseService } from '../modules/database/database.service';
import { skill as skillTable } from '../../models/schema';
import { eq, and, or, sql } from 'drizzle-orm';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

export interface CreateSkillDto {
  slug: string;
  name: string;
  description: string;
  instructions: string;
  tools?: string[];
  triggers?: string[];
  ownerId?: string;
  ownerType?: 'platform' | 'user' | 'agent';
  isPublic?: boolean;
  tags?: string[];
  icon?: string;
  source?: string;
  sourceUrl?: string;
}

export interface SkillIndex {
  skillId: string;
  slug: string;
  name: string;
  description: string;
  tags: string[];
  icon?: string | null;
  triggers: string[];
}

@Injectable()
export class SkillService implements OnModuleInit {
  private readonly logger = new Logger(SkillService.name);

  constructor(private readonly db: DatabaseService) {}

  async onModuleInit() {
    await this.syncBundledPlatformSkills().catch((error) =>
      this.logger.error(
        `Could not sync bundled platform skills: ${
          error instanceof Error ? error.message : String(error)
        }`,
      ),
    );
  }

  async list(filter?: {
    ownerId?: string;
    ownerType?: string;
    isPublic?: boolean;
  }) {
    const conditions: any[] = [];

    if (filter?.ownerId)
      conditions.push(eq(skillTable.ownerId, filter.ownerId));
    if (filter?.ownerType)
      conditions.push(eq(skillTable.ownerType, filter.ownerType));
    if (filter?.isPublic !== undefined)
      conditions.push(eq(skillTable.isPublic, filter.isPublic));

    return this.db
      .select()
      .from(skillTable)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(skillTable.name);
  }

  async get(skillIdOrSlug: string) {
    const rows = await this.db
      .select()
      .from(skillTable)
      .where(
        or(
          eq(skillTable.skillId, skillIdOrSlug),
          eq(skillTable.slug, skillIdOrSlug),
        ),
      )
      .limit(1);

    if (!rows.length) {
      throw new NotFoundException(`Skill "${skillIdOrSlug}" not found`);
    }
    return rows[0];
  }

  async create(dto: CreateSkillDto) {
    const rows = await this.db
      .insert(skillTable)
      .values({
        slug: dto.slug,
        name: dto.name,
        description: dto.description,
        instructions: dto.instructions,
        tools: dto.tools ?? [],
        triggers: dto.triggers ?? [],
        ownerId: dto.ownerId ?? null,
        ownerType: dto.ownerType ?? 'user',
        isPublic: dto.isPublic ?? false,
        tags: dto.tags ?? [],
        icon: dto.icon ?? null,
        source: dto.source ?? 'user',
        sourceUrl: dto.sourceUrl ?? null,
      })
      .returning();

    return rows[0];
  }

  async update(skillIdOrSlug: string, updates: Partial<CreateSkillDto>) {
    const existing = await this.get(skillIdOrSlug);

    const rows = await this.db
      .update(skillTable)
      .set({
        ...(updates.name !== undefined && { name: updates.name }),
        ...(updates.description !== undefined && {
          description: updates.description,
        }),
        ...(updates.instructions !== undefined && {
          instructions: updates.instructions,
        }),
        ...(updates.tools !== undefined && { tools: updates.tools }),
        ...(updates.triggers !== undefined && { triggers: updates.triggers }),
        ...(updates.isPublic !== undefined && { isPublic: updates.isPublic }),
        ...(updates.tags !== undefined && { tags: updates.tags }),
        ...(updates.icon !== undefined && { icon: updates.icon }),
        updatedAt: new Date(),
      })
      .where(eq(skillTable.skillId, existing.skillId))
      .returning();

    return rows[0];
  }

  async delete(skillIdOrSlug: string) {
    const existing = await this.get(skillIdOrSlug);
    await this.db
      .delete(skillTable)
      .where(eq(skillTable.skillId, existing.skillId));
    return { deleted: true };
  }

  async incrementUsage(skillIdOrSlug: string) {
    const existing = await this.get(skillIdOrSlug).catch(() => null);
    if (!existing) return;
    await this.db
      .update(skillTable)
      .set({ usageCount: sql`${skillTable.usageCount} + 1` })
      .where(eq(skillTable.skillId, existing.skillId));
  }

  /**
   * Returns the compact index (no full instructions) for progressive disclosure.
   * Used at session start to give the agent a lightweight menu of available skills.
   */
  async getIndex(ownerId?: string): Promise<SkillIndex[]> {
    const conditions: any[] = [eq(skillTable.isActive, true)];

    if (ownerId) {
      conditions.push(
        or(eq(skillTable.isPublic, true), eq(skillTable.ownerId, ownerId)),
      );
    } else {
      conditions.push(eq(skillTable.isPublic, true));
    }

    return this.db
      .select({
        skillId: skillTable.skillId,
        slug: skillTable.slug,
        name: skillTable.name,
        description: skillTable.description,
        tags: skillTable.tags,
        icon: skillTable.icon,
        triggers: skillTable.triggers,
      })
      .from(skillTable)
      .where(and(...conditions))
      .orderBy(skillTable.name);
  }

  async buildPromptIndex(ownerId?: string) {
    const index = await this.getIndex(ownerId);
    if (!index.length) return '';
    return [
      '## SPECIALIZED SKILLS',
      'These are progressive-disclosure operating playbooks. When the user request matches one, you MUST call invoke_skill with its slug before the first execution tool call, then follow the returned instructions through validation. Load every clearly relevant skill; do not merely mention it.',
      ...index
        .slice(0, 60)
        .map(
          (skill) =>
            `- ${skill.slug}: ${skill.description}${
              skill.triggers?.length
                ? ` Triggers: ${skill.triggers.join(', ')}.`
                : ''
            }`,
        ),
    ].join('\n');
  }

  private async syncBundledPlatformSkills() {
    const directory = await findBundledSkillDirectory();
    if (!directory) {
      this.logger.warn('Bundled platform skills directory was not found');
      return;
    }
    const entries = await readdir(directory, { withFileTypes: true });
    let synced = 0;
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const slug = entry.name;
      const configuration = BUNDLED_SKILL_CONFIG[slug];
      if (!configuration) continue;
      const source = await readFile(
        path.join(directory, slug, 'SKILL.md'),
        'utf8',
      );
      const parsed = parseSkillMarkdown(source);
      if (parsed.slug !== slug) {
        throw new Error(
          `Bundled skill folder "${slug}" declares name "${parsed.slug}"`,
        );
      }
      await this.db
        .insert(skillTable)
        .values({
          slug,
          name: configuration.name,
          description: parsed.description,
          instructions: parsed.instructions,
          tools: configuration.tools,
          triggers: configuration.triggers,
          ownerId: null,
          ownerType: 'platform',
          isPublic: true,
          isActive: true,
          version: configuration.version,
          tags: configuration.tags,
          icon: configuration.icon,
          source: 'platform',
          sourceUrl: null,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: skillTable.slug,
          set: {
            name: configuration.name,
            description: parsed.description,
            instructions: parsed.instructions,
            tools: configuration.tools,
            triggers: configuration.triggers,
            ownerId: null,
            ownerType: 'platform',
            isPublic: true,
            isActive: true,
            version: configuration.version,
            tags: configuration.tags,
            icon: configuration.icon,
            source: 'platform',
            sourceUrl: null,
            updatedAt: new Date(),
          },
        });
      synced += 1;
    }
    this.logger.log(`Synced ${synced} bundled platform skills`);
  }
}

const BUNDLED_SKILL_CONFIG: Record<
  string,
  {
    name: string;
    tools: string[];
    triggers: string[];
    tags: string[];
    icon: string;
    version: string;
  }
> = {
  'create-presentations': {
    name: 'Create Presentations',
    tools: ['readUploadedFile', 'createPresentationFile'],
    triggers: ['PowerPoint', 'PPTX', 'presentation', 'slide deck', 'slides'],
    tags: ['artifacts', 'presentation', 'pptx'],
    icon: 'presentation',
    version: '1.0.0',
  },
  'create-documents': {
    name: 'Create Documents',
    tools: ['readUploadedFile', 'createDocumentFile'],
    triggers: [
      'DOCX',
      'Word document',
      'report',
      'brief',
      'proposal',
      'letter',
    ],
    tags: ['artifacts', 'document', 'docx'],
    icon: 'file-text',
    version: '1.0.0',
  },
  'edit-pdfs': {
    name: 'Edit PDFs',
    tools: ['readUploadedFile', 'createPdfFile'],
    triggers: ['PDF', 'edit PDF', 'revise PDF', 'create PDF'],
    tags: ['artifacts', 'pdf', 'editing'],
    icon: 'file-type',
    version: '1.0.0',
  },
  'build-websites': {
    name: 'Build Websites',
    tools: [
      'createCodeProject',
      'writeCodeProjectFiles',
      'publishCodeProject',
      'testCodeProject',
      'startAgentComputer',
      'testComputerBrowser',
    ],
    triggers: ['website', 'landing page', 'dashboard', 'portal', 'web app'],
    tags: ['web', 'code', 'qa'],
    icon: 'globe',
    version: '1.0.0',
  },
  'use-agent-computers': {
    name: 'Use Agent Computers',
    tools: [
      'startAgentComputer',
      'runComputerCommand',
      'readComputerFile',
      'writeComputerFiles',
      'openComputerBrowser',
      'testComputerBrowser',
    ],
    triggers: [
      'agent computer',
      'terminal',
      'browser',
      'repository',
      'run code',
    ],
    tags: ['computer', 'execution', 'qa'],
    icon: 'monitor',
    version: '1.0.0',
  },
};

async function findBundledSkillDirectory() {
  const candidates = [
    process.env.PLATFORM_SKILLS_DIR,
    path.join(process.cwd(), 'platform-skills'),
    path.join(process.cwd(), 'apps', 'commons-api', 'platform-skills'),
  ].filter((candidate): candidate is string => Boolean(candidate));
  for (const candidate of candidates) {
    const entries = await readdir(candidate, { withFileTypes: true }).catch(
      () => null,
    );
    if (entries?.some((entry) => entry.isDirectory())) return candidate;
  }
  return null;
}

function parseSkillMarkdown(source: string) {
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*?)\s*$/);
  if (!match) throw new Error('SKILL.md is missing valid YAML frontmatter');
  const frontmatter = match[1];
  const value = (name: string) => {
    const field = frontmatter.match(
      new RegExp(`^${name}:\\s*(.+?)\\s*$`, 'm'),
    )?.[1];
    return field?.replace(/^['"]|['"]$/g, '').trim();
  };
  const slug = value('name');
  const description = value('description');
  if (!slug || !description) {
    throw new Error('SKILL.md requires name and description');
  }
  return {
    slug,
    description,
    instructions: match[2].trim(),
  };
}

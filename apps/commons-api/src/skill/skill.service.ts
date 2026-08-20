import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import JSZip from 'jszip';
import { DatabaseService } from '../modules/database/database.service';
import {
  agent as agentTable,
  agentSkill as agentSkillTable,
  skill as skillTable,
} from '../../models/schema';
import { eq, and, or, sql, inArray } from 'drizzle-orm';
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

export interface SkillAgentAssignment {
  assignmentId: string;
  agentId: string;
  agentName: string;
  agentAvatar?: string | null;
  isDefault: boolean;
  isEnabled: boolean;
}

export interface SkillRequester {
  principalId: string;
  workspaceId?: string | null;
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

  async list(
    filter?: {
      ownerId?: string;
      ownerType?: string;
      isPublic?: boolean;
    },
    viewerOwnerId?: string,
  ) {
    const conditions: any[] = [];

    if (filter?.ownerId)
      conditions.push(eq(skillTable.ownerId, filter.ownerId));
    if (filter?.ownerType)
      conditions.push(eq(skillTable.ownerType, filter.ownerType));
    if (filter?.isPublic !== undefined)
      conditions.push(eq(skillTable.isPublic, filter.isPublic));

    if (viewerOwnerId) {
      const viewerAgents = await this.db.query.agent.findMany({
        where: (table) =>
          or(
            sql<boolean>`lower(${table.ownerUserId}) = lower(${viewerOwnerId})`,
            sql<boolean>`lower(${table.owner}) = lower(${viewerOwnerId})`,
          ),
        columns: { agentId: true },
      });
      const privateOwners = [
        sql<boolean>`lower(${skillTable.ownerId}) = lower(${viewerOwnerId})`,
        ...(viewerAgents.length
          ? [
              inArray(
                skillTable.ownerId,
                viewerAgents.map((agent) => agent.agentId),
              ),
            ]
          : []),
      ];
      conditions.push(or(eq(skillTable.isPublic, true), ...privateOwners));
    }

    const skills = await this.db
      .select()
      .from(skillTable)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(skillTable.name);
    return this.withAgentAssignments(skills, viewerOwnerId);
  }

  async get(skillIdOrSlug: string, requester?: SkillRequester) {
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
    const found = rows[0];
    await this.assertCanViewSkill(found, requester);
    return found;
  }

  async create(dto: CreateSkillDto, requester?: SkillRequester) {
    let ownerType = dto.ownerType ?? 'user';
    let ownerId = dto.ownerId ?? requester?.principalId ?? null;
    if (requester) {
      if (ownerType === 'platform') {
        throw new ForbiddenException(
          'Platform skills are managed by the platform',
        );
      }
      if (ownerType === 'agent') {
        if (!ownerId)
          throw new ForbiddenException('An agent owner is required');
        await this.requireManageableAgent(ownerId, requester);
      } else {
        ownerType = 'user';
        ownerId = requester.principalId;
      }
    }
    const rows = await this.db
      .insert(skillTable)
      .values({
        slug: dto.slug,
        name: dto.name,
        description: dto.description,
        instructions: dto.instructions,
        tools: dto.tools ?? [],
        triggers: dto.triggers ?? [],
        ownerId,
        ownerType,
        isPublic: dto.isPublic ?? false,
        tags: dto.tags ?? [],
        icon: dto.icon ?? null,
        source: dto.source ?? 'user',
        sourceUrl: dto.sourceUrl ?? null,
      })
      .returning();

    const created = rows[0];
    if (created && ownerType === 'agent' && ownerId) {
      await this.setAgentAssignment({
        agentId: ownerId,
        skillId: created.skillId,
        isEnabled: true,
        assignedBy: requester?.principalId ?? ownerId,
      });
    }
    return created;
  }

  async importSkillFile(
    file: Express.Multer.File | undefined,
    requester: SkillRequester,
  ) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Choose a .md, .zip, or .skill file');
    }
    let markdown = '';
    const fileName = file.originalname.toLowerCase();
    if (fileName.endsWith('.md') || file.mimetype === 'text/markdown') {
      markdown = file.buffer.toString('utf8');
    } else if (fileName.endsWith('.zip') || fileName.endsWith('.skill')) {
      const archive = await JSZip.loadAsync(file.buffer).catch(() => null);
      if (!archive)
        throw new BadRequestException('The skill archive is invalid');
      const entries = Object.values(archive.files).filter(
        (entry) => !entry.dir,
      );
      if (entries.length > 500) {
        throw new BadRequestException(
          'The skill archive contains too many files',
        );
      }
      if (
        entries.some((entry) =>
          entry.name.split('/').some((segment) => segment === '..'),
        )
      ) {
        throw new BadRequestException(
          'The skill archive contains an unsafe path',
        );
      }
      const skillFile = entries
        .filter((entry) => /(^|\/)skill\.md$/i.test(entry.name))
        .sort((left, right) => left.name.length - right.name.length)[0];
      if (!skillFile) {
        throw new BadRequestException(
          'The archive must contain a SKILL.md file',
        );
      }
      markdown = await skillFile.async('string');
    } else {
      throw new BadRequestException(
        'Skills must be .md, .zip, or .skill files',
      );
    }
    if (Buffer.byteLength(markdown, 'utf8') > 1024 * 1024) {
      throw new BadRequestException('SKILL.md must be smaller than 1 MB');
    }
    const parsed = parseSkillMarkdown(markdown);
    const collision = await this.db.query.skill.findFirst({
      where: (table) => eq(table.slug, parsed.slug),
      columns: { skillId: true },
    });
    const slug = collision
      ? `${parsed.slug}-import-${Date.now().toString(36)}`
      : parsed.slug;
    return this.create(
      {
        slug,
        name: parsed.title ?? titleFromSlug(parsed.slug),
        description: parsed.description,
        instructions: parsed.instructions,
        tools: parsed.tools,
        triggers: parsed.triggers,
        tags: parsed.tags,
        isPublic: false,
        ownerType: 'user',
        source: 'import',
      },
      requester,
    );
  }

  async update(
    skillIdOrSlug: string,
    updates: Partial<CreateSkillDto>,
    requester?: SkillRequester,
  ) {
    const existing = await this.get(skillIdOrSlug);
    await this.assertCanManageSkill(existing, requester);

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

  async delete(skillIdOrSlug: string, requester?: SkillRequester) {
    const existing = await this.get(skillIdOrSlug);
    await this.assertCanManageSkill(existing, requester);
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
  async getIndex(
    ownerId?: string,
    requester?: SkillRequester,
  ): Promise<SkillIndex[]> {
    if (!ownerId) return [];
    if (requester) await this.requireManageableAgent(ownerId, requester);
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
      .from(agentSkillTable)
      .innerJoin(skillTable, eq(agentSkillTable.skillId, skillTable.skillId))
      .where(
        and(
          eq(agentSkillTable.agentId, ownerId),
          eq(agentSkillTable.isEnabled, true),
          eq(skillTable.isActive, true),
        ),
      )
      .orderBy(skillTable.name);
  }

  async getForAgent(skillIdOrSlug: string, agentId: string) {
    const rows = await this.db
      .select({ skill: skillTable })
      .from(agentSkillTable)
      .innerJoin(skillTable, eq(agentSkillTable.skillId, skillTable.skillId))
      .where(
        and(
          eq(agentSkillTable.agentId, agentId),
          eq(agentSkillTable.isEnabled, true),
          eq(skillTable.isActive, true),
          or(
            eq(skillTable.skillId, skillIdOrSlug),
            eq(skillTable.slug, skillIdOrSlug),
          ),
        ),
      )
      .limit(1);
    if (!rows.length) {
      throw new NotFoundException(
        `Skill "${skillIdOrSlug}" is not available to this agent`,
      );
    }
    return rows[0].skill;
  }

  async listForAgent(agentId: string, requester?: SkillRequester) {
    const target = await this.requireManageableAgent(agentId, requester);
    const ownerUserId = target.ownerUserId ?? target.owner;
    const siblingAgents = ownerUserId
      ? await this.db.query.agent.findMany({
          where: (table) =>
            or(
              eq(table.ownerUserId, ownerUserId),
              eq(table.owner, ownerUserId),
            ),
          columns: { agentId: true },
        })
      : [];
    const visibleOwnerIds = [
      ownerUserId,
      ...siblingAgents.map((agent) => agent.agentId),
    ].filter(Boolean) as string[];
    const skills = await this.db
      .select()
      .from(skillTable)
      .where(
        and(
          eq(skillTable.isActive, true),
          or(
            eq(skillTable.isPublic, true),
            visibleOwnerIds.length
              ? inArray(skillTable.ownerId, visibleOwnerIds)
              : undefined,
          ),
        ),
      )
      .orderBy(skillTable.name);
    const assignments = await this.db.query.agentSkill.findMany({
      where: (table) => eq(table.agentId, agentId),
    });
    const assignmentBySkill = new Map(
      assignments.map((assignment) => [assignment.skillId, assignment]),
    );
    return skills.map((skill) => {
      const assignment = assignmentBySkill.get(skill.skillId);
      return {
        ...skill,
        assignmentId: assignment?.id ?? null,
        assigned: Boolean(assignment?.isEnabled),
      };
    });
  }

  async assignToAgent(
    skillIdOrSlug: string,
    agentId: string,
    isEnabled: boolean,
    requester?: SkillRequester,
  ) {
    const target = await this.requireManageableAgent(agentId, requester);
    const skill = await this.get(skillIdOrSlug);
    await this.assertSkillCanBeAssigned(skill, target, requester);
    return this.setAgentAssignment({
      agentId,
      skillId: skill.skillId,
      isEnabled,
      assignedBy: requester?.principalId ?? agentId,
    });
  }

  async ensurePlatformSkillsForCopilot(agentId: string, assignedBy?: string) {
    const platformSkills = await this.db
      .select({ skillId: skillTable.skillId })
      .from(skillTable)
      .where(
        and(
          eq(skillTable.ownerType, 'platform'),
          eq(skillTable.isActive, true),
        ),
      );
    if (!platformSkills.length) return;
    await this.db
      .insert(agentSkillTable)
      .values(
        platformSkills.map((skill) => ({
          agentId,
          skillId: skill.skillId,
          isEnabled: true,
          assignedBy: assignedBy ?? agentId,
        })),
      )
      .onConflictDoNothing();
  }

  private async setAgentAssignment(input: {
    agentId: string;
    skillId: string;
    isEnabled: boolean;
    assignedBy: string;
  }) {
    const [assignment] = await this.db
      .insert(agentSkillTable)
      .values({
        agentId: input.agentId,
        skillId: input.skillId,
        isEnabled: input.isEnabled,
        assignedBy: input.assignedBy,
      })
      .onConflictDoUpdate({
        target: [agentSkillTable.agentId, agentSkillTable.skillId],
        set: {
          isEnabled: input.isEnabled,
          assignedBy: input.assignedBy,
          updatedAt: new Date(),
        },
      })
      .returning();
    return assignment;
  }

  private async requireManageableAgent(
    agentId: string,
    requester?: SkillRequester,
  ) {
    const target = await this.db.query.agent.findFirst({
      where: (table) => eq(table.agentId, agentId),
    });
    if (!target) throw new NotFoundException('Agent not found');
    if (!requester) return target;
    const ownsAgent = [target.ownerUserId, target.owner]
      .filter(Boolean)
      .some(
        (owner) => owner!.toLowerCase() === requester.principalId.toLowerCase(),
      );
    const sharesWorkspace = Boolean(
      requester.workspaceId &&
        target.workspaceId &&
        requester.workspaceId.toLowerCase() ===
          target.workspaceId.toLowerCase(),
    );
    if (!ownsAgent && !sharesWorkspace) {
      throw new ForbiddenException('You cannot manage skills for this agent');
    }
    return target;
  }

  private async assertCanViewSkill(
    skill: typeof skillTable.$inferSelect,
    requester?: SkillRequester,
  ) {
    if (!requester || skill.isPublic) return;
    if (sameIdentity(skill.ownerId, requester.principalId)) return;
    if (skill.ownerType === 'agent' && skill.ownerId) {
      await this.requireManageableAgent(skill.ownerId, requester);
      return;
    }
    throw new ForbiddenException('You cannot access this skill');
  }

  private async assertCanManageSkill(
    skill: typeof skillTable.$inferSelect,
    requester?: SkillRequester,
  ) {
    if (!requester) return;
    if (skill.ownerType === 'platform') {
      throw new ForbiddenException(
        'Platform skills are managed by the platform',
      );
    }
    if (skill.ownerType === 'agent' && skill.ownerId) {
      await this.requireManageableAgent(skill.ownerId, requester);
      return;
    }
    if (sameIdentity(skill.ownerId, requester.principalId)) return;
    throw new ForbiddenException('You cannot manage this skill');
  }

  private async assertSkillCanBeAssigned(
    skill: typeof skillTable.$inferSelect,
    target: typeof agentTable.$inferSelect,
    requester?: SkillRequester,
  ) {
    if (!requester || skill.isPublic) return;
    if (sameIdentity(skill.ownerId, requester.principalId)) return;
    if (sameIdentity(skill.ownerId, target.agentId)) return;
    if (skill.ownerType === 'agent' && skill.ownerId) {
      const source = await this.db.query.agent.findFirst({
        where: (table) => eq(table.agentId, skill.ownerId!),
      });
      const targetOwner = target.ownerUserId ?? target.owner;
      const sourceOwner = source?.ownerUserId ?? source?.owner;
      const sameOwner = sameIdentity(targetOwner, sourceOwner);
      const sameWorkspace = Boolean(
        target.workspaceId &&
          source?.workspaceId &&
          sameIdentity(target.workspaceId, source.workspaceId),
      );
      if (sameOwner || sameWorkspace) return;
    }
    throw new ForbiddenException('This skill is not available to this agent');
  }

  private async withAgentAssignments(
    skills: Array<typeof skillTable.$inferSelect>,
    viewerOwnerId?: string,
  ) {
    if (!skills.length || !viewerOwnerId) {
      return skills.map((skill) => ({ ...skill, assignedAgents: [] }));
    }
    const rows = await this.db
      .select({
        assignmentId: agentSkillTable.id,
        skillId: agentSkillTable.skillId,
        isEnabled: agentSkillTable.isEnabled,
        agentId: agentTable.agentId,
        agentName: agentTable.name,
        agentAvatar: agentTable.avatar,
        isDefault: agentTable.isDefault,
      })
      .from(agentSkillTable)
      .innerJoin(agentTable, eq(agentSkillTable.agentId, agentTable.agentId))
      .where(
        and(
          inArray(
            agentSkillTable.skillId,
            skills.map((skill) => skill.skillId),
          ),
          or(
            sql<boolean>`lower(${agentTable.ownerUserId}) = lower(${viewerOwnerId})`,
            sql<boolean>`lower(${agentTable.owner}) = lower(${viewerOwnerId})`,
          ),
        ),
      );
    const bySkill = new Map<string, SkillAgentAssignment[]>();
    for (const row of rows) {
      const assignments = bySkill.get(row.skillId) ?? [];
      assignments.push({
        assignmentId: row.assignmentId,
        agentId: row.agentId,
        agentName: row.agentName,
        agentAvatar: row.agentAvatar,
        isDefault: row.isDefault,
        isEnabled: row.isEnabled,
      });
      bySkill.set(row.skillId, assignments);
    }
    return skills.map((skill) => ({
      ...skill,
      assignedAgents: bySkill.get(skill.skillId) ?? [],
    }));
  }

  async buildPromptIndex(ownerId?: string, requestText = '') {
    const index = await this.getIndex(ownerId);
    if (!index.length) return '';
    const normalizedRequest = requestText.toLowerCase();
    const matched = normalizedRequest
      ? index
          .filter((skill) =>
            [skill.name, skill.slug, ...(skill.triggers ?? [])].some(
              (trigger) =>
                trigger.length >= 3 &&
                normalizedRequest.includes(trigger.toLowerCase()),
            ),
          )
          .slice(0, 3)
      : [];
    const matchedPlaybooks = await Promise.all(
      matched.map((skill) => this.get(skill.slug)),
    );
    const prompt = [
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
    ];
    if (matchedPlaybooks.length) {
      prompt.push(
        '',
        '## MATCHED SKILL PLAYBOOKS',
        'These playbooks matched the current request and are preloaded to guarantee their quality gates. You MUST still call invoke_skill so the execution is visible, then follow this complete playbook rather than improvising a lower-quality shortcut.',
        ...matchedPlaybooks.map(
          (skill) => `### ${skill.slug}\n${skill.instructions}`,
        ),
      );
    }
    return prompt.join('\n');
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
    const copilots = await this.db.query.agent.findMany({
      where: (table) =>
        and(eq(table.isDefault, true), eq(table.isSystemManaged, true)),
      columns: { agentId: true, ownerUserId: true, owner: true },
    });
    for (const copilot of copilots) {
      await this.ensurePlatformSkillsForCopilot(
        copilot.agentId,
        copilot.ownerUserId ?? copilot.owner ?? copilot.agentId,
      );
    }
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
  'build-commons-ui-plugin': {
    name: 'Build Commons UI Plugins',
    tools: [
      'createCodeProject',
      'writeCodeProjectFiles',
      'publishCodeProject',
      'testCodeProject',
      'registerUiPlugin',
    ],
    triggers: [
      'custom UI',
      'custom page',
      'floating widget',
      'Commons app plugin',
    ],
    tags: ['ui', 'plugin', 'widget', 'app'],
    icon: 'panels-top-left',
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
    title: value('title'),
    description,
    instructions: match[2].trim(),
    tools: frontmatterList(frontmatter, 'tools'),
    triggers: frontmatterList(frontmatter, 'triggers'),
    tags: frontmatterList(frontmatter, 'tags'),
  };
}

function frontmatterList(frontmatter: string, field: string) {
  const inline = frontmatter.match(
    new RegExp(`^${field}:\\s*\\[([^\\]]*)\\]`, 'm'),
  )?.[1];
  if (inline !== undefined) {
    return inline
      .split(',')
      .map((value) => value.trim().replace(/^['"]|['"]$/g, ''))
      .filter(Boolean);
  }
  const block = frontmatter.match(
    new RegExp(`^${field}:\\s*\\r?\\n((?:\\s+-\\s+.+\\r?\\n?)*)`, 'm'),
  )?.[1];
  return (block?.match(/^\s+-\s+(.+)$/gm) ?? []).map((line) =>
    line
      .replace(/^\s+-\s+/, '')
      .replace(/^['"]|['"]$/g, '')
      .trim(),
  );
}

function titleFromSlug(slug: string) {
  return slug
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function sameIdentity(left?: string | null, right?: string | null) {
  return Boolean(left && right && left.toLowerCase() === right.toLowerCase());
}

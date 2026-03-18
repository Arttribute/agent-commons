import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../modules/database/database.service';
import { skill as skillTable } from '../../models/schema';
import { eq, and, or, sql } from 'drizzle-orm';

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
export class SkillService {
  private readonly logger = new Logger(SkillService.name);

  constructor(private readonly db: DatabaseService) {}

  async list(filter?: { ownerId?: string; ownerType?: string; isPublic?: boolean }) {
    const conditions: any[] = [];

    if (filter?.ownerId) conditions.push(eq(skillTable.ownerId, filter.ownerId));
    if (filter?.ownerType) conditions.push(eq(skillTable.ownerType, filter.ownerType));
    if (filter?.isPublic !== undefined) conditions.push(eq(skillTable.isPublic, filter.isPublic));

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
        ...(updates.description !== undefined && { description: updates.description }),
        ...(updates.instructions !== undefined && { instructions: updates.instructions }),
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
    await this.db.delete(skillTable).where(eq(skillTable.skillId, existing.skillId));
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
        or(
          eq(skillTable.isPublic, true),
          eq(skillTable.ownerId, ownerId),
        ),
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
}

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import {
  InferInsertModel,
  InferSelectModel,
  and,
  desc,
  eq,
  inArray,
  or,
  sql,
} from 'drizzle-orm';
import * as schema from '#/models/schema';
import { DatabaseService } from '~/modules/database/database.service';
import { ModelProviderFactory } from '~/modules/model-provider';

export type Memory = InferSelectModel<typeof schema.agentMemory>;
export type MemoryType = 'episodic' | 'semantic' | 'procedural';

export interface ConsolidationResult {
  memoriesCreated: number;
  memoriesUpdated: number;
}

@Injectable()
export class MemoryService {
  private readonly logger = new Logger(MemoryService.name);

  constructor(
    private db: DatabaseService,
    private modelProviderFactory: ModelProviderFactory,
  ) {}

  // ── CRUD ──────────────────────────────────────────────────────────────────

  async createMemory(
    input: Omit<
      InferInsertModel<typeof schema.agentMemory>,
      'memoryId' | 'createdAt' | 'updatedAt'
    >,
  ): Promise<Memory> {
    const [row] = await this.db
      .insert(schema.agentMemory)
      .values(input)
      .returning();
    return row;
  }

  async getMemories(
    agentId: string,
    opts?: { activeOnly?: boolean; type?: MemoryType; limit?: number },
  ): Promise<Memory[]> {
    const conditions = [eq(schema.agentMemory.agentId, agentId)];
    if (opts?.activeOnly !== false)
      conditions.push(eq(schema.agentMemory.isActive, true));
    if (opts?.type)
      conditions.push(eq(schema.agentMemory.memoryType, opts.type));

    return this.db
      .select()
      .from(schema.agentMemory)
      .where(and(...conditions))
      .orderBy(desc(schema.agentMemory.importanceScore))
      .limit(opts?.limit ?? 200);
  }

  async getMemory(memoryId: string): Promise<Memory | undefined> {
    return this.db.query.agentMemory.findFirst({
      where: eq(schema.agentMemory.memoryId, memoryId),
    });
  }

  async updateMemory(
    memoryId: string,
    delta: Partial<
      Pick<
        Memory,
        | 'content'
        | 'summary'
        | 'importanceScore'
        | 'tags'
        | 'isActive'
        | 'memoryType'
        | 'expiresAt'
      >
    >,
  ): Promise<Memory | undefined> {
    const [row] = await this.db
      .update(schema.agentMemory)
      .set({ ...delta, updatedAt: new Date() })
      .where(eq(schema.agentMemory.memoryId, memoryId))
      .returning();
    return row;
  }

  async deleteMemory(memoryId: string): Promise<void> {
    await this.db
      .delete(schema.agentMemory)
      .where(eq(schema.agentMemory.memoryId, memoryId));
  }

  // ── Retrieval ─────────────────────────────────────────────────────────────

  /**
   * Retrieve the most relevant memories for a query.
   *
   * Strategy (no vector DB needed):
   *   1. Keyword match on content + tags (ilike)
   *   2. Recency bonus  (memories from last 7 days)
   *   3. Importance score weight
   *
   * Returns top `limit` memories ranked by a composite score.
   */
  async retrieveRelevant(
    agentId: string,
    query: string,
    limit = 10,
  ): Promise<Memory[]> {
    // Fetch all active memories for the agent (bounded by 500 for safety)
    const all = await this.db
      .select()
      .from(schema.agentMemory)
      .where(
        and(
          eq(schema.agentMemory.agentId, agentId),
          eq(schema.agentMemory.isActive, true),
        ),
      )
      .orderBy(desc(schema.agentMemory.importanceScore))
      .limit(500);

    if (all.length === 0) return [];

    const queryLower = query.toLowerCase();
    const queryWords = queryLower.split(/\s+/).filter((w) => w.length > 3);

    const now = Date.now();
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

    const scored = all.map((mem) => {
      const contentLower = mem.content.toLowerCase();
      const summaryLower = mem.summary.toLowerCase();
      const tags = (mem.tags as string[]) ?? [];

      // Keyword relevance: count matching words across content, summary, tags
      let keywordHits = 0;
      for (const word of queryWords) {
        if (contentLower.includes(word)) keywordHits += 2;
        if (summaryLower.includes(word)) keywordHits += 3;
        if (tags.some((t) => t.toLowerCase().includes(word))) keywordHits += 2;
      }
      const keywordScore =
        queryWords.length > 0
        ? Math.min(keywordHits / (queryWords.length * 3), 1)
        : 0;

      // Recency bonus (0→1 over last 7 days)
      const ageMs = now - new Date(mem.createdAt).getTime();
      const recencyScore = Math.max(0, 1 - ageMs / sevenDaysMs);

      // Composite (importance weighted highest)
      const composite =
        keywordScore * 0.45 + mem.importanceScore * 0.35 + recencyScore * 0.2;

      return { mem, composite };
    });

    return scored
      .sort((a, b) => b.composite - a.composite)
      .slice(0, limit)
      .map(({ mem }) => mem);
  }

  /** Bump access count + last accessed timestamp. */
  async recordAccess(memoryIds: string[]): Promise<void> {
    if (memoryIds.length === 0) return;
    await this.db
      .update(schema.agentMemory)
      .set({
        accessCount: sql`${schema.agentMemory.accessCount} + 1`,
        lastAccessedAt: new Date(),
      })
      .where(or(...memoryIds.map((id) => eq(schema.agentMemory.memoryId, id))));
  }

  // ── Consolidation ─────────────────────────────────────────────────────────

  /**
   * After a session completes, analyse the conversation history and extract
   * memories worth persisting.  Uses a fast GPT-4o-mini call.
   */
  async consolidateSession(
    agentId: string,
    sessionId: string,
    history: Array<{ role: string; content: string }>,
  ): Promise<ConsolidationResult> {
    if (history.length < 2) return { memoriesCreated: 0, memoriesUpdated: 0 };

    // Trim to last 40 messages to stay within context limits
    const trimmed = history.slice(-40);
    const transcript = trimmed
      .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
      .join('\n');

    const prompt = `You are a memory extraction assistant. Analyse this agent conversation and extract facts, preferences, or lessons worth remembering for future sessions.

CONVERSATION:
${transcript}

OUTPUT RULES:
- Return a JSON array of memory objects (max 8).
- Each object must have:
    "memoryType": "episodic" | "semantic" | "procedural"
    "content":    Full description (1-3 sentences)
    "summary":    One-line summary (max 12 words)
    "importance": Number 0.0–1.0 (0=trivial, 1=critical)
    "tags":       Array of 2-5 keyword strings
- Only include memories that are genuinely useful in future sessions.
- Skip pleasantries, greetings, and one-off technical errors.
- Return ONLY the JSON array, no other text.`;

    try {
      const llm = this.modelProviderFactory.build({
        provider: 'openai',
        modelId: 'gpt-4o-mini',
        temperature: 0.2,
        maxTokens: 1500,
      });

      const response = await llm.invoke([
        {
          role: 'system',
          content:
            'You extract structured memories from conversations. Return only valid JSON.',
        },
        { role: 'user', content: prompt },
      ]);

      const raw = (response.content as string)
        .replace(/```json\n?/gi, '')
        .replace(/```\n?/gi, '')
        .trim();

      const extracted = JSON.parse(raw) as Array<{
        memoryType: MemoryType;
        content: string;
        summary: string;
        importance: number;
        tags: string[];
      }>;

      let created = 0;
      for (const m of extracted) {
        if (!m.content || !m.summary) continue;

        // De-duplicate: skip if nearly identical summary already exists
        const existing = await this.db.query.agentMemory.findFirst({
          where: and(
            eq(schema.agentMemory.agentId, agentId),
            eq(schema.agentMemory.summary, m.summary),
            eq(schema.agentMemory.isActive, true),
          ),
        });
        if (existing) continue;

        await this.createMemory({
          agentId,
          sessionId: sessionId as any,
          memoryType: m.memoryType ?? 'semantic',
          content: m.content,
          summary: m.summary,
          importanceScore: Math.max(0, Math.min(1, m.importance ?? 0.5)),
          tags: m.tags ?? [],
          sourceType: 'auto',
          isActive: true,
        });
        created++;
      }

      return { memoriesCreated: created, memoriesUpdated: 0 };
    } catch (err) {
      this.logger.warn(
        `Memory consolidation failed for session ${sessionId}: ${err}`,
      );
      return { memoriesCreated: 0, memoriesUpdated: 0 };
    }
  }

  /**
   * Build a compact memory block to inject into the agent system prompt.
   * Returns an empty string if no memories exist.
   */
  async buildMemoryBlock(agentId: string, query: string): Promise<string> {
    const memories = await this.retrieveRelevant(agentId, query, 12);
    if (memories.length === 0) return '';

    // Record access for retrieved memories
    this.recordAccess(memories.map((m) => m.memoryId)).catch(() => {});

    const lines = memories
      .map((m) => {
        const typeLabel =
          m.memoryType === 'episodic'
            ? '[Event]'
            : m.memoryType === 'procedural'
              ? '[Behaviour]'
              : '[Fact]';
        return `• ${typeLabel} ${m.summary}`;
      })
      .join('\n');

    return `\n## Relevant Memories\nThe following memories from previous sessions may be relevant:\n${lines}\n`;
  }

  // ── Shared, append-only memory ───────────────────────────────────────────

  async createSharedScope(input: {
    ownerUserId: string;
    workspaceId?: string | null;
    name: string;
    description?: string;
    agentIds: string[];
  }) {
    const agentIds = [...new Set(input.agentIds)].filter(Boolean);
    if (!input.ownerUserId || !input.name.trim() || agentIds.length === 0) {
      throw new BadRequestException(
        'ownerUserId, name, and at least one agent are required',
      );
    }
    const owned = await this.db
      .select({ agentId: schema.agent.agentId })
      .from(schema.agent)
      .where(
        and(
          inArray(schema.agent.agentId, agentIds),
          or(
            eq(schema.agent.ownerUserId, input.ownerUserId),
            eq(schema.agent.owner, input.ownerUserId),
            ...(input.workspaceId
              ? [eq(schema.agent.workspaceId, input.workspaceId)]
              : []),
          ),
        ),
      );
    if (owned.length !== agentIds.length) {
      throw new ForbiddenException(
        'Every shared-memory agent must belong to this owner or workspace',
      );
    }
    return this.db.transaction(async (tx) => {
      const [scope] = await tx
        .insert(schema.sharedMemoryScope)
        .values({
          ownerUserId: input.ownerUserId,
          workspaceId: input.workspaceId,
          name: input.name.trim(),
          description: input.description?.trim(),
        })
        .returning();
      await tx
        .insert(schema.sharedMemoryMember)
        .values(
          agentIds.map((agentId) => ({
            scopeId: scope.scopeId,
            agentId,
            access: 'write',
          })),
        );
      return scope;
    });
  }

  async getSharedScopesForAgent(agentId: string) {
    return this.db
      .select({
        scopeId: schema.sharedMemoryScope.scopeId,
        name: schema.sharedMemoryScope.name,
        description: schema.sharedMemoryScope.description,
        access: schema.sharedMemoryMember.access,
        updatedAt: schema.sharedMemoryScope.updatedAt,
      })
      .from(schema.sharedMemoryMember)
      .innerJoin(
        schema.sharedMemoryScope,
        eq(schema.sharedMemoryMember.scopeId, schema.sharedMemoryScope.scopeId),
      )
      .where(eq(schema.sharedMemoryMember.agentId, agentId))
      .orderBy(desc(schema.sharedMemoryScope.updatedAt));
  }

  async appendSharedMemory(input: {
    scopeId: string;
    agentId: string;
    sessionId?: string;
    key: string;
    content: string;
    summary?: string;
    expectedVersion?: number;
    metadata?: Record<string, unknown>;
  }) {
    const member = await this.db.query.sharedMemoryMember.findFirst({
      where: and(
        eq(schema.sharedMemoryMember.scopeId, input.scopeId),
        eq(schema.sharedMemoryMember.agentId, input.agentId),
      ),
    });
    if (!member || !['write', 'admin'].includes(member.access)) {
      throw new ForbiddenException(
        'Agent does not have write access to this shared memory',
      );
    }
    const key = input.key.trim().slice(0, 160);
    const content = input.content.trim();
    if (!key || !content)
      throw new BadRequestException(
        'Shared memory key and content are required',
      );

    return this.db.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtext(${`${input.scopeId}:${key}`}))`,
      );
      const [latest] = await tx
        .select()
        .from(schema.sharedMemoryEntry)
        .where(
          and(
            eq(schema.sharedMemoryEntry.scopeId, input.scopeId),
            eq(schema.sharedMemoryEntry.key, key),
          ),
        )
        .orderBy(desc(schema.sharedMemoryEntry.version))
        .limit(1);
      const currentVersion = latest?.version ?? 0;
      if (
        input.expectedVersion !== undefined &&
        input.expectedVersion !== currentVersion
      ) {
        throw new ConflictException({
          message: 'Shared memory changed; read the latest version and retry',
          currentVersion,
          latestEntryId: latest?.entryId ?? null,
        });
      }
      const [entry] = await tx
        .insert(schema.sharedMemoryEntry)
        .values({
          scopeId: input.scopeId,
          key,
          version: currentVersion + 1,
          content,
          summary:
            input.summary?.trim() || content.replace(/\s+/g, ' ').slice(0, 160),
          authoredByAgentId: input.agentId,
          authoredBySessionId: input.sessionId as any,
          supersedesEntryId: latest?.entryId,
          metadata: input.metadata ?? {},
        })
        .returning();
      await tx
        .update(schema.sharedMemoryScope)
        .set({ updatedAt: new Date() })
        .where(eq(schema.sharedMemoryScope.scopeId, input.scopeId));
      return entry;
    });
  }

  async retrieveSharedRelevant(agentId: string, query: string, limit = 12) {
    const scopes = await this.getSharedScopesForAgent(agentId);
    if (!scopes.length) return [];
    const rows = await this.db
      .select()
      .from(schema.sharedMemoryEntry)
      .where(
        inArray(
          schema.sharedMemoryEntry.scopeId,
          scopes.map((scope) => scope.scopeId),
        ),
      )
      .orderBy(desc(schema.sharedMemoryEntry.createdAt))
      .limit(500);
    const latest = new Map<string, (typeof rows)[number]>();
    for (const row of rows) {
      const id = `${row.scopeId}:${row.key}`;
      if (!latest.has(id)) latest.set(id, row);
    }
    const words = query
      .toLowerCase()
      .split(/\W+/)
      .filter((word) => word.length > 3);
    return [...latest.values()]
      .map((row) => ({
        row,
        score: words.reduce(
          (score, word) =>
            score +
            (row.summary.toLowerCase().includes(word) ? 3 : 0) +
            (row.content.toLowerCase().includes(word) ? 1 : 0),
          0,
        ),
      }))
      .sort(
        (a, b) =>
          b.score - a.score ||
          b.row.createdAt.getTime() - a.row.createdAt.getTime(),
      )
      .slice(0, Math.max(1, Math.min(limit, 50)))
      .map(({ row }) => row);
  }

  async buildSharedMemoryBlock(
    agentId: string,
    query: string,
  ): Promise<string> {
    const memories = await this.retrieveSharedRelevant(agentId, query, 12);
    if (!memories.length) return '';
    return `\n## Shared Team Memory\nThese are the latest attributed facts shared with this agent. Treat them as collaborative context, not private memory:\n${memories
      .map(
        (memory) =>
          `• [${memory.key} v${memory.version}, by ${memory.authoredByAgentId}] ${memory.summary}`,
      )
      .join('\n')}\n`;
  }

  // ── Stats ────────────────────────────────────────────────────────────────

  async getStats(agentId: string): Promise<{
    total: number;
    episodic: number;
    semantic: number;
    procedural: number;
    avgImportance: number;
  }> {
    const all = await this.getMemories(agentId, { activeOnly: true });
    const total = all.length;
    if (total === 0) {
      return {
        total: 0,
        episodic: 0,
        semantic: 0,
        procedural: 0,
        avgImportance: 0,
      };
    }
    return {
      total,
      episodic: all.filter((m) => m.memoryType === 'episodic').length,
      semantic: all.filter((m) => m.memoryType === 'semantic').length,
      procedural: all.filter((m) => m.memoryType === 'procedural').length,
      avgImportance: all.reduce((sum, m) => sum + m.importanceScore, 0) / total,
    };
  }
}

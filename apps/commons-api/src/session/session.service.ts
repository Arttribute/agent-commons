import {
  forwardRef,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import {
  and,
  eq,
  InferInsertModel,
  InferSelectModel,
  sql,
  desc,
} from 'drizzle-orm';
import { DatabaseService } from '~/modules/database/database.service';
import * as schema from '#/models/schema';
import { first } from 'lodash';
import { inArray } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { EncryptionService } from '~/modules/encryption';

const sessionSummaryColumns = {
  sessionId: true,
  title: true,
  initiator: true,
  initiatorType: true,
  agentId: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class SessionService {
  constructor(
    private db: DatabaseService,
    private encryption: EncryptionService,
  ) {}

  private encryptModelApiKey(
    model: Record<string, any> | null | undefined,
  ): Record<string, any> | null | undefined {
    if (!model?.apiKey) return model;
    const { encryptedValue, iv, tag } = this.encryption.encrypt(model.apiKey);
    return { ...model, apiKey: `enc:${iv}:${tag}:${encryptedValue}` };
  }

  static decryptModelApiKey(
    model: Record<string, any> | null | undefined,
    encryption: EncryptionService,
  ): Record<string, any> | null | undefined {
    if (!model?.apiKey) return model;
    const stored: string = model.apiKey;
    if (!stored.startsWith('enc:')) return model; // plaintext (legacy)
    const [, iv, tag, encryptedValue] = stored.split(':');
    return { ...model, apiKey: encryption.decrypt(encryptedValue, iv, tag) };
  }

  private publicModel(model: Record<string, any> | null | undefined) {
    if (!model?.apiKey) return model ?? {};
    const safeModel = { ...model };
    delete safeModel.apiKey;
    return safeModel;
  }

  public async createSession(props: {
    value: InferInsertModel<typeof schema.session>;
    parentSessionId?: string;
  }) {
    const { value, parentSessionId } = props;

    const [session] = await this.db
      .insert(schema.session)
      .values({
        ...value,
        model: this.encryptModelApiKey(value.model as any) as any,
        parentSessionId,
        initiator: value.initiator?.toLowerCase(),
      })
      .returning();

    return session;
  }

  /**
   * Fetch an existing session for this agent and space, or create one.
   * We key by (agentId, spaceId) only — initiator may vary across messages in a space.
   */
  public async getOrCreateAgentSpaceSession(props: {
    agentId: string;
    spaceId: string;
    // Optional initial values for new session
    model?: InferInsertModel<typeof schema.session>['model'];
    initiator?: string | null;
    parentSessionId?: string | null;
    title?: string | null;
  }): Promise<{
    session: InferSelectModel<typeof schema.session>;
    created: boolean;
  }> {
    const { agentId, spaceId, model, initiator, parentSessionId, title } =
      props;

    // Find first session for this agent that already contains the spaceId in spaces.spaceIds
    // Use Postgres JSONB containment (spaces @> { spaceIds: [spaceId] })
    const existing = await this.db.query.session.findFirst({
      where: (t) =>
        and(
          eq(t.agentId, agentId),
          sql`coalesce(${t.spaces}::jsonb, '{}'::jsonb) @> ${JSON.stringify({ spaceIds: [spaceId] })}::jsonb`,
        ),
      orderBy: (t) => t.createdAt,
    });
    if (existing) return { session: existing, created: false };

    const [created] = await this.db
      .insert(schema.session)
      .values({
        sessionId: uuidv4(),
        agentId,
        initiator: initiator ?? `space:${spaceId}`,
        model:
          this.encryptModelApiKey(model as any) ??
          ({ name: 'gpt-5.4-mini' } as any),
        spaces: { spaceIds: [spaceId] },
        parentSessionId: parentSessionId ?? undefined,
        title: title ?? null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    return { session: created, created: true };
  }

  public async getSession(props: { id: string }) {
    const session = await this.db.query.session.findFirst({
      where: (t) => eq(t.sessionId, props.id),
    });

    if (!session) return null;
    //search for sessions where parentSessionId matches the sessionId and return them as child sessions
    const childSessions = await this.db.query.session.findMany({
      where: (t) => eq(t.parentSessionId, props.id),
      columns: sessionSummaryColumns,
      orderBy: (t) => [desc(t.updatedAt), desc(t.createdAt)],
    });
    //return session with child sessions as an array
    const sessionData = {
      ...session,
      childSessions: childSessions || [' No child sessions found'],
    };

    return sessionData;
  }

  public async getSessionsByAgentId(agentId: string) {
    const sessions = await this.db.query.session.findMany({
      where: (t) => eq(t.agentId, agentId),
      columns: sessionSummaryColumns,
      orderBy: (t) => [desc(t.updatedAt), desc(t.createdAt)],
    });
    return sessions;
  }

  public async getSessionWithContent(props: { id: string }) {
    const { id } = props;

    const sessionEntry = await this.db.query.session.findFirst({
      where: (t) => eq(t.sessionId, id),
    });

    if (!sessionEntry) {
      throw new NotFoundException(`Session with ID ${id} not found`);
    }

    // Return history as is, without modifying the roles
    return {
      ...sessionEntry,
      history: sessionEntry.history || [],
      metrics: sessionEntry.metrics || {},
      model: this.publicModel(sessionEntry.model),
      query: sessionEntry.query || {},
    };
  }

  public async getSessionWithGoalsAndTasks(props: { id: string }) {
    const { id } = props;

    const sessionEntry = await this.db.query.session.findFirst({
      where: (t) => eq(t.sessionId, id),
    });

    if (!sessionEntry) {
      throw new NotFoundException(`Session with ID ${id} not found`);
    }

    const spaceIds = Array.isArray(sessionEntry.spaces?.spaceIds)
      ? sessionEntry.spaces.spaceIds
      : [];
    const [tasks, childSessions, spaceDetails] = await Promise.all([
      // Goals are deprecated; tasks remain a flat session-level list.
      this.db.query.task.findMany({
        where: (t) => eq(t.sessionId, id),
        orderBy: (t) => t.createdAt,
      }),
      this.db.query.session.findMany({
        where: (t) => eq(t.parentSessionId, props.id),
        columns: sessionSummaryColumns,
        orderBy: (t) => [desc(t.updatedAt), desc(t.createdAt)],
      }),
      spaceIds.length
        ? this.db.query.space.findMany({
            where: (s) => inArray(s.spaceId, spaceIds),
          })
        : Promise.resolve([]),
    ]);

    // Return history as is, without modifying the roles
    return {
      ...sessionEntry,
      history: sessionEntry.history || [],
      metrics: sessionEntry.metrics || {},
      model: this.publicModel(sessionEntry.model),
      query: sessionEntry.query || {},
      tasks: tasks || [], // Return tasks as flat array (goals are deprecated)
      childSessions: childSessions || [],
      spaces: spaceDetails || [],
    };
  }

  public async updateSession(props: {
    id: string;
    delta: Partial<InferInsertModel<typeof schema.session>>;
  }) {
    const { id, delta } = props;
    const encrypted =
      delta.model !== undefined
        ? {
            ...delta,
            model: this.encryptModelApiKey(delta.model as any) as any,
          }
        : delta;
    const sessionEntry = await this.db
      .update(schema.session)
      .set(encrypted)
      .where(eq(schema.session.sessionId, id))
      .returning();
    return sessionEntry;
  }

  /**
   * Rename a session's title. Returns the updated session (minimal columns).
   */
  public async renameSession(props: { id: string; title: string }) {
    const { id, title } = props;
    const [updated] = await this.db
      .update(schema.session)
      .set({ title, updatedAt: new Date() })
      .where(eq(schema.session.sessionId, id))
      .returning({
        sessionId: schema.session.sessionId,
        title: schema.session.title,
        initiator: schema.session.initiator,
        initiatorType: schema.session.initiatorType,
        agentId: schema.session.agentId,
        createdAt: schema.session.createdAt,
        updatedAt: schema.session.updatedAt,
      });
    if (!updated)
      throw new NotFoundException(`Session with ID ${id} not found`);
    return updated;
  }

  /**
   * Delete a session (and detach any child sessions that referenced it as
   * their parent so we don't leave dangling parentSessionId pointers).
   */
  public async deleteSession(props: { id: string }) {
    const { id } = props;
    await this.db
      .update(schema.session)
      .set({ parentSessionId: null })
      .where(eq(schema.session.parentSessionId, id));
    const [deleted] = await this.db
      .delete(schema.session)
      .where(eq(schema.session.sessionId, id))
      .returning({ sessionId: schema.session.sessionId });
    if (!deleted)
      throw new NotFoundException(`Session with ID ${id} not found`);
    return deleted;
  }

  public async getFullSession(props: { id: string }) {
    const session = await this.getSession(props);
    if (!session) return null;

    // If this is a child session, fetch the parent session
    if (session.parentSessionId) {
      const parentSession = await this.getSession({
        id: session.parentSessionId,
      });
      return {
        ...session,
        parentSession,
      };
    }

    return session;
  }

  /**
   * Get a list of sessions for a specific agent and initiator,
   * returning only sessionId, title, createdAt, and updatedAt for each session.
   * @param props.agentId - The agent's ID.
   * @param props.initiator - The initiator's (user's) address or ID.
   * @returns Array of session objects with selected fields.
   */
  public async getSessionsByInitiator(props: { initiator: string }) {
    const initiator = props.initiator.toLowerCase();
    const sessions = await this.db.query.session.findMany({
      where: (s) => eq(s.initiator, initiator),
      columns: {
        ...sessionSummaryColumns,
      },
      orderBy: (s) => [desc(s.updatedAt), desc(s.createdAt)],
    });
    return sessions;
  }

  public async getSessionsByAgentAndInitiator(props: {
    agentId: string;
    initiator: string;
  }) {
    const { agentId } = props;
    const initiator = props.initiator.toLowerCase();
    const sessions = await this.db.query.session.findMany({
      where: (s) => and(eq(s.agentId, agentId), eq(s.initiator, initiator)),
      columns: {
        ...sessionSummaryColumns,
      },
      orderBy: (s) => [desc(s.updatedAt), desc(s.createdAt)],
    });
    return sessions;
  }
}

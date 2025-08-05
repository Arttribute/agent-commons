import { ATTRIBUTION_ABI } from '#/lib/abis/AttributionABI';
import { ATTRIBUTION_ADDRESS } from '#/lib/addresses';
import { baseSepolia } from '#/lib/baseSepolia';
import {
  forwardRef,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { eq, InferInsertModel, InferSelectModel, sql } from 'drizzle-orm';
import {
  createPublicClient,
  createWalletClient,
  getContract,
  http,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { DatabaseService } from '~/modules/database/database.service';
import * as schema from '#/models/schema';
import { first } from 'lodash';
import { inArray } from 'drizzle-orm';

@Injectable()
export class SessionService {
  constructor(private db: DatabaseService) {}

  public async createSession(props: {
    value: InferInsertModel<typeof schema.session>;
    parentSessionId?: string;
  }) {
    const { value, parentSessionId } = props;

    const [session] = await this.db
      .insert(schema.session)
      .values({
        ...value,
        parentSessionId,
        initiator: value.initiator?.toLowerCase(),
      })
      .returning();

    return session;
  }

  public async getSession(props: { id: string }) {
    const session = await this.db.query.session.findFirst({
      where: (t) => eq(t.sessionId, props.id),
    });

    if (!session) return null;
    //search for sessions where parentSessionId matches the sessionId and return them as child sessions
    const childSessions = await this.db.query.session.findMany({
      where: (t) => eq(t.parentSessionId, props.id),
      orderBy: (t) => t.createdAt,
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
      orderBy: (t) => t.createdAt,
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
      model: sessionEntry.model || {},
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

    // Get all goals for this session
    const goals = await this.db.query.goal.findMany({
      where: (g) => eq(g.sessionId, id),
      orderBy: (g) => g.createdAt,
    });

    // Get all tasks for this session
    const tasks = await this.db.query.task.findMany({
      where: (t) => eq(t.sessionId, id),
      orderBy: (t) => t.createdAt,
    });

    //search for sessions where parentSessionId matches the sessionId and return them as child sessions
    const childSessions = await this.db.query.session.findMany({
      where: (t) => eq(t.parentSessionId, props.id),
      orderBy: (t) => t.createdAt,
    });

    // Return history as is, without modifying the roles
    return {
      ...sessionEntry,
      history: sessionEntry.history || [],
      metrics: sessionEntry.metrics || {},
      model: sessionEntry.model || {},
      query: sessionEntry.query || {},
      goals: goals.map((goal) => ({
        ...goal,
        tasks: tasks.filter((task) => task.goalId === goal.goalId),
      })),
      childSessions: childSessions || [],
      spaces: sessionEntry.spaces || [],
    };
  }

  public async updateSession(props: {
    id: string;
    delta: Partial<InferInsertModel<typeof schema.session>>;
  }) {
    const { id, delta } = props;
    const sessionEntry = await this.db
      .update(schema.session)
      .set(delta)
      .where(eq(schema.session.sessionId, id))
      .returning();
    return sessionEntry;
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
  public async getSessionsByAgentAndInitiator(props: {
    agentId: string;
    initiator: string;
  }) {
    const { agentId, initiator } = props;
    const sessions = await this.db.query.session.findMany({
      where: (s) => eq(s.agentId, agentId) && eq(s.initiator, initiator),
      columns: {
        sessionId: true,
        title: true,
        initiator: true,
        agentId: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: (s) => s.createdAt,
    });
    return sessions;
  }
}

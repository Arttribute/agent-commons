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
import { eq, InferInsertModel, InferSelectModel } from 'drizzle-orm';
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

@Injectable()
export class SessionService {
  constructor(private db: DatabaseService) {}

  public async createSession(props: {
    value: InferInsertModel<typeof schema.session>;
  }) {
    const { value } = props;
    const sessionEntry = await this.db
      .insert(schema.session)
      .values(value)
      .returning()
      .then(first<InferSelectModel<typeof schema.session>>);

    if (!sessionEntry) {
      throw new InternalServerErrorException('Failed to create session');
    }
    return sessionEntry;
  }

  public async getSession(props: { id: string }) {
    const { id } = props;

    const sessionEntry = await this.db.query.session.findFirst({
      where: (t) => eq(t.sessionId, id),
    });
    return sessionEntry;
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
}

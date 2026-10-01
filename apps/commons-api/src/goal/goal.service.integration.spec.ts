import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import * as schema from '#/models/schema';
import { GoalService } from './goal.service';

describe('legacy Goals API', () => {
  let postgres: PGlite;
  let goals: GoalService;

  beforeAll(async () => {
    postgres = new PGlite();
    await postgres.exec(`
      CREATE TABLE agent (agent_id text PRIMARY KEY, owner_user_id text, owner text);
      INSERT INTO agent VALUES ('agent-1', 'user-1', null);
      CREATE TABLE goal (
        goal_id uuid PRIMARY KEY, agent_id text NOT NULL, session_id text,
        title text NOT NULL, description text, status text NOT NULL DEFAULT 'pending',
        priority smallint NOT NULL DEFAULT 0, deadline timestamptz, progress double precision,
        is_auto_generated boolean, metadata jsonb,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamp NOT NULL DEFAULT now(), completed_at timestamptz
      );
      CREATE TABLE task (goal_id uuid, progress real);
    `);
    goals = new GoalService(drizzle(postgres, { schema }) as any);
  });

  afterAll(async () => { await postgres.close(); });

  it('creates and updates an owned goal without inventing a deadline', async () => {
    await expect(goals.create({ agentId: 'agent-1', title: 'Launch the study' }, 'other-user'))
      .rejects.toThrow('Agent not found');
    const created = await goals.create({ agentId: 'agent-1', title: 'Launch the study' }, 'user-1');
    expect(created.deadline).toBeNull();
    expect(created.title).toBe('Launch the study');
    await expect(goals.get(created.goalId, 'other-user')).rejects.toThrow('Agent not found');
    await expect(goals.get('invalid-id', 'user-1')).rejects.toThrow('Invalid goal ID');

    const updated = await goals.updateProgress(created.goalId, 40, 'started', 'user-1');
    expect(updated.progress).toBe(40);
    expect(updated.status).toBe('started');
    const completed = await goals.updateProgress(created.goalId, 100, 'completed', 'user-1');
    expect(completed.completedAt).toBeInstanceOf(Date);
    const reopened = await goals.updateProgress(created.goalId, 40, 'started', 'user-1');
    expect(reopened.completedAt).toBeNull();
    await expect(goals.updateProgress(created.goalId, 150, 'completed', 'user-1'))
      .rejects.toThrow('progress must be between 0 and 100');

    await postgres.query('INSERT INTO task (goal_id, progress) VALUES ($1, 20), ($1, 80)', [created.goalId]);
    await goals.recomputeProgress(created.goalId, 'user-1');
    expect((await goals.get(created.goalId, 'user-1')).progress).toBe(50);
  });
});

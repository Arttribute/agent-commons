import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { A2aService } from './a2a.service';
import { DatabaseService } from '../modules/database/database.service';
import { AgentService } from '../agent/agent.service';
import { of } from 'rxjs';

/* ─── Mock factories ────────────────────────────────────────────────────── */

function makeDb(agentRow?: any, taskRow?: any) {
  const insertValues   = jest.fn().mockResolvedValue(undefined);
  const insert         = jest.fn().mockReturnValue({ values: insertValues });
  const updateWhere    = jest.fn().mockResolvedValue(undefined);
  const updateSet      = jest.fn().mockReturnValue({ where: updateWhere });
  const update         = jest.fn().mockReturnValue({ set: updateSet });

  const query = {
    agent: {
      findFirst: jest.fn().mockResolvedValue(agentRow ?? {
        agentId: 'agent-1', name: 'Test Agent', instructions: 'Be helpful.',
      }),
    },
    a2aTask: {
      findFirst: jest.fn().mockResolvedValue(taskRow ?? null),
    },
  };

  return { insert, update, query, _insertValues: insertValues, _updateSet: updateSet, _updateWhere: updateWhere };
}

function makeAgentService() {
  return {
    runAgent: jest.fn().mockReturnValue(
      of({ type: 'final', payload: { content: 'Hello from agent', sessionId: 'sess-1' } }),
    ),
  };
}

/* ─── Tests ─────────────────────────────────────────────────────────────── */

describe('A2aService', () => {
  let service: A2aService;
  let db: ReturnType<typeof makeDb>;
  let agentService: ReturnType<typeof makeAgentService>;

  const BASE_URL = 'https://api.example.com';

  beforeEach(async () => {
    db           = makeDb();
    agentService = makeAgentService();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        A2aService,
        { provide: DatabaseService, useValue: db },
        { provide: AgentService,    useValue: agentService },
      ],
    }).compile();

    service = module.get(A2aService);
  });

  /* ── getAgentCard ──────────────────────────────────────────────────────── */
  describe('getAgentCard()', () => {
    it('returns a well-formed AgentCard for a known agent', async () => {
      const card = await service.getAgentCard('agent-1', BASE_URL);

      expect(card.name).toBe('Test Agent');
      expect(card.url).toBe(`${BASE_URL}/v1/a2a/agent-1`);
      expect(card.version).toBe('1.0.0');
      expect(card.capabilities.streaming).toBe(true);
      expect(Array.isArray(card.skills)).toBe(true);
    });

    it('throws NotFoundException when agent does not exist', async () => {
      db.query.agent.findFirst = jest.fn().mockResolvedValue(null);

      await expect(service.getAgentCard('ghost-agent', BASE_URL))
        .rejects.toThrow(NotFoundException);
    });

    it('maps a2aSkills from the agent record', async () => {
      db.query.agent.findFirst = jest.fn().mockResolvedValue({
        agentId: 'agent-1',
        name: 'Skilled Agent',
        instructions: null,
        a2aSkills: [
          { id: 'sk-1', name: 'Web Search', description: 'Searches the web', tags: ['search'] },
        ],
      });

      const card = await service.getAgentCard('agent-1', BASE_URL);
      expect(card.skills).toHaveLength(1);
      expect(card.skills[0].id).toBe('sk-1');
      expect(card.skills[0].tags).toContain('search');
    });
  });

  const message = { role: 'user' as const, parts: [{ type: 'text' as const, text: 'Hello!' }] };

  /* ── sendTask ──────────────────────────────────────────────────────────── */
  describe('sendTask()', () => {

    it('inserts a task row with state "submitted"', async () => {
      db.query.a2aTask.findFirst = jest.fn().mockResolvedValue({
        taskId: 'any-id', agentId: 'agent-1', state: 'completed',
        inputMessage: message, outputMessages: [], artifacts: null,
        contextId: null, createdAt: new Date(), updatedAt: new Date(),
      });

      await service.sendTask({ agentId: 'agent-1', message });

      expect(db.insert).toHaveBeenCalled();
      expect(db._insertValues).toHaveBeenCalledWith(
        expect.objectContaining({ agentId: 'agent-1', state: 'submitted' }),
      );
    });

    it('transitions state to "working" then "completed" on success', async () => {
      // updateState is called multiple times; capture calls
      const statesSeen: string[] = [];
      db.update = jest.fn().mockImplementation(() => ({
        set: jest.fn().mockImplementation((v: any) => {
          if (v.state) statesSeen.push(v.state);
          return { where: jest.fn().mockResolvedValue(undefined) };
        }),
      }));

      // buildTaskResponse needs a DB read
      db.query.a2aTask.findFirst = jest.fn().mockResolvedValue({
        taskId: 'task-x', agentId: 'agent-1', state: 'completed',
        inputMessage: message, outputMessages: [], artifacts: null,
        contextId: null, createdAt: new Date(), updatedAt: new Date(),
      });

      await service.sendTask({ agentId: 'agent-1', message });

      expect(statesSeen).toContain('working');
      expect(statesSeen).toContain('completed');
    });

    it('transitions state to "failed" when agentService.runAgent errors', async () => {
      const { throwError } = await import('rxjs');
      agentService.runAgent = jest.fn().mockReturnValue(
        throwError(() => new Error('LLM down')),
      );

      const statesSeen: string[] = [];
      db.update = jest.fn().mockImplementation(() => ({
        set: jest.fn().mockImplementation((v: any) => {
          if (v.state) statesSeen.push(v.state);
          return { where: jest.fn().mockResolvedValue(undefined) };
        }),
      }));

      db.query.a2aTask.findFirst = jest.fn().mockResolvedValue({
        taskId: 'task-x', agentId: 'agent-1', state: 'failed',
        inputMessage: message, outputMessages: [], artifacts: null,
        contextId: null, createdAt: new Date(), updatedAt: new Date(),
      });

      const result = await service.sendTask({ agentId: 'agent-1', message });
      expect(result.status.state).toBe('failed');
      expect(statesSeen).toContain('failed');
    });

    it('uses a caller-provided taskId rather than generating one', async () => {
      const customId = 'my-custom-task-id';

      db.query.a2aTask.findFirst = jest.fn().mockResolvedValue({
        taskId: customId, agentId: 'agent-1', state: 'completed',
        inputMessage: message, outputMessages: [], artifacts: null,
        contextId: null, createdAt: new Date(), updatedAt: new Date(),
      });

      await service.sendTask({ agentId: 'agent-1', taskId: customId, message });

      expect(db._insertValues).toHaveBeenCalledWith(
        expect.objectContaining({ taskId: customId }),
      );
    });
  });

  /* ── cancelTask ────────────────────────────────────────────────────────── */
  describe('cancelTask()', () => {
    it('transitions state to "canceled"', async () => {
      db.query.a2aTask.findFirst = jest.fn().mockResolvedValue({
        taskId: 'task-1', agentId: 'agent-1', state: 'working',
        inputMessage: message, outputMessages: [], artifacts: null, contextId: null, createdAt: new Date(), updatedAt: new Date(),
      });

      const statesSeen: string[] = [];
      db.update = jest.fn().mockImplementation(() => ({
        set: jest.fn().mockImplementation((v: any) => {
          if (v.state) statesSeen.push(v.state);
          return { where: jest.fn().mockResolvedValue(undefined) };
        }),
      }));

      await service.cancelTask('task-1');

      expect(statesSeen).toContain('canceled');
    });

    it('throws NotFoundException when task does not exist', async () => {
      db.query.a2aTask.findFirst = jest.fn().mockResolvedValue(null);

      await expect(service.cancelTask('ghost-task')).rejects.toThrow(NotFoundException);
    });
  });

  /* ── subscriber pub/sub ─────────────────────────────────────────────────── */
  describe('subscriber pub/sub', () => {
    it('delivers events to subscribed callbacks', () => {
      const received: any[] = [];
      (service as any).subscribe('task-1', (e: any) => received.push(e));
      (service as any).emit('task-1', { type: 'status', state: 'working' });

      expect(received).toHaveLength(1);
      expect(received[0]).toMatchObject({ type: 'status', state: 'working' });
    });

    it('does not deliver to unsubscribed callbacks', () => {
      const received: any[] = [];
      const cb = (e: any) => received.push(e);

      (service as any).subscribe('task-1', cb);
      (service as any).unsubscribe('task-1', cb);
      (service as any).emit('task-1', { type: 'status' });

      expect(received).toHaveLength(0);
    });

    it('delivers to multiple subscribers on the same taskId', () => {
      const r1: any[] = [], r2: any[] = [];
      (service as any).subscribe('task-1', (e: any) => r1.push(e));
      (service as any).subscribe('task-1', (e: any) => r2.push(e));
      (service as any).emit('task-1', { type: 'ping' });

      expect(r1).toHaveLength(1);
      expect(r2).toHaveLength(1);
    });

    it('silently ignores emit when no subscribers exist', () => {
      expect(() => (service as any).emit('no-subscribers', { type: 'ping' })).not.toThrow();
    });
  });
});

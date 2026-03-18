/**
 * A2A task-dispatch integration tests
 *
 * Tests the end-to-end task lifecycle: submitted → working → completed/failed,
 * plus streaming (sendSubscribeTask) and cancellation, using mocked DB and a
 * mocked AgentService but allowing the real A2aService logic to run.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { A2aService } from './a2a.service';
import { DatabaseService } from '../modules/database/database.service';
import { AgentService } from '../agent/agent.service';
import { of, throwError } from 'rxjs';

/* ── Factories ──────────────────────────────────────────────────────────── */

const NOW = new Date('2026-01-01T00:00:00.000Z');

function makeDb() {
  const states: string[] = [];
  const insertedRows: any[] = [];

  const insertValues   = jest.fn().mockImplementation((row: any) => { insertedRows.push(row); return Promise.resolve(undefined); });
  const insert         = jest.fn().mockReturnValue({ values: insertValues });

  const updateSet = jest.fn().mockImplementation((v: any) => {
    if (v.state) states.push(v.state);
    return { where: jest.fn().mockResolvedValue(undefined) };
  });
  const update = jest.fn().mockReturnValue({ set: updateSet });

  const query = {
    agent: {
      findFirst: jest.fn().mockResolvedValue({
        agentId: 'agent-1', name: 'Test Agent', instructions: 'Be helpful.',
      }),
    },
    a2aTask: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
  };

  return {
    insert, update, query,
    _states:       states,
    _insertedRows: insertedRows,
    _insertValues: insertValues,
    _updateSet:    updateSet,
  };
}

function makeAgentService(responseText = 'Hello from agent') {
  return {
    runAgent: jest.fn().mockReturnValue(
      of({
        type: 'final',
        payload: { content: responseText, sessionId: 'sess-1' },
      }),
    ),
  };
}

function taskRow(overrides: Partial<Record<string, any>> = {}) {
  return {
    taskId:         'task-1',
    agentId:        'agent-1',
    state:          'completed',
    inputMessage:   { role: 'user', parts: [{ type: 'text', text: 'Hello' }] },
    outputMessages: [],
    artifacts:      null,
    contextId:      null,
    createdAt:      NOW,
    updatedAt:      NOW,
    ...overrides,
  };
}

const userMsg = { role: 'user' as const, parts: [{ type: 'text' as const, text: 'Hello!' }] };

/* ── Tests ─────────────────────────────────────────────────────────────── */

describe('A2A dispatch integration — A2aService', () => {
  let service: A2aService;
  let db: ReturnType<typeof makeDb>;
  let agentService: ReturnType<typeof makeAgentService>;

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

  /* ── Full sendTask lifecycle ────────────────────────────────────────── */
  describe('sendTask() — full lifecycle', () => {
    beforeEach(() => {
      db.query.a2aTask.findFirst = jest.fn().mockResolvedValue(taskRow());
    });

    it('runs the full submitted → working → completed state machine', async () => {
      const result = await service.sendTask({ agentId: 'agent-1', message: userMsg });

      // State machine: insert with 'submitted', then update to 'working', then 'completed'
      expect(db._insertValues).toHaveBeenCalledWith(
        expect.objectContaining({ agentId: 'agent-1', state: 'submitted' }),
      );
      expect(db._states).toEqual(expect.arrayContaining(['working']));
      expect(result.status.state).toBe('completed');
    });

    it('calls dispatchToAgent with the correct agentId and message', async () => {
      await service.sendTask({ agentId: 'agent-1', message: userMsg });

      expect(agentService.runAgent).toHaveBeenCalledWith(
        expect.objectContaining({
          agentId:  'agent-1',
          messages: expect.arrayContaining([
            expect.objectContaining({ role: 'user', content: 'Hello!' }),
          ]),
        }),
      );
    });

    it('includes the callerId as initiator when provided', async () => {
      await service.sendTask({ agentId: 'agent-1', message: userMsg, callerId: 'caller-xyz' });

      expect(agentService.runAgent).toHaveBeenCalledWith(
        expect.objectContaining({ initiator: 'caller-xyz' }),
      );
    });

    it('preserves a caller-supplied taskId', async () => {
      const customId = 'my-task-abc';
      db.query.a2aTask.findFirst = jest.fn().mockResolvedValue(taskRow({ taskId: customId }));

      await service.sendTask({ agentId: 'agent-1', taskId: customId, message: userMsg });

      expect(db._insertValues).toHaveBeenCalledWith(
        expect.objectContaining({ taskId: customId }),
      );
    });
  });

  /* ── Error path ─────────────────────────────────────────────────────── */
  describe('sendTask() — agent failure', () => {
    it('transitions to "failed" when the agent runtime throws', async () => {
      agentService.runAgent = jest.fn().mockReturnValue(
        throwError(() => new Error('LLM timeout')),
      );

      const failedRow = taskRow({ state: 'failed' });
      db.query.a2aTask.findFirst = jest.fn().mockResolvedValue(failedRow);

      const result = await service.sendTask({ agentId: 'agent-1', message: userMsg });

      expect(db._states).toContain('failed');
      expect(result.status.state).toBe('failed');
    });

    it('records the error code in the DB row on failure', async () => {
      agentService.runAgent = jest.fn().mockReturnValue(
        throwError(() => new Error('503 Service unavailable')),
      );

      const errorPayloads: any[] = [];
      db.update = jest.fn().mockReturnValue({
        set: jest.fn().mockImplementation((v: any) => {
          if (v.error) errorPayloads.push(v.error);
          return { where: jest.fn().mockResolvedValue(undefined) };
        }),
      });
      db.query.a2aTask.findFirst = jest.fn().mockResolvedValue(taskRow({ state: 'failed' }));

      await service.sendTask({ agentId: 'agent-1', message: userMsg });

      expect(errorPayloads.length).toBeGreaterThan(0);
      expect(errorPayloads[0]).toHaveProperty('code');
      expect(errorPayloads[0]).toHaveProperty('message');
    });
  });

  /* ── cancelTask ─────────────────────────────────────────────────────── */
  describe('cancelTask()', () => {
    it('transitions a working task to "canceled"', async () => {
      const workingRow = taskRow({ state: 'working' });
      db.query.a2aTask.findFirst = jest.fn()
        .mockResolvedValueOnce(workingRow)   // cancelTask check
        .mockResolvedValue(taskRow({ state: 'canceled' })); // buildTaskResponse

      const captured: string[] = [];
      db.update = jest.fn().mockReturnValue({
        set: jest.fn().mockImplementation((v: any) => {
          if (v.state) captured.push(v.state);
          return { where: jest.fn().mockResolvedValue(undefined) };
        }),
      });

      const result = await service.cancelTask('task-1');
      expect(captured).toContain('canceled');
      expect(result.status.state).toBe('canceled');
    });

    it('throws NotFoundException for a non-existent task', async () => {
      db.query.a2aTask.findFirst = jest.fn().mockResolvedValue(null);
      await expect(service.cancelTask('ghost')).rejects.toThrow(NotFoundException);
    });

    it('throws when attempting to cancel an already-completed task', async () => {
      db.query.a2aTask.findFirst = jest.fn().mockResolvedValue(taskRow({ state: 'completed' }));
      await expect(service.cancelTask('task-1')).rejects.toThrow();
    });
  });

  /* ── SSE pub/sub and sendSubscribeTask ─────────────────────────────── */
  describe('SSE streaming — sendSubscribeTask()', () => {
    it('yields a TaskStatusUpdateEvent for a task that completes synchronously', async () => {
      // Pre-seed the task as completed so the stall-detection DB-poll resolves it
      db.query.a2aTask.findFirst = jest.fn().mockResolvedValue(taskRow({ state: 'completed' }));

      const events: any[] = [];
      const gen = service.sendSubscribeTask({
        agentId:   'agent-1',
        message:   userMsg,
        contextId: 'ctx-1',
      });

      // sendSubscribeTask kicks off sendTask internally; we fire the "complete" event manually
      // by emitting through the internal pub/sub after a tick
      setTimeout(() => {
        (service as any).emit('__internal__', { type: 'close' });
      }, 10);

      // Consume the generator until it closes (up to 3 events max)
      for await (const event of gen) {
        events.push(event);
        if (events.length >= 3) break;
      }

      // At least one event should be a status update or the task event
      expect(events.length).toBeGreaterThan(0);
    });
  });

  /* ── Agent card ─────────────────────────────────────────────────────── */
  describe('getAgentCard()', () => {
    it('returns a valid AgentCard for a known agent', async () => {
      const card = await service.getAgentCard('agent-1', 'https://api.example.com');

      expect(card.name).toBe('Test Agent');
      expect(card.url).toMatch('/v1/a2a/agent-1');
      expect(card.capabilities.streaming).toBe(true);
      expect(Array.isArray(card.skills)).toBe(true);
    });

    it('throws NotFoundException for unknown agent', async () => {
      db.query.agent.findFirst = jest.fn().mockResolvedValue(null);
      await expect(service.getAgentCard('nobody', 'https://api.example.com'))
        .rejects.toThrow(NotFoundException);
    });
  });
});

import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { TaskExecutionService, buildTaskPrompt } from './task-execution.service';
import { DatabaseService } from '../modules/database/database.service';
import { WorkflowService } from '../tool/workflow.service';
import { WorkflowExecutorService } from '../tool/workflow-executor.service';
import { SessionService } from '../session/session.service';
import { TaskSchedulerService } from './task-scheduler.service';
import { AgentService } from '../agent/agent.service';
import { of, throwError } from 'rxjs';

/* ─── Mocks ─────────────────────────────────────────────────────────────── */

function makeDb() {
  return {
    query: {
      task: { findFirst: jest.fn(), findMany: jest.fn() },
      workflowExecution: { findFirst: jest.fn() },
    },
    insert: jest.fn().mockReturnValue({
      values: jest.fn().mockReturnValue({
        returning: jest.fn().mockResolvedValue([{
          taskId: 'task-1', agentId: 'agent-1', sessionId: 'sess-1',
          title: 'Test task', status: 'pending', executionMode: 'single',
          createdBy: 'agent-1', createdByType: 'agent',
          dependsOn: null, workflowId: null, nextRunAt: null, scheduledFor: null,
          cronExpression: null, isRecurring: false,
        }]),
      }),
    }),
    update: jest.fn().mockReturnValue({
      set: jest.fn().mockReturnValue({
        where: jest.fn().mockResolvedValue(undefined),
      }),
    }),
    delete: jest.fn().mockReturnValue({
      where: jest.fn().mockReturnValue({
        returning: jest.fn().mockResolvedValue([{ taskId: 'task-1' }]),
      }),
    }),
  };
}

function makeScheduler() {
  return {
    getNextRunTime: jest.fn().mockReturnValue(null),
    scheduleRun: jest.fn().mockResolvedValue(undefined),
  };
}

function makeAgentService() {
  return {
    runAgent: jest.fn().mockReturnValue(
      of({ type: 'token', content: 'hello' }, { type: 'final', payload: { content: 'Done!' } }),
    ),
  };
}

/* ─── Tests ─────────────────────────────────────────────────────────────── */

describe('TaskExecutionService', () => {
  let service: TaskExecutionService;
  let db: ReturnType<typeof makeDb>;
  let scheduler: ReturnType<typeof makeScheduler>;
  let agentService: ReturnType<typeof makeAgentService>;

  beforeEach(async () => {
    db = makeDb();
    scheduler = makeScheduler();
    agentService = makeAgentService();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TaskExecutionService,
        { provide: DatabaseService,        useValue: db },
        { provide: WorkflowService,        useValue: { getWorkflow: jest.fn().mockResolvedValue({}) } },
        { provide: WorkflowExecutorService, useValue: {} },
        { provide: SessionService,         useValue: { createSession: jest.fn().mockResolvedValue({ sessionId: 'new-sess' }) } },
        { provide: TaskSchedulerService,   useValue: scheduler },
        { provide: AgentService,           useValue: agentService },
      ],
    }).compile();

    service = module.get(TaskExecutionService);
  });

  afterEach(() => jest.clearAllMocks());

  /* ── createTask ──────────────────────────────────────────────────────── */
  describe('createTask()', () => {
    const base = {
      agentId: 'agent-1', sessionId: 'sess-1', title: 'My task',
      createdBy: 'user-1', createdByType: 'user' as const,
    };

    it('inserts a task and always schedules a run', async () => {
      const task = await service.createTask(base);
      expect(task.taskId).toBe('task-1');
      expect(scheduler.scheduleRun).toHaveBeenCalledWith(
        expect.objectContaining({ taskId: 'task-1' }),
      );
    });

    it('immediate tasks get scheduledFor = now (within 1 second)', async () => {
      const before = Date.now();
      await service.createTask(base);
      const call = scheduler.scheduleRun.mock.calls[0][0];
      expect(call.scheduledFor.getTime()).toBeGreaterThanOrEqual(before - 100);
      expect(call.scheduledFor.getTime()).toBeLessThanOrEqual(Date.now() + 100);
    });

    it('uses cronExpression as triggeredBy=cron', async () => {
      await service.createTask({ ...base, cronExpression: '*/5 * * * *', isRecurring: true });
      const call = scheduler.scheduleRun.mock.calls[0][0];
      expect(call.triggeredBy).toBe('cron');
    });

    it('rejects if a dependency task does not exist', async () => {
      db.query.task.findFirst = jest.fn().mockResolvedValue(null);
      await expect(
        service.createTask({ ...base, dependsOn: ['nonexistent'] }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  /* ── executeTask (single mode) ───────────────────────────────────────── */
  describe('executeTask() — single mode', () => {
    const pendingTask = {
      taskId: 'task-1', agentId: 'agent-1', sessionId: 'sess-1',
      title: 'Do something', description: 'Details here',
      status: 'pending', executionMode: 'single',
      workflowId: null, dependsOn: null,
      createdBy: 'user-1', createdByType: 'user',
      context: { objective: 'write a poem', expectedOutputType: 'text' },
      tools: null, toolInstructions: null,
    };

    beforeEach(() => {
      db.query.task.findFirst = jest.fn().mockResolvedValue(pendingTask);
    });

    it('marks task as running, calls runAgent, then marks completed', async () => {
      const result = await service.executeTask('task-1');

      expect(result.status).toBe('completed');
      expect(agentService.runAgent).toHaveBeenCalledWith(
        expect.objectContaining({ agentId: 'agent-1', sessionId: 'sess-1' }),
      );
      // Check the message contains the task title
      const msg = agentService.runAgent.mock.calls[0][0].messages[0].content as string;
      expect(msg).toContain('Do something');
      expect(msg).toContain('⫷⫷TASK_EXECUTION⫸⫸');
    });

    it('marks task as failed when runAgent throws', async () => {
      agentService.runAgent = jest.fn().mockReturnValue(
        throwError(() => new Error('LLM error')),
      );

      const result = await service.executeTask('task-1');
      expect(result.status).toBe('failed');
      expect(result.errorMessage).toBe('LLM error');
    });

    it('returns failed immediately if task is already running', async () => {
      db.query.task.findFirst = jest.fn().mockResolvedValue({ ...pendingTask, status: 'running' });
      const result = await service.executeTask('task-1');
      expect(result.status).toBe('failed');
      expect(result.errorMessage).toMatch(/already running/i);
      expect(agentService.runAgent).not.toHaveBeenCalled();
    });

    it('returns failed if dependencies are not completed', async () => {
      db.query.task.findFirst = jest.fn()
        .mockResolvedValueOnce({ ...pendingTask, dependsOn: ['dep-task-1'] })
        .mockResolvedValueOnce({ taskId: 'dep-task-1', status: 'pending' }); // dep not done

      const result = await service.executeTask('task-1');
      expect(result.status).toBe('failed');
      expect(result.errorMessage).toMatch(/dependencies/i);
    });

    it('throws NotFoundException if task not found', async () => {
      db.query.task.findFirst = jest.fn().mockResolvedValue(null);
      const result = await service.executeTask('missing');
      expect(result.status).toBe('failed');
      expect(result.errorMessage).toMatch(/not found/i);
    });
  });

  /* ── cancelTask ──────────────────────────────────────────────────────── */
  describe('cancelTask()', () => {
    it('updates status to cancelled', async () => {
      db.query.workflowExecution = { findMany: jest.fn().mockResolvedValue([]) } as any;
      const result = await service.cancelTask('task-1');
      expect(result.success).toBe(true);
    });
  });

  /* ── listSessionTasks ────────────────────────────────────────────────── */
  describe('listSessionTasks()', () => {
    it('queries tasks by sessionId', async () => {
      db.query.task.findMany = jest.fn().mockResolvedValue([{ taskId: 't1' }]);
      const tasks = await service.listSessionTasks('sess-1');
      expect(tasks).toHaveLength(1);
      expect(db.query.task.findMany).toHaveBeenCalled();
    });
  });
});

/* ─── buildTaskPrompt ────────────────────────────────────────────────────── */
describe('buildTaskPrompt()', () => {
  it('includes task title and TASK_EXECUTION marker', () => {
    const prompt = buildTaskPrompt({
      taskId: 'task-1',
      title: 'Analyse this dataset',
    });
    expect(prompt).toContain('⫷⫷TASK_EXECUTION⫸⫸');
    expect(prompt).toContain('Analyse this dataset');
    expect(prompt).toContain('task-1');
  });

  it('includes context fields when present', () => {
    const prompt = buildTaskPrompt({
      taskId: 'task-2',
      title: 'Write a poem',
      context: {
        objective: 'write a haiku about snow',
        expectedOutputType: 'text',
        constraints: ['5-7-5 syllables'],
        evaluationCriteria: ['haiku format'],
        reasoningStrategy: 'be creative',
      },
    });
    expect(prompt).toContain('haiku about snow');
    expect(prompt).toContain('5-7-5 syllables');
    expect(prompt).toContain('haiku format');
    expect(prompt).toContain('be creative');
  });

  it('includes tool hints when provided', () => {
    const prompt = buildTaskPrompt({
      taskId: 'task-3',
      title: 'Fetch data',
      tools: ['web_search', 'http_request'],
      toolInstructions: 'Always verify the source',
    });
    expect(prompt).toContain('web_search');
    expect(prompt).toContain('Always verify the source');
  });
});

import { Test, TestingModule } from '@nestjs/testing';
import { TaskSchedulerService } from './task-scheduler.service';
import { DatabaseService } from '../modules/database/database.service';
import { TaskExecutionService } from './task-execution.service';

/* ─── Helpers ───────────────────────────────────────────────────────────── */

function makeDb() {
  const insertValues = jest.fn().mockResolvedValue(undefined);
  const insert       = jest.fn().mockReturnValue({ values: insertValues });

  const updateSet = jest.fn().mockReturnValue({
    where: jest.fn().mockReturnValue({ returning: jest.fn().mockResolvedValue([{ runId: 'run-1', status: 'running' }]) }),
  });
  const update = jest.fn().mockReturnValue({ set: updateSet });

  const findMany = jest.fn().mockResolvedValue([]);
  const findFirst = jest.fn().mockResolvedValue(null);
  const query = {
    scheduledTaskRun: { findMany, findFirst },
    task: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn().mockResolvedValue(null) },
  };

  return { insert, update, query, _insertValues: insertValues, _updateSet: updateSet, _findMany: findMany };
}

function makeTaskExecution() {
  return { executeTask: jest.fn().mockResolvedValue(undefined) };
}

/* ─── Tests ─────────────────────────────────────────────────────────────── */

describe('TaskSchedulerService', () => {
  let service: TaskSchedulerService;
  let db: ReturnType<typeof makeDb>;
  let taskExecution: ReturnType<typeof makeTaskExecution>;

  beforeEach(async () => {
    db            = makeDb();
    taskExecution = makeTaskExecution();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TaskSchedulerService,
        { provide: DatabaseService,      useValue: db },
        { provide: TaskExecutionService, useValue: taskExecution },
      ],
    }).compile();

    service = module.get(TaskSchedulerService);

    // Prevent real polling timers from firing during tests
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    (service as any).stopPolling?.();
  });

  /* ── scheduleRun ──────────────────────────────────────────────────────── */
  describe('scheduleRun()', () => {
    it('inserts a scheduledTaskRun row with the given params', async () => {
      const scheduledFor = new Date(Date.now() + 60_000);
      await service.scheduleRun({ taskId: 'task-1', scheduledFor, triggeredBy: 'cron' });

      expect(db.insert).toHaveBeenCalled();
      expect(db._insertValues).toHaveBeenCalledWith(
        expect.objectContaining({
          taskId:      'task-1',
          scheduledFor,
          triggeredBy: 'cron',
          status:      'pending',
        }),
      );
    });

    it('defaults triggeredBy to "cron" when not provided', async () => {
      await service.scheduleRun({ taskId: 'task-1', scheduledFor: new Date() });
      expect(db._insertValues).toHaveBeenCalledWith(
        expect.objectContaining({ triggeredBy: 'cron' }),
      );
    });
  });

  /* ── getNextRunTime ───────────────────────────────────────────────────── */
  describe('getNextRunTime()', () => {
    it('returns a future Date for a valid cron expression', () => {
      const result = service.getNextRunTime('* * * * *');
      expect(result).toBeInstanceOf(Date);
      expect(result!.getTime()).toBeGreaterThan(Date.now() - 1000);
    });

    it('returns null for an invalid expression', () => {
      const result = service.getNextRunTime('not-valid-cron');
      expect(result).toBeNull();
    });
  });

  /* ── executeRun (private — tested via poll) ───────────────────────────── */
  describe('poll / executeRun', () => {
    it('skips execution when claiming the row returns no rows (another instance won)', async () => {
      const dueRun = { runId: 'run-1', taskId: 'task-1', status: 'pending', scheduledFor: new Date(Date.now() - 1000) };

      db.query.scheduledTaskRun.findMany = jest.fn().mockResolvedValue([dueRun]);
      // Simulate "already claimed" — update returns nothing
      db.update = jest.fn().mockReturnValue({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({ returning: jest.fn().mockResolvedValue([]) }),
        }),
      });

      // Call poll directly
      await (service as any).poll();

      expect(taskExecution.executeTask).not.toHaveBeenCalled();
    });

    it('marks run as completed after successful executeTask', async () => {
      const dueRun = { runId: 'run-1', taskId: 'task-1', status: 'pending', scheduledFor: new Date(Date.now() - 1000), sessionId: null };

      db.query.scheduledTaskRun.findMany = jest.fn().mockResolvedValue([dueRun]);
      db.query.task.findFirst = jest.fn().mockResolvedValue({ taskId: 'task-1', isRecurring: false });

      const updateWhere  = jest.fn().mockResolvedValue(undefined);
      const updateSet    = jest.fn().mockReturnValue({ where: updateWhere });
      const claimReturning = jest.fn().mockResolvedValue([{ runId: 'run-1', status: 'running' }]);
      const claimWhere   = jest.fn().mockReturnValue({ returning: claimReturning });
      const claimSet     = jest.fn().mockReturnValue({ where: claimWhere });

      let callCount = 0;
      db.update = jest.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) return { set: claimSet };         // claim
        return { set: updateSet };                             // complete / nextRunAt
      });

      await (service as any).poll();

      expect(taskExecution.executeTask).toHaveBeenCalledWith('task-1');
      expect(updateSet).toHaveBeenCalledWith(expect.objectContaining({ status: 'completed' }));
    });

    it('marks run as failed when executeTask throws', async () => {
      const dueRun = { runId: 'run-1', taskId: 'task-1', status: 'pending', scheduledFor: new Date(Date.now() - 1000), sessionId: null };

      db.query.scheduledTaskRun.findMany = jest.fn().mockResolvedValue([dueRun]);
      taskExecution.executeTask = jest.fn().mockRejectedValue(new Error('boom'));

      const updateWhere    = jest.fn().mockResolvedValue(undefined);
      const updateSet      = jest.fn().mockReturnValue({ where: updateWhere });
      const claimReturning = jest.fn().mockResolvedValue([{ runId: 'run-1', status: 'running' }]);
      const claimWhere     = jest.fn().mockReturnValue({ returning: claimReturning });
      const claimSet       = jest.fn().mockReturnValue({ where: claimWhere });

      let callCount = 0;
      db.update = jest.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) return { set: claimSet };
        return { set: updateSet };
      });

      await (service as any).poll();

      expect(updateSet).toHaveBeenCalledWith(expect.objectContaining({ status: 'failed', errorMessage: 'boom' }));
    });

    it('schedules the next run for a recurring task after completion', async () => {
      const dueRun = { runId: 'run-1', taskId: 'task-1', status: 'pending', scheduledFor: new Date(Date.now() - 1000), sessionId: null };

      db.query.scheduledTaskRun.findMany = jest.fn().mockResolvedValue([dueRun]);
      db.query.task.findFirst = jest.fn().mockResolvedValue({
        taskId: 'task-1', isRecurring: true, cronExpression: '0 * * * *',
      });

      const scheduleSpy = jest.spyOn(service, 'scheduleRun').mockResolvedValue(undefined);

      const updateWhere    = jest.fn().mockResolvedValue(undefined);
      const updateSet      = jest.fn().mockReturnValue({ where: updateWhere });
      const claimReturning = jest.fn().mockResolvedValue([{ runId: 'run-1', status: 'running' }]);
      const claimWhere     = jest.fn().mockReturnValue({ returning: claimReturning });
      const claimSet       = jest.fn().mockReturnValue({ where: claimWhere });

      let callCount = 0;
      db.update = jest.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) return { set: claimSet };
        return { set: updateSet };
      });

      await (service as any).poll();

      expect(scheduleSpy).toHaveBeenCalledWith(
        expect.objectContaining({ taskId: 'task-1', triggeredBy: 'cron' }),
      );
    });
  });

  /* ── concurrent poll guard ─────────────────────────────────────────────── */
  describe('concurrent poll guard', () => {
    it('does not overlap polls when already running', async () => {
      (service as any).running = true;
      await (service as any).poll();
      expect(db.query.scheduledTaskRun.findMany).not.toHaveBeenCalled();
    });
  });
});

import { Test, TestingModule } from '@nestjs/testing';
import { TaskService } from './task.service';
import { DatabaseService } from '~/modules/database/database.service';
import { NotFoundException } from '@nestjs/common';

describe('TaskService', () => {
  let service: TaskService;
  let mockDb: any;

  const mockTaskContext = {
    objective: 'Test objective',
    inputs: { test: 'data' },
    expectedOutputType: 'text' as const,
  };

  const mockTask = {
    taskId: 'task-123',
    agentId: 'agent-123',
    sessionId: 'session-123',
    title: 'Test Task',
    description: 'Test description',
    context: mockTaskContext,
    tools: ['tool-1'],
    priority: 5,
    status: 'pending',
    progress: 0,
    dependsOn: [],
    createdBy: 'agent-123',
    createdByType: 'agent',
    createdAt: new Date(),
  };

  beforeEach(async () => {
    mockDb = {
      insert: jest.fn().mockReturnThis(),
      values: jest.fn().mockResolvedValue(undefined),
      query: {
        task: {
          findFirst: jest.fn(),
          findMany: jest.fn(),
        },
      },
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TaskService,
        {
          provide: DatabaseService,
          useValue: mockDb,
        },
      ],
    }).compile();

    service = module.get<TaskService>(TaskService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create a task successfully', async () => {
      mockDb.query.task.findFirst.mockResolvedValue(mockTask);

      const createDto = {
        agentId: 'agent-123',
        sessionId: 'session-123',
        title: 'Test Task',
        description: 'Test description',
        context: mockTaskContext,
        tools: ['tool-1'],
        priority: 5,
      };

      const result = await service.create(createDto);

      expect(result).toBeDefined();
      expect(mockDb.insert).toHaveBeenCalled();
    });

    it('should create task with dependencies', async () => {
      mockDb.query.task.findFirst.mockResolvedValue({
        ...mockTask,
        dependsOn: ['task-456'],
      });

      const createDto = {
        agentId: 'agent-123',
        sessionId: 'session-123',
        title: 'Dependent Task',
        description: 'Task with dependencies',
        context: mockTaskContext,
        tools: ['tool-1'],
        dependencyTaskIds: ['task-456'],
      };

      const result = await service.create(createDto);

      expect(result).toBeDefined();
      expect(result.dependsOn).toContain('task-456');
    });

    it('should create recurring task', async () => {
      mockDb.query.task.findFirst.mockResolvedValue({
        ...mockTask,
        isRecurring: true,
      });

      const createDto = {
        agentId: 'agent-123',
        sessionId: 'session-123',
        title: 'Recurring Task',
        description: 'Task that repeats',
        context: mockTaskContext,
        tools: ['tool-1'],
        isRecurring: true,
      };

      const result = await service.create(createDto);

      expect(result).toBeDefined();
      expect(result.isRecurring).toBe(true);
    });
  });

  describe('getNextExecutable', () => {
    it('should return task with no dependencies', async () => {
      mockDb.query.task.findMany.mockResolvedValue([mockTask]);

      const result = await service.getNextExecutable('agent-123', 'session-123');

      expect(result).toBeDefined();
      expect(result).not.toBeNull();
      expect(result!.taskId).toBe('task-123');
    });

    it('should return task with completed dependencies', async () => {
      const dependentTask = {
        ...mockTask,
        taskId: 'task-456',
        dependsOn: ['task-123'],
      };

      const completedDependency = {
        ...mockTask,
        taskId: 'task-123',
        status: 'completed',
      };

      mockDb.query.task.findMany
        .mockResolvedValueOnce([dependentTask])
        .mockResolvedValueOnce([completedDependency]);

      const result = await service.getNextExecutable('agent-123', 'session-123');

      expect(result).toBeDefined();
      expect(result).not.toBeNull();
      expect(result!.taskId).toBe('task-456');
    });

    it('should skip task with incomplete dependencies', async () => {
      const task1 = {
        ...mockTask,
        taskId: 'task-1',
        dependsOn: ['task-dep'],
      };

      const task2 = {
        ...mockTask,
        taskId: 'task-2',
        dependsOn: [],
      };

      const incompleteDependency = {
        ...mockTask,
        taskId: 'task-dep',
        status: 'started',
      };

      mockDb.query.task.findMany
        .mockResolvedValueOnce([task1, task2])
        .mockResolvedValueOnce([incompleteDependency]);

      const result = await service.getNextExecutable('agent-123', 'session-123');

      expect(result).toBeDefined();
      expect(result!.taskId).toBe('task-2'); // Should return task without dependencies
    });

    it('should return null when no executable tasks', async () => {
      const blockedTask = {
        ...mockTask,
        dependsOn: ['task-dep'],
      };

      const incompleteDependency = {
        ...mockTask,
        taskId: 'task-dep',
        status: 'started',
      };

      mockDb.query.task.findMany
        .mockResolvedValueOnce([blockedTask])
        .mockResolvedValueOnce([incompleteDependency]);

      const result = await service.getNextExecutable('agent-123', 'session-123');

      expect(result).toBeNull();
    });

    it('should skip completed and failed tasks', async () => {
      const tasks = [
        { ...mockTask, taskId: 'task-1', status: 'completed' },
        { ...mockTask, taskId: 'task-2', status: 'failed' },
        { ...mockTask, taskId: 'task-3', status: 'pending' },
      ];

      mockDb.query.task.findMany.mockResolvedValue([tasks[2]]); // Only pending task

      const result = await service.getNextExecutable('agent-123', 'session-123');

      expect(result).toBeDefined();
      expect(result!.taskId).toBe('task-3');
    });

    it('should respect task priority', async () => {
      const lowPriorityTask = {
        ...mockTask,
        taskId: 'task-low',
        priority: 1,
      };

      const highPriorityTask = {
        ...mockTask,
        taskId: 'task-high',
        priority: 10,
      };

      // findMany should return tasks ordered by priority desc
      mockDb.query.task.findMany.mockResolvedValue([
        highPriorityTask,
        lowPriorityTask,
      ]);

      const result = await service.getNextExecutable('agent-123', 'session-123');

      expect(result).toBeDefined();
      expect(result!.taskId).toBe('task-high');
    });

    it('should handle multiple dependencies correctly', async () => {
      const taskWithMultipleDeps = {
        ...mockTask,
        taskId: 'task-multi',
        dependsOn: ['dep-1', 'dep-2', 'dep-3'],
      };

      const dependencies = [
        { taskId: 'dep-1', status: 'completed' },
        { taskId: 'dep-2', status: 'completed' },
        { taskId: 'dep-3', status: 'completed' },
      ];

      mockDb.query.task.findMany
        .mockResolvedValueOnce([taskWithMultipleDeps])
        .mockResolvedValueOnce(dependencies);

      const result = await service.getNextExecutable('agent-123', 'session-123');

      expect(result).toBeDefined();
      expect(result!.taskId).toBe('task-multi');
    });

    it('should block task if any dependency is incomplete', async () => {
      const taskWithMultipleDeps = {
        ...mockTask,
        taskId: 'task-multi',
        dependsOn: ['dep-1', 'dep-2', 'dep-3'],
      };

      const dependencies = [
        { taskId: 'dep-1', status: 'completed' },
        { taskId: 'dep-2', status: 'started' }, // One incomplete
        { taskId: 'dep-3', status: 'completed' },
      ];

      mockDb.query.task.findMany
        .mockResolvedValueOnce([taskWithMultipleDeps])
        .mockResolvedValueOnce(dependencies);

      const result = await service.getNextExecutable('agent-123', 'session-123');

      expect(result).toBeNull();
    });
  });

  describe('get', () => {
    it('should return a task by ID', async () => {
      mockDb.query.task.findFirst.mockResolvedValue(mockTask);

      const result = await service.get('task-123');

      expect(result).toBeDefined();
      expect(result.taskId).toBe('task-123');
    });

    it('should throw NotFoundException when task not found', async () => {
      mockDb.query.task.findFirst.mockResolvedValue(null);

      await expect(service.get('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('start', () => {
    it('should update task status to started', async () => {
      await service.start('task-123');

      expect(mockDb.update).toHaveBeenCalled();
      expect(mockDb.set).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'started',
          actualStart: expect.any(Date),
        }),
      );
    });
  });

  describe('updateProgress', () => {
    it('should update task progress', async () => {
      mockDb.query.task.findFirst.mockResolvedValue(mockTask);

      await service.updateProgress(
        'task-123',
        50,
        'started',
        '',
        '',
        mockTaskContext,
      );

      expect(mockDb.update).toHaveBeenCalled();
    });

    it('should set completion timestamp when completed', async () => {
      mockDb.query.task.findFirst.mockResolvedValue(mockTask);

      await service.updateProgress(
        'task-123',
        100,
        'completed',
        'Result content',
        'Task summary',
        mockTaskContext,
      );

      expect(mockDb.set).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'completed',
          progress: 100,
          actualEnd: expect.any(Date),
          completedAt: expect.any(Date),
        }),
      );
    });

    it('should preserve existing context fields', async () => {
      const existingContext = {
        objective: 'Original objective',
        inputs: { original: 'data' },
        references: ['ref1', 'ref2'],
        expectedOutputType: 'text' as const,
      };

      mockDb.query.task.findFirst.mockResolvedValue({
        ...mockTask,
        context: existingContext,
      });

      const partialUpdate = {
        objective: 'Updated objective',
        inputs: {},
        expectedOutputType: 'text' as const,
      };

      await service.updateProgress(
        'task-123',
        50,
        'started',
        '',
        '',
        partialUpdate,
      );

      expect(mockDb.set).toHaveBeenCalledWith(
        expect.objectContaining({
          context: expect.objectContaining({
            objective: 'Updated objective',
            references: ['ref1', 'ref2'], // Should preserve
          }),
        }),
      );
    });

    it('should throw NotFoundException when task not found', async () => {
      mockDb.query.task.findFirst.mockResolvedValue(null);

      await expect(
        service.updateProgress(
          'nonexistent',
          50,
          'started',
          '',
          '',
          mockTaskContext,
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });
});

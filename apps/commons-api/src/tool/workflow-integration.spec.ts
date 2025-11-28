import { Test, TestingModule } from '@nestjs/testing';
import { WorkflowService } from './workflow.service';
import { WorkflowExecutorService } from './workflow-executor.service';
import { TaskService } from '../task/task.service';
import { ToolAccessService } from './tool-access.service';
import { ToolLoaderService } from './tool-loader.service';
import { DatabaseService } from '~/modules/database/database.service';
import { Logger } from '@nestjs/common';

/**
 * Integration tests for the complete workflow, task, and tool orchestration system
 * These tests verify the end-to-end flow of:
 * 1. Creating workflows
 * 2. Creating tasks with workflow execution mode
 * 3. Executing workflows with proper data flow between nodes
 * 4. Task dependency resolution
 * 5. Tool access control and key management
 */
describe('Workflow Integration Tests', () => {
  let workflowService: WorkflowService;
  let workflowExecutor: WorkflowExecutorService;
  let taskService: TaskService;
  let toolAccessService: ToolAccessService;
  let mockDb: any;

  beforeEach(async () => {
    // Create comprehensive mock database
    mockDb = {
      insert: jest.fn().mockReturnThis(),
      values: jest.fn().mockReturnThis(),
      returning: jest.fn(),
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      delete: jest.fn().mockReturnThis(),
      query: {
        workflow: {
          findFirst: jest.fn(),
          findMany: jest.fn(),
        },
        workflowExecution: {
          findFirst: jest.fn(),
          findMany: jest.fn(),
        },
        task: {
          findFirst: jest.fn(),
          findMany: jest.fn(),
        },
        tool: {
          findFirst: jest.fn(),
          findMany: jest.fn(),
        },
        toolPermission: {
          findFirst: jest.fn(),
          findMany: jest.fn(),
        },
        toolKey: {
          findFirst: jest.fn(),
          findMany: jest.fn(),
        },
      },
    };

    const mockToolLoader = {
      loadToolsForAgent: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkflowService,
        WorkflowExecutorService,
        TaskService,
        ToolAccessService,
        {
          provide: DatabaseService,
          useValue: mockDb,
        },
        {
          provide: ToolLoaderService,
          useValue: mockToolLoader,
        },
      ],
    }).compile();

    workflowService = module.get<WorkflowService>(WorkflowService);
    workflowExecutor =
      module.get<WorkflowExecutorService>(WorkflowExecutorService);
    taskService = module.get<TaskService>(TaskService);
    toolAccessService = module.get<ToolAccessService>(ToolAccessService);

    // Suppress logger during tests
    jest.spyOn(Logger.prototype, 'log').mockImplementation();
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
    jest.spyOn(Logger.prototype, 'debug').mockImplementation();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
  });

  describe('Complete Workflow Lifecycle', () => {
    it('should create workflow, execute it, and track execution', async () => {
      // Step 1: Create a workflow
      const workflowDefinition = {
        startNodeId: 'fetch-data',
        endNodeId: 'save-result',
        nodes: [
          {
            id: 'fetch-data',
            type: 'tool' as const,
            position: { x: 0, y: 0 },
            toolId: 'http-get-tool',
            config: { url: 'https://api.example.com/data' },
          },
          {
            id: 'process-data',
            type: 'tool' as const,
            position: { x: 100, y: 0 },
            toolId: 'json-parser-tool',
            config: {},
          },
          {
            id: 'save-result',
            type: 'tool' as const,
            position: { x: 200, y: 0 },
            toolId: 'database-insert-tool',
            config: {},
          },
        ],
        edges: [
          {
            source: 'fetch-data',
            target: 'process-data',
            mapping: { body: 'input' },
          },
          {
            source: 'process-data',
            target: 'save-result',
            mapping: { parsed: 'data' },
          },
        ],
      };

      const createdWorkflow = {
        workflowId: 'wf-123',
        name: 'Data Processing Pipeline',
        definition: workflowDefinition,
        ownerId: 'user-123',
        ownerType: 'user',
        isPublic: false,
        createdAt: new Date(),
      };

      mockDb.returning.mockResolvedValue([createdWorkflow]);
      mockDb.query.workflow.findFirst.mockResolvedValue(createdWorkflow);

      const workflow = await workflowService.createWorkflow({
        name: 'Data Processing Pipeline',
        definition: workflowDefinition,
        ownerId: 'user-123',
        ownerType: 'user',
      });

      expect(workflow).toBeDefined();
      expect(workflow.workflowId).toBe('wf-123');

      // Step 2: Execute the workflow
      const execution = {
        executionId: 'exec-123',
        workflowId: 'wf-123',
        agentId: 'agent-123',
        status: 'running',
        startedAt: new Date(),
        nodeResults: {},
      };

      mockDb.returning.mockResolvedValue([execution]);

      const executionId = await workflowExecutor.executeWorkflow({
        workflowId: 'wf-123',
        agentId: 'agent-123',
        sessionId: 'session-123',
        inputData: { userId: 'user-123' },
      });

      expect(executionId).toBe('exec-123');
      expect(mockDb.insert).toHaveBeenCalled();

      // Step 3: Check execution status
      const executionStatus = {
        ...execution,
        status: 'completed',
        completedAt: new Date(),
        outputData: { result: 'success' },
      };

      mockDb.query.workflowExecution.findFirst.mockResolvedValue(
        executionStatus,
      );

      const status = await workflowExecutor.getExecutionStatus('exec-123');

      expect(status).toBeDefined();
      expect(status.status).toBe('completed');
    });

    it('should handle workflow with parallel branches', async () => {
      // Workflow with parallel data fetching followed by merge
      const parallelWorkflow = {
        startNodeId: 'start',
        endNodeId: 'merge',
        nodes: [
          { id: 'start', position: { x: 0, y: 0 }, type: 'tool' as const, toolId: 'trigger-tool' },
          { id: 'fetch-api1', position: { x: 0, y: 0 }, type: 'tool' as const, toolId: 'http-get-tool' },
          { id: 'fetch-api2', position: { x: 0, y: 0 }, type: 'tool' as const, toolId: 'http-get-tool' },
          { id: 'fetch-api3', position: { x: 0, y: 0 }, type: 'tool' as const, toolId: 'http-get-tool' },
          { id: 'merge', position: { x: 0, y: 0 }, type: 'tool' as const, toolId: 'merge-tool' },
        ],
        edges: [
          { id: 'edge-1', source: 'start', target: 'fetch-api1' },
          { id: 'edge-1', source: 'start', target: 'fetch-api2' },
          { id: 'edge-1', source: 'start', target: 'fetch-api3' },
          { id: 'edge-1', source: 'fetch-api1', target: 'merge', mapping: { data: 'data1' } },
          { id: 'edge-1', source: 'fetch-api2', target: 'merge', mapping: { data: 'data2' } },
          { id: 'edge-1', source: 'fetch-api3', target: 'merge', mapping: { data: 'data3' } },
        ],
      };

      const created = {
        workflowId: 'wf-parallel',
        definition: parallelWorkflow,
        ownerId: 'user-123',
        ownerType: 'user',
      };

      mockDb.returning.mockResolvedValue([created]);

      const workflow = await workflowService.createWorkflow({
        name: 'Parallel Data Fetch',
        definition: parallelWorkflow,
        ownerId: 'user-123',
        ownerType: 'user',
      });

      expect(workflow).toBeDefined();

      // Verify topological sort handles parallel branches
      const executionOrder = (workflowExecutor as any).topologicalSort(
        parallelWorkflow.nodes,
        parallelWorkflow.edges,
      );

      expect(executionOrder[0]).toBe('start');
      expect(executionOrder[executionOrder.length - 1]).toBe('merge');
      expect(executionOrder).toContain('fetch-api1');
      expect(executionOrder).toContain('fetch-api2');
      expect(executionOrder).toContain('fetch-api3');
    });
  });

  describe('Task and Workflow Integration', () => {
    it('should create task with workflow execution mode', async () => {
      const workflowTask = {
        taskId: 'task-123',
        agentId: 'agent-123',
        sessionId: 'session-123',
        title: 'Execute Data Pipeline',
        description: 'Run the data processing workflow',
        executionMode: 'workflow',
        workflowId: 'wf-123',
        workflowInputs: { id: 'edge-1', source: 'api' },
        status: 'pending',
        progress: 0,
        context: {
          objective: 'Process external data',
          inputs: { id: 'edge-1', source: 'api' },
          expectedOutputType: 'text' as const,
        },
        tools: [],
      };

      mockDb.query.task.findFirst.mockResolvedValue(workflowTask);

      const task = await taskService.create({
        agentId: 'agent-123',
        sessionId: 'session-123',
        title: 'Execute Data Pipeline',
        description: 'Run the data processing workflow',
        context: {
          objective: 'Process external data',
          inputs: { id: 'edge-1', source: 'api' },
          expectedOutputType: 'text',
        },
        tools: [],
      });

      expect(task).toBeDefined();
      expect(task.taskId).toBe('task-123');
    });

    it('should handle task dependencies correctly', async () => {
      const task1 = {
        taskId: 'task-1',
        agentId: 'agent-123',
        sessionId: 'session-123',
        title: 'Prepare Data',
        status: 'completed',
        dependsOn: [],
        context: {
          objective: 'Prepare data',
          inputs: {},
          expectedOutputType: 'text' as const,
        },
      };

      const task2 = {
        taskId: 'task-2',
        agentId: 'agent-123',
        sessionId: 'session-123',
        title: 'Process Data',
        status: 'pending',
        dependsOn: ['task-1'],
        context: {
          objective: 'Process data',
          inputs: {},
          expectedOutputType: 'text' as const,
        },
      };

      const task3 = {
        taskId: 'task-3',
        agentId: 'agent-123',
        sessionId: 'session-123',
        title: 'Generate Report',
        status: 'pending',
        dependsOn: ['task-2'],
        context: {
          objective: 'Generate report',
          inputs: {},
          expectedOutputType: 'text' as const,
        },
      };

      // Simulate task execution sequence
      mockDb.query.task.findMany
        .mockResolvedValueOnce([task2, task3]) // Initial query
        .mockResolvedValueOnce([task1]) // Check task-2 dependencies
        .mockResolvedValueOnce([task3]) // After task-2 completes
        .mockResolvedValueOnce([task2]); // Check task-3 dependencies

      // Get next executable task (should be task-2 since task-1 is completed)
      const nextTask = await taskService.getNextExecutable(
        'agent-123',
        'session-123',
      );

      expect(nextTask).toBeDefined();
      expect(nextTask).not.toBeNull();
      expect(nextTask!.taskId).toBe('task-2');
    });

    it('should handle complex dependency graph', async () => {
      // Diamond dependency pattern
      //     A
      //    / \
      //   B   C
      //    \ /
      //     D
      const tasks = [
        {
          taskId: 'task-A',
          status: 'completed',
          dependsOn: [],
          agentId: 'agent-123',
          sessionId: 'session-123',
          context: { objective: '', inputs: {}, expectedOutputType: 'text' },
        },
        {
          taskId: 'task-B',
          status: 'completed',
          dependsOn: ['task-A'],
          agentId: 'agent-123',
          sessionId: 'session-123',
          context: { objective: '', inputs: {}, expectedOutputType: 'text' },
        },
        {
          taskId: 'task-C',
          status: 'completed',
          dependsOn: ['task-A'],
          agentId: 'agent-123',
          sessionId: 'session-123',
          context: { objective: '', inputs: {}, expectedOutputType: 'text' },
        },
        {
          taskId: 'task-D',
          status: 'pending',
          dependsOn: ['task-B', 'task-C'],
          agentId: 'agent-123',
          sessionId: 'session-123',
          context: { objective: '', inputs: {}, expectedOutputType: 'text' },
        },
      ];

      mockDb.query.task.findMany
        .mockResolvedValueOnce([tasks[3]]) // Only pending task-D
        .mockResolvedValueOnce([tasks[1], tasks[2]]); // Both dependencies completed

      const nextTask = await taskService.getNextExecutable(
        'agent-123',
        'session-123',
      );

      expect(nextTask).toBeDefined();
      expect(nextTask).not.toBeNull();
      expect(nextTask!.taskId).toBe('task-D');
    });
  });

  describe('Tool Access Control Integration', () => {
    it('should verify tool access before workflow execution', async () => {
      const platformTool = {
        toolId: 'platform-tool',
        visibility: 'platform',
      };

      const privateTool = {
        toolId: 'private-tool',
        visibility: 'private',
        ownerId: 'user-123',
        ownerType: 'user',
      };

      mockDb.query.tool.findFirst
        .mockResolvedValueOnce(platformTool)
        .mockResolvedValueOnce(privateTool);

      // Agent should have access to platform tool
      const hasAccessPlatform = await toolAccessService.canExecuteTool(
        'platform-tool',
        'agent-123',
        'agent',
      );

      expect(hasAccessPlatform).toBe(true);

      // Agent should not have access to private tool without permission
      mockDb.query.toolPermission.findMany.mockResolvedValue([]);

      await expect(
        toolAccessService.canExecuteTool(
          'private-tool',
          'agent-123',
          'agent',
        ),
      ).rejects.toThrow();
    });

    it('should grant permission and verify access', async () => {
      const privateTool = {
        toolId: 'private-tool',
        visibility: 'private',
        ownerId: 'user-123',
        ownerType: 'user',
      };

      mockDb.query.tool.findFirst.mockResolvedValue(privateTool);
      mockDb.query.toolPermission.findFirst.mockResolvedValue(null);
      mockDb.returning.mockResolvedValue([
        {
          id: 'perm-123',
          toolId: 'private-tool',
          subjectId: 'agent-123',
          subjectType: 'agent',
          permission: 'execute',
          grantedBy: 'user-123',
        },
      ]);

      // Grant permission
      const permission = await toolAccessService.grantPermission({
        toolId: 'private-tool',
        subjectId: 'agent-123',
        subjectType: 'agent',
        permission: 'execute',
        grantedBy: 'user-123',
      });

      expect(permission).toBeDefined();

      // Now agent should have access
      mockDb.query.toolPermission.findMany.mockResolvedValue([permission]);

      const hasAccess = await toolAccessService.canExecuteTool(
        'private-tool',
        'agent-123',
        'agent',
      );

      expect(hasAccess).toBe(true);
    });

    it('should respect permission expiration', async () => {
      const privateTool = {
        toolId: 'private-tool',
        visibility: 'private',
        ownerId: 'user-123',
        ownerType: 'user',
      };

      mockDb.query.tool.findFirst.mockResolvedValue(privateTool);

      const expiredDate = new Date(Date.now() - 86400000); // Yesterday
      const expiredPermission = {
        toolId: 'private-tool',
        subjectId: 'agent-123',
        permission: 'execute',
        expiresAt: expiredDate,
      };

      mockDb.query.toolPermission.findMany.mockResolvedValue([
        expiredPermission,
      ]);

      // Should deny access due to expired permission
      await expect(
        toolAccessService.canExecuteTool(
          'private-tool',
          'agent-123',
          'agent',
        ),
      ).rejects.toThrow();
    });
  });

  describe('End-to-End Workflow with Tools and Tasks', () => {
    it('should execute complete workflow with access control and task tracking', async () => {
      // Step 1: Create workflow
      const workflow = {
        workflowId: 'wf-e2e',
        definition: {
          nodes: [
            { id: 'node1', position: { x: 0, y: 0 }, type: 'tool' as const, toolId: 'tool-1' },
            { id: 'node2', position: { x: 0, y: 0 }, type: 'tool' as const, toolId: 'tool-2' },
          ],
          edges: [
            { id: 'edge-1', source: 'node1', target: 'node2', mapping: { output: 'input' } },
          ],
        },
        ownerId: 'user-123',
        ownerType: 'user',
      };

      mockDb.query.workflow.findFirst.mockResolvedValue(workflow);

      // Step 2: Verify agent has access to tools
      mockDb.query.tool.findFirst.mockResolvedValue({
        toolId: 'tool-1',
        visibility: 'platform',
      });

      const access1 = await toolAccessService.canExecuteTool(
        'tool-1',
        'agent-123',
        'agent',
      );
      expect(access1).toBe(true);

      // Step 3: Create task for workflow
      const task = {
        taskId: 'task-e2e',
        agentId: 'agent-123',
        sessionId: 'session-123',
        executionMode: 'workflow',
        workflowId: 'wf-e2e',
        status: 'pending',
        context: {
          objective: 'Execute E2E workflow',
          inputs: {},
          expectedOutputType: 'text' as const,
        },
      };

      mockDb.query.task.findFirst.mockResolvedValue(task);

      const createdTask = await taskService.create({
        agentId: 'agent-123',
        sessionId: 'session-123',
        title: 'E2E Workflow Task',
        description: 'Execute end-to-end workflow',
        context: {
          objective: 'Execute E2E workflow',
          inputs: {},
          expectedOutputType: 'text',
        },
        tools: [],
      });

      expect(createdTask.taskId).toBe('task-e2e');

      // Step 4: Execute workflow
      const execution = {
        executionId: 'exec-e2e',
        workflowId: 'wf-e2e',
        agentId: 'agent-123',
        status: 'running',
      };

      mockDb.returning.mockResolvedValue([execution]);

      const executionId = await workflowExecutor.executeWorkflow({
        workflowId: 'wf-e2e',
        agentId: 'agent-123',
        sessionId: 'session-123',
        taskId: 'task-e2e',
      });

      expect(executionId).toBe('exec-e2e');

      // Step 5: Update task progress
      await taskService.updateProgress(
        'task-e2e',
        100,
        'completed',
        'Workflow executed successfully',
        'Completed E2E workflow',
        {
          objective: 'Execute E2E workflow',
          inputs: {},
          expectedOutputType: 'text',
        },
      );

      expect(mockDb.update).toHaveBeenCalled();
    });
  });
});

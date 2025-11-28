import { Test, TestingModule } from '@nestjs/testing';
import { WorkflowExecutorService } from './workflow-executor.service';
import { DatabaseService } from '~/modules/database/database.service';
import { ToolLoaderService } from './tool-loader.service';
import { Logger } from '@nestjs/common';

describe('WorkflowExecutorService', () => {
  let service: WorkflowExecutorService;
  let mockDb: any;
  let mockToolLoader: any;

  const mockWorkflow = {
    workflowId: 'workflow-123',
    name: 'Test Workflow',
    definition: {
      nodes: [
        {
          id: 'node1',
          type: 'tool_call',
          toolId: 'tool-1',
          config: {},
        },
        {
          id: 'node2',
          type: 'tool_call',
          toolId: 'tool-2',
          config: {},
        },
      ],
      edges: [
        {
          source: 'node1',
          target: 'node2',
          mapping: { result: 'input' },
        },
      ],
    },
  };

  const mockExecution = {
    executionId: 'exec-123',
    workflowId: 'workflow-123',
    agentId: 'agent-123',
    status: 'running',
    startedAt: new Date(),
    nodeResults: {},
  };

  beforeEach(async () => {
    mockDb = {
      insert: jest.fn().mockReturnThis(),
      values: jest.fn().mockReturnThis(),
      returning: jest.fn().mockResolvedValue([mockExecution]),
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      delete: jest.fn().mockReturnThis(),
      query: {
        workflow: {
          findFirst: jest.fn().mockResolvedValue(mockWorkflow),
        },
        workflowExecution: {
          findFirst: jest.fn(),
          findMany: jest.fn(),
        },
        tool: {
          findFirst: jest.fn(),
        },
      },
    };

    mockToolLoader = {
      loadToolsForAgent: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkflowExecutorService,
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

    service = module.get<WorkflowExecutorService>(WorkflowExecutorService);

    // Suppress logger during tests
    jest.spyOn(Logger.prototype, 'log').mockImplementation();
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
    jest.spyOn(Logger.prototype, 'debug').mockImplementation();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('executeWorkflow', () => {
    it('should start workflow execution', async () => {
      const params = {
        workflowId: 'workflow-123',
        agentId: 'agent-123',
        sessionId: 'session-123',
        inputData: { test: 'data' },
      };

      const executionId = await service.executeWorkflow(params);

      expect(executionId).toBe('exec-123');
      expect(mockDb.insert).toHaveBeenCalled();
      expect(mockDb.query.workflow.findFirst).toHaveBeenCalled();
    });

    it('should throw error when workflow not found', async () => {
      mockDb.query.workflow.findFirst.mockResolvedValue(null);

      const params = {
        workflowId: 'nonexistent',
        agentId: 'agent-123',
      };

      await expect(service.executeWorkflow(params)).rejects.toThrow(
        'Workflow nonexistent not found',
      );
    });

    it('should create execution record with correct status', async () => {
      const params = {
        workflowId: 'workflow-123',
        agentId: 'agent-123',
        inputData: { test: 'data' },
      };

      await service.executeWorkflow(params);

      expect(mockDb.insert).toHaveBeenCalled();
      expect(mockDb.values).toHaveBeenCalledWith(
        expect.objectContaining({
          workflowId: 'workflow-123',
          agentId: 'agent-123',
          status: 'running',
          inputData: { test: 'data' },
        }),
      );
    });
  });

  describe('topologicalSort', () => {
    it('should correctly order linear workflow', () => {
      const nodes = [
        { id: 'node1', type: 'tool_call', toolId: 'tool-1' },
        { id: 'node2', type: 'tool_call', toolId: 'tool-2' },
        { id: 'node3', type: 'tool_call', toolId: 'tool-3' },
      ];

      const edges = [
        { source: 'node1', target: 'node2' },
        { source: 'node2', target: 'node3' },
      ];

      const result = (service as any).topologicalSort(nodes, edges);

      expect(result).toEqual(['node1', 'node2', 'node3']);
    });

    it('should handle parallel nodes', () => {
      const nodes = [
        { id: 'node1', type: 'tool_call', toolId: 'tool-1' },
        { id: 'node2', type: 'tool_call', toolId: 'tool-2' },
        { id: 'node3', type: 'tool_call', toolId: 'tool-3' },
        { id: 'node4', type: 'tool_call', toolId: 'tool-4' },
      ];

      const edges = [
        { source: 'node1', target: 'node2' },
        { source: 'node1', target: 'node3' },
        { source: 'node2', target: 'node4' },
        { source: 'node3', target: 'node4' },
      ];

      const result = (service as any).topologicalSort(nodes, edges);

      // node1 must come first, node4 must come last
      expect(result[0]).toBe('node1');
      expect(result[3]).toBe('node4');
      // node2 and node3 can be in any order
      expect(result.slice(1, 3)).toContain('node2');
      expect(result.slice(1, 3)).toContain('node3');
    });

    it('should throw error on cyclic workflow', () => {
      const nodes = [
        { id: 'node1', type: 'tool_call', toolId: 'tool-1' },
        { id: 'node2', type: 'tool_call', toolId: 'tool-2' },
        { id: 'node3', type: 'tool_call', toolId: 'tool-3' },
      ];

      const edges = [
        { source: 'node1', target: 'node2' },
        { source: 'node2', target: 'node3' },
        { source: 'node3', target: 'node1' }, // Creates cycle
      ];

      expect(() => (service as any).topologicalSort(nodes, edges)).toThrow(
        'Workflow contains cycles',
      );
    });

    it('should handle single node workflow', () => {
      const nodes = [{ id: 'node1', type: 'tool_call', toolId: 'tool-1' }];
      const edges: any[] = [];

      const result = (service as any).topologicalSort(nodes, edges);

      expect(result).toEqual(['node1']);
    });
  });

  describe('mapNodeInputs', () => {
    it('should map inputs from single predecessor', () => {
      const edges = [
        {
          source: 'node1',
          target: 'node2',
          mapping: { result: 'input' },
        },
      ];

      const nodeOutputs = {
        node1: { result: 'test value', extra: 'ignored' },
      };

      const result = (service as any).mapNodeInputs(
        'node2',
        edges,
        nodeOutputs,
      );

      expect(result).toEqual({ input: 'test value' });
    });

    it('should map inputs from multiple predecessors', () => {
      const edges = [
        {
          source: 'node1',
          target: 'node3',
          mapping: { result: 'input1' },
        },
        {
          source: 'node2',
          target: 'node3',
          mapping: { data: 'input2' },
        },
      ];

      const nodeOutputs = {
        node1: { result: 'value1' },
        node2: { data: 'value2' },
      };

      const result = (service as any).mapNodeInputs(
        'node3',
        edges,
        nodeOutputs,
      );

      expect(result).toEqual({ input1: 'value1', input2: 'value2' });
    });

    it('should handle nested field mapping', () => {
      const edges = [
        {
          source: 'node1',
          target: 'node2',
          mapping: { 'data.user.name': 'userName' },
        },
      ];

      const nodeOutputs = {
        node1: {
          data: {
            user: { name: 'John Doe', age: 30 },
          },
        },
      };

      const result = (service as any).mapNodeInputs(
        'node2',
        edges,
        nodeOutputs,
      );

      expect(result).toEqual({ userName: 'John Doe' });
    });

    it('should pass entire output when no mapping specified', () => {
      const edges = [
        {
          source: 'node1',
          target: 'node2',
        },
      ];

      const nodeOutputs = {
        node1: { result: 'value', data: 'more data' },
      };

      const result = (service as any).mapNodeInputs(
        'node2',
        edges,
        nodeOutputs,
      );

      expect(result).toEqual({
        node1: { result: 'value', data: 'more data' },
      });
    });

    it('should merge config overrides', () => {
      const edges = [
        {
          source: 'node1',
          target: 'node2',
          mapping: { result: 'input' },
        },
      ];

      const nodeOutputs = {
        node1: { result: 'value' },
      };

      const config = { param1: 'override', param2: 'extra' };

      const result = (service as any).mapNodeInputs(
        'node2',
        edges,
        nodeOutputs,
        config,
      );

      expect(result).toEqual({
        input: 'value',
        param1: 'override',
        param2: 'extra',
      });
    });

    it('should handle sourceHandle and targetHandle', () => {
      const edges = [
        {
          source: 'node1',
          target: 'node2',
          sourceHandle: 'output1',
          targetHandle: 'input1',
        },
      ];

      const nodeOutputs = {
        node1: { output1: 'value1', output2: 'value2' },
      };

      const result = (service as any).mapNodeInputs(
        'node2',
        edges,
        nodeOutputs,
      );

      expect(result).toEqual({ input1: 'value1' });
    });
  });

  describe('getNestedValue', () => {
    it('should get top-level value', () => {
      const obj = { name: 'John', age: 30 };
      const result = (service as any).getNestedValue(obj, 'name');
      expect(result).toBe('John');
    });

    it('should get nested value', () => {
      const obj = {
        user: {
          profile: {
            name: 'John Doe',
          },
        },
      };
      const result = (service as any).getNestedValue(obj, 'user.profile.name');
      expect(result).toBe('John Doe');
    });

    it('should return undefined for invalid path', () => {
      const obj = { user: { name: 'John' } };
      const result = (service as any).getNestedValue(
        obj,
        'user.profile.name',
      );
      expect(result).toBeUndefined();
    });

    it('should handle array indices', () => {
      const obj = {
        users: [
          { name: 'John' },
          { name: 'Jane' },
        ],
      };
      const result = (service as any).getNestedValue(obj, 'users.1.name');
      expect(result).toBe('Jane');
    });
  });

  describe('getFinalOutput', () => {
    it('should return last node output when no outputMapping', () => {
      const executionOrder = ['node1', 'node2', 'node3'];
      const nodeOutputs = {
        node1: { result: 'value1' },
        node2: { result: 'value2' },
        node3: { result: 'value3' },
      };
      const definition = {};

      const result = (service as any).getFinalOutput(
        executionOrder,
        nodeOutputs,
        definition,
      );

      expect(result).toEqual({ result: 'value3' });
    });

    it('should use outputMapping when specified', () => {
      const executionOrder = ['node1', 'node2'];
      const nodeOutputs = {
        node1: { data: 'value1' },
        node2: { data: 'value2' },
      };
      const definition = {
        outputMapping: {
          firstResult: 'node1.data',
          secondResult: 'node2.data',
        },
      };

      const result = (service as any).getFinalOutput(
        executionOrder,
        nodeOutputs,
        definition,
      );

      expect(result).toEqual({
        firstResult: 'value1',
        secondResult: 'value2',
      });
    });

    it('should handle nested field extraction in outputMapping', () => {
      const executionOrder = ['node1'];
      const nodeOutputs = {
        node1: {
          user: {
            profile: { name: 'John' },
          },
        },
      };
      const definition = {
        outputMapping: {
          userName: 'node1.user.profile.name',
        },
      };

      const result = (service as any).getFinalOutput(
        executionOrder,
        nodeOutputs,
        definition,
      );

      expect(result).toEqual({ userName: 'John' });
    });
  });

  describe('getExecutionStatus', () => {
    it('should return execution details', async () => {
      const executionDetails = {
        ...mockExecution,
        workflow: mockWorkflow,
        agent: { agentId: 'agent-123' },
      };

      mockDb.query.workflowExecution.findFirst.mockResolvedValue(
        executionDetails,
      );

      const result = await service.getExecutionStatus('exec-123');

      expect(result).toBeDefined();
      expect(result.executionId).toBe('exec-123');
      expect(result.workflow).toBeDefined();
    });

    it('should throw error when execution not found', async () => {
      mockDb.query.workflowExecution.findFirst.mockResolvedValue(null);

      await expect(
        service.getExecutionStatus('nonexistent'),
      ).rejects.toThrow('Execution nonexistent not found');
    });
  });

  describe('cancelExecution', () => {
    it('should cancel running execution', async () => {
      const cancelledExecution = {
        ...mockExecution,
        status: 'cancelled',
        completedAt: new Date(),
      };

      mockDb.returning.mockResolvedValue([cancelledExecution]);

      const result = await service.cancelExecution('exec-123');

      expect(result).toEqual({ success: true });
      expect(mockDb.update).toHaveBeenCalled();
      expect(mockDb.set).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'cancelled',
        }),
      );
    });

    it('should throw error when execution not found', async () => {
      mockDb.returning.mockResolvedValue([]);

      await expect(service.cancelExecution('nonexistent')).rejects.toThrow(
        'Execution nonexistent not found',
      );
    });
  });

  describe('listExecutions', () => {
    it('should list executions for a workflow', async () => {
      const executions = [mockExecution, { ...mockExecution, executionId: 'exec-456' }];
      mockDb.query.workflowExecution.findMany.mockResolvedValue(executions);

      const result = await service.listExecutions('workflow-123');

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(2);
    });

    it('should respect limit parameter', async () => {
      mockDb.query.workflowExecution.findMany.mockResolvedValue([mockExecution]);

      await service.listExecutions('workflow-123', 10);

      expect(mockDb.query.workflowExecution.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 10 }),
      );
    });

    it('should use default limit of 50', async () => {
      mockDb.query.workflowExecution.findMany.mockResolvedValue([]);

      await service.listExecutions('workflow-123');

      expect(mockDb.query.workflowExecution.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 50 }),
      );
    });
  });
});

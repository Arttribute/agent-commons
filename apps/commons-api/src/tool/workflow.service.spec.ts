import { Test, TestingModule } from '@nestjs/testing';
import { WorkflowService } from './workflow.service';
import { DatabaseService } from '~/modules/database/database.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';

describe('WorkflowService', () => {
  let service: WorkflowService;
  let mockDb: any;

  const mockWorkflowData = {
    workflowId: 'workflow-123',
    name: 'Test Workflow',
    description: 'Test workflow description',
    definition: {
      startNodeId: 'node1',
      endNodeId: 'node2',
      nodes: [
        {
          id: 'node1',
          type: 'tool' as const,
          position: { x: 0, y: 0 },
          toolId: 'tool-1',
        },
        {
          id: 'node2',
          type: 'tool' as const,
          position: { x: 100, y: 0 },
          toolId: 'tool-2',
        },
      ],
      edges: [
        {
          from: 'node1',
          to: 'node2',
          mapping: { result: 'input' },
        },
      ],
    },
    ownerId: 'user-123',
    ownerType: 'user',
    isPublic: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    mockDb = {
      insert: jest.fn().mockReturnThis(),
      values: jest.fn().mockReturnThis(),
      returning: jest.fn().mockResolvedValue([mockWorkflowData]),
      query: {
        workflow: {
          findFirst: jest.fn(),
          findMany: jest.fn(),
        },
      },
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockResolvedValue([mockWorkflowData]),
      delete: jest.fn().mockReturnThis(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkflowService,
        {
          provide: DatabaseService,
          useValue: mockDb,
        },
      ],
    }).compile();

    service = module.get<WorkflowService>(WorkflowService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createWorkflow', () => {
    it('should create a workflow successfully', async () => {
      const createDto = {
        name: 'Test Workflow',
        description: 'Test description',
        definition: mockWorkflowData.definition,
        ownerId: 'user-123',
        ownerType: 'user' as const,
      };

      const result = await service.createWorkflow(createDto);

      expect(result).toBeDefined();
      expect(result.name).toBe(createDto.name);
      expect(mockDb.insert).toHaveBeenCalled();
    });

    it('should detect cycles in workflow definition', async () => {
      const cyclicDefinition = {
        startNodeId: 'node1',
        endNodeId: 'node3',
        nodes: [
          { nodeId: 'node1', type: 'tool' as const, config: {} },
          { nodeId: 'node2', type: 'tool' as const, config: {} },
          { nodeId: 'node3', type: 'tool' as const, config: {} },
        ],
        edges: [
          { from: 'node1', to: 'node2', mapping: {} },
          { from: 'node2', to: 'node3', mapping: {} },
          { from: 'node3', to: 'node1', mapping: {} }, // Creates cycle
        ],
      };

      const createDto = {
        name: 'Cyclic Workflow',
        definition: cyclicDefinition,
        ownerId: 'user-123',
        ownerType: 'user' as const,
      };

      await expect(service.createWorkflow(createDto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should validate node references in edges', async () => {
      const invalidDefinition = {
        startNodeId: 'node1',
        endNodeId: 'nonexistent',
        nodes: [{ nodeId: 'node1', type: 'tool' as const, config: {} }],
        edges: [
          { from: 'node1', to: 'nonexistent', mapping: {} }, // Invalid node reference
        ],
      };

      const createDto = {
        name: 'Invalid Workflow',
        definition: invalidDefinition,
        ownerId: 'user-123',
        ownerType: 'user' as const,
      };

      await expect(service.createWorkflow(createDto)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('getWorkflow', () => {
    it('should return a workflow by ID', async () => {
      mockDb.query.workflow.findFirst.mockResolvedValue(mockWorkflowData);

      const result = await service.getWorkflow('workflow-123');

      expect(result).toBeDefined();
      expect(result.workflowId).toBe('workflow-123');
    });

    it('should throw NotFoundException when workflow not found', async () => {
      mockDb.query.workflow.findFirst.mockResolvedValue(null);

      await expect(service.getWorkflow('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('listWorkflows', () => {
    it('should list workflows for an owner', async () => {
      mockDb.query.workflow.findMany.mockResolvedValue([mockWorkflowData]);

      const result = await service.listWorkflows('user-123', 'user');

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe('discoverPublicWorkflows', () => {
    it('should return public workflows', async () => {
      const publicWorkflow = { ...mockWorkflowData, isPublic: true };
      mockDb.query.workflow.findMany.mockResolvedValue([publicWorkflow]);

      const result = await service.discoverPublicWorkflows({});

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });

    it('should filter by category', async () => {
      const categorizedWorkflow = {
        ...mockWorkflowData,
        isPublic: true,
        category: 'automation',
      };
      mockDb.query.workflow.findMany.mockResolvedValue([categorizedWorkflow]);

      const result = await service.discoverPublicWorkflows({
        category: 'automation',
      });

      expect(result).toBeDefined();
    });

    it('should filter by tags', async () => {
      const taggedWorkflow = {
        ...mockWorkflowData,
        isPublic: true,
        tags: ['api', 'data'],
      };
      mockDb.query.workflow.findMany.mockResolvedValue([taggedWorkflow]);

      const result = await service.discoverPublicWorkflows({
        tags: ['api'],
      });

      expect(result).toBeDefined();
    });
  });

  describe('updateWorkflow', () => {
    it('should update a workflow', async () => {
      mockDb.query.workflow.findFirst.mockResolvedValue(mockWorkflowData);

      const updates = { name: 'Updated Workflow' };
      const result = await service.updateWorkflow('workflow-123', updates);

      expect(result).toBeDefined();
      expect(mockDb.update).toHaveBeenCalled();
    });

    it('should validate updated definition for cycles', async () => {
      mockDb.query.workflow.findFirst.mockResolvedValue(mockWorkflowData);

      const cyclicDefinition = {
        startNodeId: 'node1',
        endNodeId: 'node2',
        nodes: [
          { nodeId: 'node1', type: 'tool' as const, config: {} },
          { nodeId: 'node2', type: 'tool' as const, config: {} },
        ],
        edges: [
          { from: 'node1', to: 'node2', mapping: {} },
          { from: 'node2', to: 'node1', mapping: {} },
        ],
      };

      await expect(
        service.updateWorkflow('workflow-123', {
          definition: cyclicDefinition,
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('deleteWorkflow', () => {
    it('should delete a workflow', async () => {
      mockDb.query.workflow.findFirst.mockResolvedValue(mockWorkflowData);

      await service.deleteWorkflow('workflow-123');

      expect(mockDb.delete).toHaveBeenCalled();
    });

    it('should throw NotFoundException when workflow not found', async () => {
      mockDb.query.workflow.findFirst.mockResolvedValue(null);

      await expect(service.deleteWorkflow('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('forkWorkflow', () => {
    it('should fork a public workflow', async () => {
      const publicWorkflow = { ...mockWorkflowData, isPublic: true };
      mockDb.query.workflow.findFirst.mockResolvedValue(publicWorkflow);

      const result = await service.forkWorkflow({
        workflowId: 'workflow-123',
        newOwnerId: 'user-456',
        newOwnerType: 'user',
      });

      expect(result).toBeDefined();
      expect(mockDb.insert).toHaveBeenCalled();
    });

    it('should throw error when forking private workflow', async () => {
      mockDb.query.workflow.findFirst.mockResolvedValue(mockWorkflowData);

      await expect(
        service.forkWorkflow({
          workflowId: 'workflow-123',
          newOwnerId: 'user-456',
          newOwnerType: 'user',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should apply customizations when forking', async () => {
      const publicWorkflow = { ...mockWorkflowData, isPublic: true };
      mockDb.query.workflow.findFirst.mockResolvedValue(publicWorkflow);

      const result = await service.forkWorkflow({
        workflowId: 'workflow-123',
        newOwnerId: 'user-456',
        newOwnerType: 'user',
        name: 'My Custom Fork',
      });

      expect(result).toBeDefined();
    });
  });
});

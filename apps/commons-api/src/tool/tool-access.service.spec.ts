import { Test, TestingModule } from '@nestjs/testing';
import { ToolAccessService } from './tool-access.service';
import { DatabaseService } from '~/modules/database/database.service';
import { ForbiddenException } from '@nestjs/common';
import { Logger } from '@nestjs/common';

describe('ToolAccessService', () => {
  let service: ToolAccessService;
  let mockDb: any;

  const platformTool = {
    toolId: 'tool-platform',
    name: 'Platform Tool',
    visibility: 'platform',
    ownerId: null,
    ownerType: null,
  };

  const publicTool = {
    toolId: 'tool-public',
    name: 'Public Tool',
    visibility: 'public',
    ownerId: 'user-123',
    ownerType: 'user',
  };

  const privateTool = {
    toolId: 'tool-private',
    name: 'Private Tool',
    visibility: 'private',
    ownerId: 'user-123',
    ownerType: 'user',
  };

  beforeEach(async () => {
    mockDb = {
      query: {
        tool: {
          findFirst: jest.fn(),
          findMany: jest.fn(),
        },
        toolPermission: {
          findFirst: jest.fn(),
          findMany: jest.fn(),
        },
      },
      insert: jest.fn().mockReturnThis(),
      values: jest.fn().mockReturnThis(),
      returning: jest.fn(),
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      delete: jest.fn().mockReturnThis(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ToolAccessService,
        {
          provide: DatabaseService,
          useValue: mockDb,
        },
      ],
    }).compile();

    service = module.get<ToolAccessService>(ToolAccessService);

    // Suppress logger during tests
    jest.spyOn(Logger.prototype, 'log').mockImplementation();
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('canExecuteTool', () => {
    it('should allow access to platform tools', async () => {
      mockDb.query.tool.findFirst.mockResolvedValue(platformTool);

      const result = await service.canExecuteTool(
        'tool-platform',
        'user-456',
        'user',
      );

      expect(result).toBe(true);
    });

    it('should allow access to public tools', async () => {
      mockDb.query.tool.findFirst.mockResolvedValue(publicTool);

      const result = await service.canExecuteTool(
        'tool-public',
        'user-456',
        'user',
      );

      expect(result).toBe(true);
    });

    it('should allow owner to access private tool', async () => {
      mockDb.query.tool.findFirst.mockResolvedValue(privateTool);

      const result = await service.canExecuteTool(
        'tool-private',
        'user-123',
        'user',
      );

      expect(result).toBe(true);
    });

    it('should deny non-owner access to private tool without permission', async () => {
      mockDb.query.tool.findFirst.mockResolvedValue(privateTool);
      mockDb.query.toolPermission.findMany.mockResolvedValue([]);

      await expect(
        service.canExecuteTool('tool-private', 'user-456', 'user'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should allow non-owner with explicit permission', async () => {
      mockDb.query.tool.findFirst.mockResolvedValue(privateTool);
      mockDb.query.toolPermission.findMany.mockResolvedValue([
        {
          toolId: 'tool-private',
          subjectId: 'user-456',
          subjectType: 'user',
          permission: 'execute',
          expiresAt: null,
        },
      ]);

      const result = await service.canExecuteTool(
        'tool-private',
        'user-456',
        'user',
      );

      expect(result).toBe(true);
    });

    it('should throw error when tool not found', async () => {
      mockDb.query.tool.findFirst.mockResolvedValue(null);

      await expect(
        service.canExecuteTool('nonexistent', 'user-123', 'user'),
      ).rejects.toThrow('Tool nonexistent not found');
    });

    it('should distinguish between user and agent ownership', async () => {
      const agentPrivateTool = {
        ...privateTool,
        ownerId: 'agent-123',
        ownerType: 'agent',
      };

      mockDb.query.tool.findFirst.mockResolvedValue(agentPrivateTool);

      // User with same ID should not have access
      mockDb.query.toolPermission.findMany.mockResolvedValue([]);

      await expect(
        service.canExecuteTool('tool-private', 'agent-123', 'user'),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('hasPermission', () => {
    it('should return true when permission exists and not expired', async () => {
      const futureDate = new Date(Date.now() + 86400000); // Tomorrow
      mockDb.query.toolPermission.findMany.mockResolvedValue([
        {
          permission: 'execute',
          expiresAt: futureDate,
        },
      ]);

      const result = await service.hasPermission(
        'tool-123',
        'user-123',
        'user',
        'execute',
      );

      expect(result).toBe(true);
    });

    it('should return false when permission is expired', async () => {
      const pastDate = new Date(Date.now() - 86400000); // Yesterday
      mockDb.query.toolPermission.findMany.mockResolvedValue([
        {
          permission: 'execute',
          expiresAt: pastDate,
        },
      ]);

      const result = await service.hasPermission(
        'tool-123',
        'user-123',
        'user',
        'execute',
      );

      expect(result).toBe(false);
    });

    it('should return true when permission has no expiration', async () => {
      mockDb.query.toolPermission.findMany.mockResolvedValue([
        {
          permission: 'execute',
          expiresAt: null,
        },
      ]);

      const result = await service.hasPermission(
        'tool-123',
        'user-123',
        'user',
        'execute',
      );

      expect(result).toBe(true);
    });

    it('should return true when user has admin permission', async () => {
      mockDb.query.toolPermission.findMany.mockResolvedValue([
        {
          permission: 'admin',
          expiresAt: null,
        },
      ]);

      // Requesting 'execute' but has 'admin'
      const result = await service.hasPermission(
        'tool-123',
        'user-123',
        'user',
        'execute',
      );

      expect(result).toBe(true);
    });

    it('should return false when no permissions exist', async () => {
      mockDb.query.toolPermission.findMany.mockResolvedValue([]);

      const result = await service.hasPermission(
        'tool-123',
        'user-123',
        'user',
        'execute',
      );

      expect(result).toBe(false);
    });
  });

  describe('grantPermission', () => {
    it('should create new permission', async () => {
      mockDb.query.toolPermission.findFirst.mockResolvedValue(null);
      const newPermission = {
        id: 'perm-123',
        toolId: 'tool-123',
        subjectId: 'user-456',
        subjectType: 'user',
        permission: 'execute',
        grantedBy: 'user-123',
      };
      mockDb.returning.mockResolvedValue([newPermission]);

      const result = await service.grantPermission({
        toolId: 'tool-123',
        subjectId: 'user-456',
        subjectType: 'user',
        permission: 'execute',
        grantedBy: 'user-123',
      });

      expect(result).toEqual(newPermission);
      expect(mockDb.insert).toHaveBeenCalled();
    });

    it('should return existing permission if already exists', async () => {
      const existingPermission = {
        id: 'perm-123',
        toolId: 'tool-123',
        subjectId: 'user-456',
        subjectType: 'user',
        permission: 'execute',
        expiresAt: null,
      };
      mockDb.query.toolPermission.findFirst.mockResolvedValue(
        existingPermission,
      );

      const result = await service.grantPermission({
        toolId: 'tool-123',
        subjectId: 'user-456',
        subjectType: 'user',
        permission: 'execute',
        grantedBy: 'user-123',
      });

      expect(result).toEqual(existingPermission);
      expect(mockDb.insert).not.toHaveBeenCalled();
    });

    it('should update expiration of existing permission', async () => {
      const existingPermission = {
        id: 'perm-123',
        toolId: 'tool-123',
        subjectId: 'user-456',
        subjectType: 'user',
        permission: 'execute',
        expiresAt: null,
      };
      mockDb.query.toolPermission.findFirst.mockResolvedValue(
        existingPermission,
      );

      const newExpiration = new Date(Date.now() + 86400000);
      const updatedPermission = { ...existingPermission, expiresAt: newExpiration };
      mockDb.returning.mockResolvedValue([updatedPermission]);

      const result = await service.grantPermission({
        toolId: 'tool-123',
        subjectId: 'user-456',
        subjectType: 'user',
        permission: 'execute',
        grantedBy: 'user-123',
        expiresAt: newExpiration,
      });

      expect(result.expiresAt).toEqual(newExpiration);
      expect(mockDb.update).toHaveBeenCalled();
    });
  });

  describe('revokePermission', () => {
    it('should revoke permission successfully', async () => {
      mockDb.returning.mockResolvedValue([{ id: 'perm-123' }]);

      const result = await service.revokePermission('perm-123');

      expect(result).toEqual({ success: true });
      expect(mockDb.delete).toHaveBeenCalled();
    });

    it('should throw error when permission not found', async () => {
      mockDb.returning.mockResolvedValue([]);

      await expect(service.revokePermission('nonexistent')).rejects.toThrow(
        'Permission nonexistent not found',
      );
    });
  });

  describe('listToolPermissions', () => {
    it('should list all permissions for a tool', async () => {
      const permissions = [
        { id: 'perm-1', toolId: 'tool-123', subjectId: 'user-1' },
        { id: 'perm-2', toolId: 'tool-123', subjectId: 'user-2' },
      ];
      mockDb.query.toolPermission.findMany.mockResolvedValue(permissions);

      const result = await service.listToolPermissions('tool-123');

      expect(result).toEqual(permissions);
      expect(result.length).toBe(2);
    });
  });

  describe('listSubjectPermissions', () => {
    it('should list all permissions for a subject', async () => {
      const permissions = [
        { id: 'perm-1', subjectId: 'user-123', toolId: 'tool-1' },
        { id: 'perm-2', subjectId: 'user-123', toolId: 'tool-2' },
      ];
      mockDb.query.toolPermission.findMany.mockResolvedValue(permissions);

      const result = await service.listSubjectPermissions('user-123', 'user');

      expect(result).toEqual(permissions);
      expect(result.length).toBe(2);
    });
  });

  describe('getAccessibleTools', () => {
    it('should return platform and public tools', async () => {
      mockDb.query.tool.findMany.mockResolvedValue([
        platformTool,
        publicTool,
        privateTool,
      ]);
      mockDb.query.toolPermission.findMany.mockResolvedValue([]);

      const result = await service.getAccessibleTools('user-456', 'user');

      expect(result.length).toBe(2);
      expect(result).toContainEqual(platformTool);
      expect(result).toContainEqual(publicTool);
    });

    it('should return owned private tools', async () => {
      mockDb.query.tool.findMany.mockResolvedValue([
        platformTool,
        publicTool,
        privateTool,
      ]);

      const result = await service.getAccessibleTools('user-123', 'user');

      expect(result.length).toBe(3);
      expect(result).toContainEqual(privateTool);
    });

    it('should return tools with explicit permissions', async () => {
      const otherPrivateTool = {
        ...privateTool,
        toolId: 'tool-other',
        ownerId: 'user-999',
      };

      mockDb.query.tool.findMany.mockResolvedValue([
        platformTool,
        otherPrivateTool,
      ]);

      // Mock permission check to return true for otherPrivateTool
      mockDb.query.toolPermission.findMany.mockResolvedValue([
        {
          permission: 'execute',
          expiresAt: null,
        },
      ]);

      const result = await service.getAccessibleTools('user-456', 'user');

      expect(result.length).toBe(2);
      expect(result).toContainEqual(platformTool);
      expect(result).toContainEqual(otherPrivateTool);
    });
  });

  describe('batchGrantPermissions', () => {
    it('should grant permissions to multiple subjects', async () => {
      mockDb.query.toolPermission.findFirst.mockResolvedValue(null);
      mockDb.returning.mockResolvedValue([
        { id: 'perm-1', subjectId: 'user-1' },
      ]);

      const result = await service.batchGrantPermissions({
        toolId: 'tool-123',
        subjects: [
          { subjectId: 'user-1', subjectType: 'user' },
          { subjectId: 'agent-1', subjectType: 'agent' },
        ],
        permission: 'execute',
        grantedBy: 'user-admin',
      });

      expect(result.length).toBe(2);
      expect(mockDb.insert).toHaveBeenCalledTimes(2);
    });

    it('should continue on individual failures', async () => {
      mockDb.query.toolPermission.findFirst
        .mockResolvedValueOnce(null)
        .mockRejectedValueOnce(new Error('Database error'))
        .mockResolvedValueOnce(null);

      mockDb.returning.mockResolvedValue([{ id: 'perm-1' }]);

      const result = await service.batchGrantPermissions({
        toolId: 'tool-123',
        subjects: [
          { subjectId: 'user-1', subjectType: 'user' },
          { subjectId: 'user-2', subjectType: 'user' },
          { subjectId: 'user-3', subjectType: 'user' },
        ],
        permission: 'execute',
        grantedBy: 'user-admin',
      });

      // Should have 2 successes despite 1 failure
      expect(result.length).toBe(2);
    });
  });

  describe('transferOwnership', () => {
    it('should transfer tool ownership', async () => {
      const updatedTool = {
        ...privateTool,
        ownerId: 'user-456',
        ownerType: 'user',
      };
      mockDb.returning.mockResolvedValue([updatedTool]);

      const result = await service.transferOwnership(
        'tool-private',
        'user-456',
        'user',
      );

      expect(result.ownerId).toBe('user-456');
      expect(mockDb.update).toHaveBeenCalled();
    });

    it('should throw error when tool not found', async () => {
      mockDb.returning.mockResolvedValue([]);

      await expect(
        service.transferOwnership('nonexistent', 'user-456', 'user'),
      ).rejects.toThrow('Tool nonexistent not found');
    });
  });

  describe('checkAgentToolAccess', () => {
    it('should return full access for platform tool without key', async () => {
      mockDb.query.tool.findFirst.mockResolvedValue({
        ...platformTool,
        apiSpec: null,
      });

      const result = await service.checkAgentToolAccess(
        'tool-platform',
        'agent-123',
      );

      expect(result).toEqual({
        canExecute: true,
        requiresKey: false,
        hasKey: false,
      });
    });

    it('should indicate key requirement for tool with auth', async () => {
      mockDb.query.tool.findFirst.mockResolvedValue({
        ...platformTool,
        apiSpec: {
          authType: 'bearer',
          authKeyName: 'API_KEY',
        },
      });

      const result = await service.checkAgentToolAccess(
        'tool-platform',
        'agent-123',
      );

      expect(result).toEqual({
        canExecute: true,
        requiresKey: true,
        hasKey: false, // Not checked yet in this implementation
      });
    });

    it('should deny access when agent has no permission', async () => {
      mockDb.query.tool.findFirst.mockResolvedValue(privateTool);
      mockDb.query.toolPermission.findMany.mockResolvedValue([]);

      const result = await service.checkAgentToolAccess(
        'tool-private',
        'agent-456', // Not the owner
      );

      expect(result.canExecute).toBe(false);
      expect(result.reason).toContain('does not have permission');
    });

    it('should return error when tool not found', async () => {
      mockDb.query.tool.findFirst.mockResolvedValue(null);

      const result = await service.checkAgentToolAccess(
        'nonexistent',
        'agent-123',
      );

      expect(result.canExecute).toBe(false);
      expect(result.reason).toBe('Tool nonexistent not found');
    });
  });
});

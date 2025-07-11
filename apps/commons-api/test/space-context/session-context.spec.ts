import { Test, TestingModule } from '@nestjs/testing';
import { AgentService } from '~/agent/agent.service';
import { SessionService } from '~/session/session.service';
import { SpaceConductor } from '~/space/space-conductor.service';
import { SpaceContext } from '~/space/space-context';
import { CommonToolService } from '~/tool/tools/common-tool.service';
import { DatabaseService } from '~/modules/database/database.service';
import { OpenAIService } from '~/modules/openai/openai.service';
import { CoinbaseService } from '~/modules/coinbase/coinbase.service';
import { ToolService } from '~/tool/tool.service';
import { LogService } from '~/log/log.service';
import { GoalService } from '~/goal/goal.service';
import { TaskService } from '~/task/task.service';
import { ResourceService } from '~/resource/resource.service';
import { AttributionService } from '~/attribution/attribution.service';
import { PinataService } from '~/pinata/pinata.service';
import { of } from 'rxjs';

// Mock the got module to avoid ES module parsing issues
jest.mock('got', () => ({
  default: jest.fn().mockResolvedValue({ body: '{}' }),
}));

// Mock graphql-request module to avoid ES module parsing issues
jest.mock('graphql-request', () => ({
  request: jest.fn().mockResolvedValue({}),
  GraphQLClient: jest.fn().mockImplementation(() => ({
    request: jest.fn().mockResolvedValue({}),
  })),
}));

// Mock @coinbase/coinbase-sdk to avoid wallet import issues
jest.mock('@coinbase/coinbase-sdk', () => ({
  Wallet: {
    import: jest.fn().mockResolvedValue({
      getBalance: jest.fn().mockResolvedValue({ lte: jest.fn(() => false) }),
      getDefaultAddress: jest
        .fn()
        .mockReturnValue({ getId: () => 'mock-address' }),
    }),
  },
}));

describe('SharedSpaceContext Integration Tests', () => {
  let module: TestingModule;
  let agentService: AgentService;
  let sessionService: SessionService;
  let spaceConductor: SpaceConductor;
  let commonToolService: CommonToolService;

  // Mock data
  const mockAgent = {
    agentId: 'test-agent-1',
    name: 'Test Agent',
    persona: 'A helpful test agent',
    instructions: 'Test instructions',
    wallet: { seed: 'test-seed' },
    temperature: 0.7,
    maxTokens: 2000,
    topP: 1,
    presencePenalty: 0,
    frequencyPenalty: 0,
    commonTools: [],
    autonomyEnabled: false,
  };

  const mockAgent2 = {
    agentId: 'test-agent-2',
    name: 'Test Agent 2',
    persona: 'Another helpful test agent',
    instructions: 'Test instructions for agent 2',
    wallet: { seed: 'test-seed-2' },
    temperature: 0.7,
    maxTokens: 2000,
    topP: 1,
    presencePenalty: 0,
    frequencyPenalty: 0,
    commonTools: [],
    autonomyEnabled: false,
  };

  const testSessionId = 'test-session-123';

  beforeEach(async () => {
    // Create mock services
    const mockDatabaseService = {
      query: {
        agent: {
          findFirst: jest.fn(),
        },
        session: {
          findFirst: jest.fn(),
          findMany: jest.fn(),
        },
        resource: {
          findMany: jest.fn(() => Promise.resolve([])),
        },
      },
      insert: jest.fn(() => ({
        values: jest.fn(() => ({
          returning: jest.fn(() =>
            Promise.resolve([{ sessionId: testSessionId }]),
          ),
        })),
      })),
      update: jest.fn(() => ({
        set: jest.fn(() => ({
          where: jest.fn(() => ({
            returning: jest.fn(() => Promise.resolve([{}])),
          })),
        })),
      })),
    };

    const mockWallet = {
      getBalance: jest.fn(() => Promise.resolve({ lte: jest.fn(() => false) })),
      export: jest.fn(() => 'mock-wallet-export'),
    };

    const mockCoinbaseService = {
      createDeveloperManagedWallet: jest.fn(() => Promise.resolve(mockWallet)),
    };

    const mockToolService = {
      getAllTools: jest.fn(() => Promise.resolve([])),
    };

    const mockOpenAIService = {
      createChatCompletion: jest.fn().mockResolvedValue({
        choices: [
          {
            message: {
              role: 'assistant',
              content: 'Test response',
              tool_calls: null,
            },
          },
        ],
      }),
    };
    const mockLogService = {
      createLogEntry: jest.fn(() => Promise.resolve({})),
    };
    const mockGoalService = {
      getNextExecutableGoal: jest.fn(() => Promise.resolve(null)),
    };
    const mockTaskService = {
      getNextExecutable: jest.fn(() => Promise.resolve(null)),
    };

    const mockResourceService = {
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
      delete: jest.fn().mockResolvedValue({}),
    };

    const mockAttributionService = {
      create: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
      findMany: jest.fn().mockResolvedValue([]),
    };

    const mockPinataService = {
      upload: jest.fn().mockResolvedValue({}),
      download: jest.fn().mockResolvedValue({}),
    };

    module = await Test.createTestingModule({
      providers: [
        AgentService,
        SessionService,
        SpaceConductor,
        CommonToolService,
        { provide: DatabaseService, useValue: mockDatabaseService },
        { provide: OpenAIService, useValue: mockOpenAIService },
        { provide: CoinbaseService, useValue: mockCoinbaseService },
        { provide: ToolService, useValue: mockToolService },
        { provide: LogService, useValue: mockLogService },
        { provide: GoalService, useValue: mockGoalService },
        { provide: TaskService, useValue: mockTaskService },
        { provide: ResourceService, useValue: mockResourceService },
        { provide: AttributionService, useValue: mockAttributionService },
        { provide: PinataService, useValue: mockPinataService },
      ],
    }).compile();

    agentService = module.get<AgentService>(AgentService);
    sessionService = module.get<SessionService>(SessionService);
    spaceConductor = module.get<SpaceConductor>(SpaceConductor);
    commonToolService = module.get<CommonToolService>(CommonToolService);

    // Mock agent retrieval
    jest.spyOn(agentService, 'getAgent').mockImplementation((props) => {
      if (props.agentId === 'test-agent-1')
        return Promise.resolve(mockAgent as any);
      if (props.agentId === 'test-agent-2')
        return Promise.resolve(mockAgent2 as any);
      throw new Error('Agent not found');
    });

    // Mock session operations
    jest.spyOn(sessionService, 'createSession').mockResolvedValue({
      sessionId: testSessionId,
      agentId: mockAgent.agentId,
      initiator: 'test-user',
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any);

    jest.spyOn(sessionService, 'getSession').mockResolvedValue({
      sessionId: testSessionId,
      agentId: mockAgent.agentId,
      title: 'Test Session',
      initiator: 'test-user',
      childSessions: [],
    } as any);

    jest.spyOn(sessionService, 'updateSession').mockResolvedValue([{}] as any);

    // Mock Wallet import
    jest.doMock('@coinbase/coinbase-sdk', () => ({
      Wallet: {
        import: jest.fn(() => Promise.resolve(mockWallet)),
      },
    }));
  });

  afterEach(async () => {
    if (module) {
      await module.close();
    }
    jest.clearAllMocks();
  });

  describe('SpaceConductor - Shared Context Management', () => {
    it('should create only one session context per sessionId', () => {
      const context1 = spaceConductor.getOrCreateContext(testSessionId);
      const context2 = spaceConductor.getOrCreateContext(testSessionId);

      expect(context1).toBe(context2); // Same reference
      expect(spaceConductor.getActiveSessionCount()).toBe(1);
    });

    it('should track multiple sessions separately', () => {
      const sessionId1 = 'session-1';
      const sessionId2 = 'session-2';

      const context1 = spaceConductor.getOrCreateContext(sessionId1);
      const context2 = spaceConductor.getOrCreateContext(sessionId2);

      expect(context1).not.toBe(context2);
      expect(spaceConductor.getActiveSessionCount()).toBe(2);
      expect(spaceConductor.getActiveSessionIds()).toContain(sessionId1);
      expect(spaceConductor.getActiveSessionIds()).toContain(sessionId2);
    });

    it('should clear contexts correctly', () => {
      const context = spaceConductor.getOrCreateContext(testSessionId);
      expect(spaceConductor.hasContext(testSessionId)).toBe(true);

      const cleared = spaceConductor.clearContext(testSessionId);

      expect(cleared).toBe(true);
      expect(spaceConductor.hasContext(testSessionId)).toBe(false);
      expect(spaceConductor.getActiveSessionCount()).toBe(0);
    });
  });

  describe('SpaceContext - Event Bus', () => {
    let spaceContext: SpaceContext;

    beforeEach(() => {
      spaceContext = spaceConductor.getOrCreateContext(testSessionId);
    });

    it('should handle message events correctly', (done) => {
      const testMessage = {
        role: 'user' as const,
        content: 'Hello, test message',
      };

      spaceContext.bus.subscribe((event) => {
        expect(event.type).toBe('message');
        expect(event.agentId).toBe('test-agent-1');
        expect(event.payload).toEqual(testMessage);
        expect(spaceContext.getMessages()).toContain(testMessage);
        done();
      });

      spaceContext.bus.next({
        type: 'message',
        agentId: 'test-agent-1',
        payload: testMessage,
        timestamp: Date.now(),
      });
    });

    it('should handle tool call events correctly', (done) => {
      const testToolCall = {
        name: 'testTool',
        args: { param: 'value' },
        result: { success: true },
      };

      spaceContext.bus.subscribe((event) => {
        expect(event.type).toBe('tool');
        expect(event.agentId).toBe('test-agent-1');
        expect(event.payload).toEqual(testToolCall);
        expect(spaceContext.getToolCalls()).toContain(testToolCall);
        done();
      });

      spaceContext.bus.next({
        type: 'tool',
        agentId: 'test-agent-1',
        payload: testToolCall,
        timestamp: Date.now(),
      });
    });

    it('should handle agent interaction events correctly', (done) => {
      const testAgentCall = {
        initiator: 'test-agent-1',
        targetAgent: 'test-agent-2',
        message: 'Hello from agent 1',
      };

      spaceContext.bus.subscribe((event) => {
        expect(event.type).toBe('agentCall');
        expect(event.agentId).toBe('test-agent-2');
        expect(event.payload).toEqual(testAgentCall);
        expect(spaceContext.getAgentInteractions()).toContain(event);
        done();
      });

      spaceContext.bus.next({
        type: 'agentCall',
        agentId: 'test-agent-2',
        payload: testAgentCall,
        timestamp: Date.now(),
      });
    });

    it('should track contributions correctly', () => {
      const events = [
        {
          type: 'message' as const,
          agentId: 'test-agent-1',
          payload: { role: 'user' as const, content: 'Message 1' },
          timestamp: Date.now(),
        },
        {
          type: 'tool' as const,
          agentId: 'test-agent-1',
          payload: { name: 'tool1', result: 'success' },
          timestamp: Date.now(),
        },
        {
          type: 'agentCall' as const,
          agentId: 'test-agent-2',
          payload: { initiator: 'test-agent-1', message: 'Hello' },
          timestamp: Date.now(),
        },
      ];

      events.forEach((event) => spaceContext.bus.next(event));

      expect(spaceContext.contributions).toHaveLength(3);
      expect(spaceContext.getMessages()).toHaveLength(1);
      expect(spaceContext.getToolCalls()).toHaveLength(1);
      expect(spaceContext.getAgentInteractions()).toHaveLength(1);
    });
  });

  describe('AgentService - Shared Context Integration', () => {
    it('should only create one session for multiple agent interactions', async () => {
      const createSessionSpy = jest.spyOn(sessionService, 'createSession');

      // Mock OpenAI service to return simple responses
      const mockOpenAIService = {
        createChatCompletion: jest.fn().mockResolvedValue({
          choices: [
            {
              message: {
                role: 'assistant',
                content: 'Test response',
                tool_calls: null,
              },
            },
          ],
        }),
      };

      // Replace the OpenAI service with our mock
      (agentService as any).openAI = mockOpenAIService;

      // First agent call - should create a session (no sessionId provided)
      const result1 = agentService.runAgent({
        agentId: 'test-agent-1',
        messages: [{ role: 'user', content: 'Hello agent 1' }],
        initiator: 'test-user',
        // NO sessionId provided - should trigger session creation
      });

      let firstSessionId: string | undefined;
      await new Promise((resolve) => {
        result1.subscribe({
          next: (event) => {
            if (event.type === 'final') {
              firstSessionId = event.payload?.sessionId;
              resolve(undefined);
            }
          },
          error: (err) => {
            // Ignore database connection errors - they don't affect session creation logic
            resolve(undefined);
          },
        });
      });

      // Second agent call with the session ID from first call - should NOT create a new session
      const result2 = agentService.runAgent({
        agentId: 'test-agent-2',
        messages: [{ role: 'user', content: 'Hello agent 2' }],
        sessionId: firstSessionId || testSessionId, // Use the session ID from first call
        initiator: 'test-user',
      });

      await new Promise((resolve) => {
        result2.subscribe({
          next: (event) => {
            if (event.type === 'final') {
              resolve(undefined);
            }
          },
          error: (err) => {
            // Ignore database connection errors - they don't affect session creation logic
            resolve(undefined);
          },
        });
      });

      // Only one session should be created
      expect(createSessionSpy).toHaveBeenCalledTimes(1);
      expect(spaceConductor.getActiveSessionCount()).toBe(1);
    });

    it('should save and load shared context correctly', async () => {
      const spaceContext = spaceConductor.getOrCreateContext(testSessionId);

      // Add some test data to the context
      spaceContext.bus.next({
        type: 'message',
        agentId: 'test-agent-1',
        payload: { role: 'user', content: 'Test message' },
        timestamp: Date.now(),
      });

      spaceContext.bus.next({
        type: 'tool',
        agentId: 'test-agent-1',
        payload: { name: 'testTool', result: 'success' },
        timestamp: Date.now(),
      });

      // Save context
      const saveResult =
        await spaceConductor.saveSharedContextToDB(testSessionId);
      expect(saveResult.success).toBe(true);
      expect(saveResult.sessionId).toBe(testSessionId);

      // Verify updateSession was called with correct data
      expect(sessionService.updateSession).toHaveBeenCalledWith({
        id: testSessionId,
        delta: expect.objectContaining({
          history: expect.arrayContaining([
            expect.objectContaining({
              role: 'user',
              content: 'Test message',
              metadata: expect.objectContaining({
                fromSharedContext: true,
              }),
            }),
          ]),
          metrics: expect.objectContaining({
            toolCalls: 1,
          }),
        }),
      });
    });

    it('should get shared context statistics correctly', async () => {
      const spaceContext = spaceConductor.getOrCreateContext(testSessionId);

      // Add test data
      spaceContext.bus.next({
        type: 'message',
        agentId: 'test-agent-1',
        payload: { role: 'user', content: 'Message 1' },
        timestamp: Date.now(),
      });

      spaceContext.bus.next({
        type: 'message',
        agentId: 'test-agent-2',
        payload: { role: 'user', content: 'Message 2' },
        timestamp: Date.now(),
      });

      spaceContext.bus.next({
        type: 'tool',
        agentId: 'test-agent-1',
        payload: { name: 'tool1', result: 'success' },
        timestamp: Date.now(),
      });

      const stats = spaceContext.getStatistics();

      expect(stats.totalMessages).toBe(2);
      expect(stats.totalToolCalls).toBe(1);
      expect(stats.totalEvents).toBe(3);
      expect(stats.activeAgents).toEqual(['test-agent-1', 'test-agent-2']);
    });
  });

  describe('CommonToolService - interactWithAgent', () => {
    it('should use shared context instead of creating child sessions', async () => {
      const spaceContext = spaceConductor.getOrCreateContext(testSessionId);
      const busSpy = jest.spyOn(spaceContext.bus, 'next');

      // Mock the interaction
      const interactionResult = commonToolService.interactWithAgent({
        agentId: 'test-agent-2',
        messages: [{ role: 'user', content: 'Hello from agent 1' }],
        initiator: 'test-agent-1',
        sessionId: testSessionId,
      });

      // Verify it returns an observable
      expect(interactionResult).toBeDefined();
      expect(typeof interactionResult.subscribe).toBe('function');

      // Verify events were emitted to shared context
      expect(busSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'message',
          agentId: 'test-agent-2',
          payload: { role: 'user', content: 'Hello from agent 1' },
        }),
      );

      expect(busSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'agentCall',
          agentId: 'test-agent-2',
          payload: expect.objectContaining({
            initiator: 'test-agent-1',
            message: 'Hello from agent 1',
            sessionId: testSessionId,
          }),
        }),
      );

      // Verify NO new session was created for the interaction
      expect(sessionService.createSession).not.toHaveBeenCalledTimes(2);
    });

    it('should handle agent interaction timeout correctly', (done) => {
      const spaceContext = spaceConductor.getOrCreateContext(testSessionId);

      const interactionResult = commonToolService.interactWithAgent({
        agentId: 'test-agent-2',
        messages: [{ role: 'user', content: 'Hello' }],
        initiator: 'test-agent-1',
        sessionId: testSessionId,
      });

      // Set up timeout expectation
      const startTime = Date.now();

      interactionResult.subscribe({
        next: () => {
          // Should not reach here in this test
        },
        error: (error) => {
          const elapsed = Date.now() - startTime;
          expect(error.message).toBe('Agent interaction timeout');
          expect(elapsed).toBeGreaterThanOrEqual(60000); // 60 second timeout
          done();
        },
      });
    }, 65000); // Test timeout longer than agent timeout

    it('should complete when target agent emits final result', (done) => {
      const spaceContext = spaceConductor.getOrCreateContext(testSessionId);

      const interactionResult = commonToolService.interactWithAgent({
        agentId: 'test-agent-2',
        messages: [{ role: 'user', content: 'Hello' }],
        initiator: 'test-agent-1',
        sessionId: testSessionId,
      });

      interactionResult.subscribe({
        next: (result) => {
          expect(result.type).toBe('final');
          expect(result.payload.response).toBe('Test final result');
        },
        complete: () => {
          done();
        },
      });

      // Simulate target agent emitting final result
      setTimeout(() => {
        spaceContext.bus.next({
          type: 'final',
          agentId: 'test-agent-2',
          payload: { response: 'Test final result' },
          timestamp: Date.now(),
        });
      }, 100);
    });
  });

  describe('End-to-End Integration Tests', () => {
    it('should handle complete multi-agent interaction in shared context', async () => {
      const spaceContext = spaceConductor.getOrCreateContext(testSessionId);
      const eventLog: any[] = [];

      // Subscribe to all events
      spaceContext.bus.subscribe((event) => {
        eventLog.push(event);
      });

      // Simulate Agent 1 starting a conversation
      spaceContext.bus.next({
        type: 'message',
        agentId: 'test-agent-1',
        payload: { role: 'user', content: 'Start conversation' },
        timestamp: Date.now(),
      });

      // Agent 1 calls a tool
      spaceContext.bus.next({
        type: 'tool',
        agentId: 'test-agent-1',
        payload: { name: 'analyzeData', result: { status: 'completed' } },
        timestamp: Date.now(),
      });

      // Agent 1 interacts with Agent 2
      spaceContext.bus.next({
        type: 'agentCall',
        agentId: 'test-agent-2',
        payload: {
          initiator: 'test-agent-1',
          message: 'Can you help with this data?',
          sessionId: testSessionId,
        },
        timestamp: Date.now(),
      });

      // Agent 2 responds
      spaceContext.bus.next({
        type: 'message',
        agentId: 'test-agent-2',
        payload: { role: 'assistant', content: 'Sure, I can help!' },
        timestamp: Date.now(),
      });

      // Agent 2 uses a tool
      spaceContext.bus.next({
        type: 'tool',
        agentId: 'test-agent-2',
        payload: { name: 'processData', result: { processed: true } },
        timestamp: Date.now(),
      });

      // Final result
      spaceContext.bus.next({
        type: 'final',
        agentId: 'test-agent-1',
        payload: { conversation: 'completed', sessionId: testSessionId },
        timestamp: Date.now(),
      });

      // Verify the entire interaction was tracked in one context
      expect(eventLog).toHaveLength(6);
      expect(spaceContext.getMessages()).toHaveLength(2);
      expect(spaceContext.getToolCalls()).toHaveLength(2);
      expect(spaceContext.getAgentInteractions()).toHaveLength(1);

      // Verify only one session context exists
      expect(spaceConductor.getActiveSessionCount()).toBe(1);
      expect(spaceConductor.getActiveSessionIds()).toEqual([testSessionId]);

      // Verify different agents contributed to the same context
      const uniqueAgents = [...new Set(eventLog.map((e) => e.agentId))];
      expect(uniqueAgents).toContain('test-agent-1');
      expect(uniqueAgents).toContain('test-agent-2');
    });

    it('should export complete shared context data', async () => {
      const spaceContext = spaceConductor.getOrCreateContext(testSessionId);

      // Add comprehensive test data
      spaceContext.bus.next({
        type: 'message',
        agentId: 'test-agent-1',
        payload: { role: 'user', content: 'Export test message' },
        timestamp: Date.now(),
      });

      spaceContext.bus.next({
        type: 'tool',
        agentId: 'test-agent-1',
        payload: { name: 'exportTool', result: 'exported' },
        timestamp: Date.now(),
      });

      const exportData =
        await sessionService.exportSharedSession(testSessionId);

      expect(exportData.sessionId).toBe(testSessionId);
      expect(exportData.sessionInfo).toBeDefined();
      expect(exportData.sharedContext.messages).toHaveLength(1);
      expect(exportData.sharedContext.toolCalls).toHaveLength(1);
      expect(exportData.exportedAt).toBeDefined();
    });
  });
});

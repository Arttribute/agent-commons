import { Test, TestingModule } from '@nestjs/testing';
import { SpaceConductor } from '~/space/space-conductor.service';
import { SpaceContext } from '~/space/space-context';
import { SessionService } from '~/session/session.service';
import { v4 as uuidv4 } from 'uuid';

describe('Shared Session Context - One Session Only Tests', () => {
  let spaceConductor: SpaceConductor;
  let module: TestingModule;

  beforeEach(async () => {
    // Create a mock SessionService for the tests
    const mockSessionService = {
      updateSession: jest.fn().mockResolvedValue([{}]),
      exportSharedSession: jest.fn().mockResolvedValue({
        sessionId: 'test-session',
        sessionInfo: {},
        sharedContext: { messages: [], toolCalls: [], agentInteractions: [] },
        exportedAt: new Date(),
      }),
    };

    module = await Test.createTestingModule({
      providers: [
        SpaceConductor,
        { provide: SessionService, useValue: mockSessionService },
      ],
    }).compile();

    spaceConductor = module.get<SpaceConductor>(SpaceConductor);
  });

  afterEach(async () => {
    if (module) {
      await module.close();
    }
  });

  describe('Single Session Creation and Reuse', () => {
    it('should create only one session context per sessionId', () => {
      const sessionId = uuidv4();

      // Get context multiple times
      const context1 = spaceConductor.getOrCreateContext(sessionId);
      const context2 = spaceConductor.getOrCreateContext(sessionId);
      const context3 = spaceConductor.getOrCreateContext(sessionId);

      // All should be the same reference
      expect(context1).toBe(context2);
      expect(context2).toBe(context3);
      expect(context1).toBe(context3);

      // Only one session should exist
      expect(spaceConductor.getActiveSessionCount()).toBe(1);
      expect(spaceConductor.getActiveSessionIds()).toEqual([sessionId]);
    });

    it('should handle multiple different sessions correctly', () => {
      const sessionId1 = uuidv4();
      const sessionId2 = uuidv4();
      const sessionId3 = uuidv4();

      const context1 = spaceConductor.getOrCreateContext(sessionId1);
      const context2 = spaceConductor.getOrCreateContext(sessionId2);
      const context3 = spaceConductor.getOrCreateContext(sessionId3);

      // All should be different
      expect(context1).not.toBe(context2);
      expect(context2).not.toBe(context3);
      expect(context1).not.toBe(context3);

      // Three sessions should exist
      expect(spaceConductor.getActiveSessionCount()).toBe(3);
      expect(spaceConductor.getActiveSessionIds()).toContain(sessionId1);
      expect(spaceConductor.getActiveSessionIds()).toContain(sessionId2);
      expect(spaceConductor.getActiveSessionIds()).toContain(sessionId3);
    });

    it('should maintain session context state across multiple accesses', () => {
      const sessionId = uuidv4();

      // First access - add some data
      const context1 = spaceConductor.getOrCreateContext(sessionId);
      context1.bus.next({
        type: 'message',
        agentId: 'agent-1',
        payload: { role: 'user', content: 'Test message' },
        timestamp: Date.now(),
      });

      // Second access - should have the same data
      const context2 = spaceConductor.getOrCreateContext(sessionId);
      expect(context2.getMessages()).toHaveLength(1);
      expect(context2.getMessages()[0].content).toBe('Test message');

      // Add more data
      context2.bus.next({
        type: 'tool',
        agentId: 'agent-1',
        payload: { name: 'testTool', result: 'success' },
        timestamp: Date.now(),
      });

      // Third access - should have all data
      const context3 = spaceConductor.getOrCreateContext(sessionId);
      expect(context3.getMessages()).toHaveLength(1);
      expect(context3.getToolCalls()).toHaveLength(1);
      expect(context3.contributions).toHaveLength(2);

      // Still only one session
      expect(spaceConductor.getActiveSessionCount()).toBe(1);
    });
  });

  describe('Multi-Agent Shared Context', () => {
    it('should allow multiple agents to share the same session context', (done) => {
      const sessionId = uuidv4();
      const context = spaceConductor.getOrCreateContext(sessionId);

      const events: any[] = [];

      // Subscribe to all events
      context.bus.subscribe((event) => {
        events.push(event);

        // When we have events from both agents, check the results
        if (events.length === 4) {
          // Verify we have events from both agents in the same context
          const agent1Events = events.filter((e) => e.agentId === 'agent-1');
          const agent2Events = events.filter((e) => e.agentId === 'agent-2');

          expect(agent1Events).toHaveLength(2);
          expect(agent2Events).toHaveLength(2);

          // Verify context state includes all events
          expect(context.getMessages()).toHaveLength(2);
          expect(context.getToolCalls()).toHaveLength(2);
          expect(context.contributions).toHaveLength(4);

          // Still only one session
          expect(spaceConductor.getActiveSessionCount()).toBe(1);

          done();
        }
      });

      // Agent 1 sends a message
      context.bus.next({
        type: 'message',
        agentId: 'agent-1',
        payload: { role: 'user', content: 'Hello from agent 1' },
        timestamp: Date.now(),
      });

      // Agent 1 uses a tool
      context.bus.next({
        type: 'tool',
        agentId: 'agent-1',
        payload: { name: 'agent1Tool', result: 'completed' },
        timestamp: Date.now(),
      });

      // Agent 2 responds
      context.bus.next({
        type: 'message',
        agentId: 'agent-2',
        payload: { role: 'assistant', content: 'Hello from agent 2' },
        timestamp: Date.now(),
      });

      // Agent 2 uses a tool
      context.bus.next({
        type: 'tool',
        agentId: 'agent-2',
        payload: { name: 'agent2Tool', result: 'processed' },
        timestamp: Date.now(),
      });
    });

    it('should handle agent interactions without creating child sessions', () => {
      const sessionId = uuidv4();
      const context = spaceConductor.getOrCreateContext(sessionId);

      // Simulate agent interaction (what interactWithAgent would do)
      context.bus.next({
        type: 'agentCall',
        agentId: 'target-agent',
        payload: {
          initiator: 'calling-agent',
          message: 'Can you help me?',
          sessionId: sessionId,
          timestamp: Date.now(),
        },
        timestamp: Date.now(),
      });

      // Verify the interaction is tracked in the shared context
      expect(context.getAgentInteractions()).toHaveLength(1);
      expect(context.getAgentInteractions()[0].agentId).toBe('target-agent');
      expect(context.getAgentInteractions()[0].payload.initiator).toBe(
        'calling-agent',
      );

      // Still only one session
      expect(spaceConductor.getActiveSessionCount()).toBe(1);

      // No new sessions created for the interaction
      expect(spaceConductor.getActiveSessionIds()).toEqual([sessionId]);
    });
  });

  describe('Session Lifecycle', () => {
    it('should clear sessions properly', () => {
      const sessionId1 = uuidv4();
      const sessionId2 = uuidv4();

      // Create contexts
      const context1 = spaceConductor.getOrCreateContext(sessionId1);
      const context2 = spaceConductor.getOrCreateContext(sessionId2);

      expect(spaceConductor.getActiveSessionCount()).toBe(2);

      // Clear one session
      const cleared = spaceConductor.clearContext(sessionId1);

      expect(cleared).toBe(true);
      expect(spaceConductor.getActiveSessionCount()).toBe(1);
      expect(spaceConductor.hasContext(sessionId1)).toBe(false);
      expect(spaceConductor.hasContext(sessionId2)).toBe(true);

      // Clear the other session
      spaceConductor.clearContext(sessionId2);

      expect(spaceConductor.getActiveSessionCount()).toBe(0);
      expect(spaceConductor.getActiveSessionIds()).toEqual([]);
    });

    it('should handle session recreation after clearing', () => {
      const sessionId = uuidv4();

      // Create and populate context
      const context1 = spaceConductor.getOrCreateContext(sessionId);
      context1.bus.next({
        type: 'message',
        agentId: 'agent-1',
        payload: { role: 'user', content: 'Original message' },
        timestamp: Date.now(),
      });

      expect(context1.getMessages()).toHaveLength(1);

      // Clear the context
      spaceConductor.clearContext(sessionId);
      expect(spaceConductor.hasContext(sessionId)).toBe(false);

      // Recreate context - should be fresh
      const context2 = spaceConductor.getOrCreateContext(sessionId);
      expect(context2.getMessages()).toHaveLength(0);
      expect(context2.contributions).toHaveLength(0);

      // Should be a different instance
      expect(context1).not.toBe(context2);

      // But same sessionId should still work
      const context3 = spaceConductor.getOrCreateContext(sessionId);
      expect(context2).toBe(context3);
    });
  });

  describe('Performance and Memory', () => {
    it('should handle many concurrent sessions efficiently', () => {
      const sessionCount = 100;
      const sessionIds: string[] = [];
      const contexts: SpaceContext[] = [];

      // Create many sessions
      for (let i = 0; i < sessionCount; i++) {
        const sessionId = uuidv4();
        sessionIds.push(sessionId);

        const context = spaceConductor.getOrCreateContext(sessionId);
        contexts.push(context);

        // Add some data to each
        context.bus.next({
          type: 'message',
          agentId: `agent-${i}`,
          payload: { role: 'user', content: `Message ${i}` },
          timestamp: Date.now(),
        });
      }

      expect(spaceConductor.getActiveSessionCount()).toBe(sessionCount);

      // Verify each session is separate
      for (let i = 0; i < sessionCount; i++) {
        const context = spaceConductor.getOrCreateContext(sessionIds[i]);
        expect(context).toBe(contexts[i]);
        expect(context.getMessages()).toHaveLength(1);
        expect(context.getMessages()[0].content).toBe(`Message ${i}`);
      }

      // Clean up
      sessionIds.forEach((id) => spaceConductor.clearContext(id));
      expect(spaceConductor.getActiveSessionCount()).toBe(0);
    });

    it('should not leak memory when sessions are cleared', () => {
      const initialCount = spaceConductor.getActiveSessionCount();
      const sessionIds: string[] = [];

      // Create sessions
      for (let i = 0; i < 10; i++) {
        const sessionId = uuidv4();
        sessionIds.push(sessionId);

        const context = spaceConductor.getOrCreateContext(sessionId);
        // Add data that could potentially leak
        for (let j = 0; j < 10; j++) {
          context.bus.next({
            type: 'message',
            agentId: `agent-${i}`,
            payload: {
              role: 'user',
              content: `Large message content ${j}`.repeat(100),
            },
            timestamp: Date.now(),
          });
        }
      }

      expect(spaceConductor.getActiveSessionCount()).toBe(initialCount + 10);

      // Clear all sessions
      sessionIds.forEach((id) => {
        const cleared = spaceConductor.clearContext(id);
        expect(cleared).toBe(true);
      });

      // Should be back to initial state
      expect(spaceConductor.getActiveSessionCount()).toBe(initialCount);

      // Sessions should not exist
      sessionIds.forEach((id) => {
        expect(spaceConductor.hasContext(id)).toBe(false);
      });
    });
  });
});

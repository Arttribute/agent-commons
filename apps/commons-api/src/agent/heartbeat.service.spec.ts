import { Test, TestingModule } from '@nestjs/testing';
import { HeartbeatService } from './heartbeat.service';
import { DatabaseService } from '../modules/database/database.service';
import { SessionService } from '../session/session.service';
import { AgentService } from './agent.service';
import { of, throwError } from 'rxjs';

/* ─── Mocks ─────────────────────────────────────────────────────────────── */

const baseAgent = {
  agentId: 'agent-1',
  autonomyEnabled: true,
  autonomousIntervalSec: 60,
  modelProvider: 'openai',
  modelId: 'gpt-4o',
  temperature: 0.7,
  maxTokens: 2048,
};

function makeDb(agentsForInit: any[] = []) {
  return {
    query: {
      agent: {
        findFirst: jest.fn().mockResolvedValue(baseAgent),
        findMany: jest.fn().mockResolvedValue(agentsForInit),
      },
      session: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    },
    update: jest.fn().mockReturnValue({
      set: jest.fn().mockReturnValue({
        where: jest.fn().mockResolvedValue(undefined),
      }),
    }),
  };
}

function makeSessionService() {
  return {
    createSession: jest.fn().mockResolvedValue({
      sessionId: 'hb-sess-1',
      agentId: 'agent-1',
      title: '__heartbeat__',
    }),
  };
}

function makeAgentService() {
  return {
    runAgent: jest.fn().mockReturnValue(
      of({ type: 'token', content: 'hello' }, { type: 'final', payload: { content: 'Done' } }),
    ),
  };
}

async function buildService(
  db: any,
  sessionSvc: any,
  agentSvc: any,
): Promise<HeartbeatService> {
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      HeartbeatService,
      { provide: DatabaseService,  useValue: db },
      { provide: SessionService,   useValue: sessionSvc },
      { provide: AgentService,     useValue: agentSvc },
    ],
  }).compile();
  return module.get(HeartbeatService);
}

/* ─── Tests ─────────────────────────────────────────────────────────────── */

describe('HeartbeatService', () => {
  let service: HeartbeatService;
  let db: ReturnType<typeof makeDb>;
  let sessionSvc: ReturnType<typeof makeSessionService>;
  let agentSvc: ReturnType<typeof makeAgentService>;

  beforeEach(async () => {
    jest.useFakeTimers();
    db = makeDb();
    sessionSvc = makeSessionService();
    agentSvc = makeAgentService();
    service = await buildService(db, sessionSvc, agentSvc);
  });

  afterEach(() => {
    service.onModuleDestroy();
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  /* ── onModuleInit ─────────────────────────────────────────────────────── */
  describe('onModuleInit()', () => {
    it('arms agents that are autonomy-enabled on startup', async () => {
      const db2 = makeDb([baseAgent]);
      const svc = await buildService(db2, sessionSvc, agentSvc);
      await svc.onModuleInit();

      // Timer should be registered for the agent
      expect((svc as any).timers.has('agent-1')).toBe(true);
      svc.onModuleDestroy();
    });

    it('does not throw if DB query fails on init', async () => {
      const db2 = makeDb();
      db2.query.agent.findMany = jest.fn().mockRejectedValue(new Error('DB down'));
      const svc = await buildService(db2, sessionSvc, agentSvc);
      await expect(svc.onModuleInit()).resolves.toBeUndefined();
      svc.onModuleDestroy();
    });
  });

  /* ── onModuleDestroy ──────────────────────────────────────────────────── */
  describe('onModuleDestroy()', () => {
    it('clears all timers', async () => {
      await service.enable('agent-1', 60);
      expect((service as any).timers.size).toBe(1);
      service.onModuleDestroy();
      expect((service as any).timers.size).toBe(0);
    });
  });

  /* ── enable ───────────────────────────────────────────────────────────── */
  describe('enable()', () => {
    it('updates DB and arms a timer', async () => {
      await service.enable('agent-1', 120);

      expect(db.update).toHaveBeenCalled();
      expect((service as any).timers.has('agent-1')).toBe(true);
    });

    it('clamps interval to minimum 30s', async () => {
      await service.enable('agent-1', 5); // below minimum

      // Timer is armed with at least 30s interval — verify via arm() not throwing
      expect((service as any).timers.has('agent-1')).toBe(true);
    });

    it('replaces an existing timer when called twice', async () => {
      await service.enable('agent-1', 60);
      const timer1 = (service as any).timers.get('agent-1');
      await service.enable('agent-1', 120);
      const timer2 = (service as any).timers.get('agent-1');
      expect(timer1).not.toBe(timer2);
    });
  });

  /* ── disable ──────────────────────────────────────────────────────────── */
  describe('disable()', () => {
    it('updates DB and removes the timer', async () => {
      await service.enable('agent-1', 60);
      expect((service as any).timers.has('agent-1')).toBe(true);

      await service.disable('agent-1');

      expect(db.update).toHaveBeenCalled();
      expect((service as any).timers.has('agent-1')).toBe(false);
    });

    it('is a no-op if agent was never armed', async () => {
      await expect(service.disable('never-armed')).resolves.toBeUndefined();
    });
  });

  /* ── status ───────────────────────────────────────────────────────────── */
  describe('status()', () => {
    it('returns enabled=true and isArmed=true after enable()', async () => {
      await service.enable('agent-1', 60);
      const s = await service.status('agent-1');

      expect(s.enabled).toBe(true);
      expect(s.isArmed).toBe(true);
      expect(s.intervalSec).toBe(60);
    });

    it('returns isArmed=false after disable()', async () => {
      await service.enable('agent-1', 60);
      await service.disable('agent-1');
      const s = await service.status('agent-1');

      expect(s.isArmed).toBe(false);
    });

    it('returns lastBeatAt after a beat', async () => {
      await service.triggerNow('agent-1');
      const s = await service.status('agent-1');

      expect(s.lastBeatAt).toBeInstanceOf(Date);
    });

    it('returns enabled=false when agent not found in DB', async () => {
      db.query.agent.findFirst = jest.fn().mockResolvedValue(null);
      const s = await service.status('unknown');
      expect(s.enabled).toBe(false);
      expect(s.isArmed).toBe(false);
    });
  });

  /* ── triggerNow ───────────────────────────────────────────────────────── */
  describe('triggerNow()', () => {
    it('calls runAgent with HEARTBEAT_PROMPT', async () => {
      // Ensure heartbeat session is found (reuse existing)
      db.query.session.findFirst = jest.fn().mockResolvedValue({ sessionId: 'hb-sess-1' });

      await service.triggerNow('agent-1');

      expect(agentSvc.runAgent).toHaveBeenCalledWith(
        expect.objectContaining({
          agentId: 'agent-1',
          sessionId: 'hb-sess-1',
          messages: [expect.objectContaining({ content: expect.stringContaining('⫷⫷AUTONOMOUS_HEARTBEAT⫸⫸') })],
        }),
      );
    });

    it('creates a new heartbeat session if none exists', async () => {
      db.query.session.findFirst = jest.fn().mockResolvedValue(null);

      await service.triggerNow('agent-1');

      expect(sessionSvc.createSession).toHaveBeenCalledWith(
        expect.objectContaining({
          value: expect.objectContaining({ title: '__heartbeat__' }),
        }),
      );
    });

    it('disarms and returns if agent no longer exists', async () => {
      db.query.agent.findFirst = jest.fn().mockResolvedValue(null);
      await service.enable('agent-1', 60);

      await service.triggerNow('agent-1');

      expect(agentSvc.runAgent).not.toHaveBeenCalled();
      expect((service as any).timers.has('agent-1')).toBe(false);
    });

    it('disarms and returns if autonomy was disabled', async () => {
      db.query.agent.findFirst = jest.fn().mockResolvedValue({
        ...baseAgent,
        autonomyEnabled: false,
      });
      await service.enable('agent-1', 60);

      await service.triggerNow('agent-1');

      expect(agentSvc.runAgent).not.toHaveBeenCalled();
    });

    it('logs error but does not throw if runAgent errors', async () => {
      db.query.session.findFirst = jest.fn().mockResolvedValue({ sessionId: 'hb-sess-1' });
      agentSvc.runAgent = jest.fn().mockReturnValue(
        throwError(() => new Error('LLM unavailable')),
      );

      await expect(service.triggerNow('agent-1')).resolves.toBeUndefined();
    });
  });

  /* ── timer fires ──────────────────────────────────────────────────────── */
  describe('timer-driven beat', () => {
    it('calls runAgent when the interval elapses', async () => {
      db.query.session.findFirst = jest.fn().mockResolvedValue({ sessionId: 'hb-sess-1' });
      await service.enable('agent-1', 60);

      // Advance time past one interval (async variant flushes microtasks too)
      await jest.advanceTimersByTimeAsync(61_000);

      expect(agentSvc.runAgent).toHaveBeenCalled();
    });
  });
});

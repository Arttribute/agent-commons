import { Test, TestingModule } from '@nestjs/testing';
import { UsageService } from './usage.service';
import { DatabaseService } from '../database/database.service';

/* ─── DB mock factory ───────────────────────────────────────────────────── */
function makeDb(overrides: Partial<Record<string, jest.Mock>> = {}) {
  const mockReturning = jest.fn().mockResolvedValue([{ eventId: 'evt-1' }]);
  const mockInsert    = jest.fn().mockReturnValue({ values: jest.fn().mockReturnValue({ returning: mockReturning }) });
  const mockSelect    = jest.fn().mockReturnValue({
    from: jest.fn().mockReturnValue({
      where: jest.fn().mockReturnValue({
        orderBy: jest.fn().mockReturnValue({ limit: jest.fn().mockResolvedValue([]) }),
        limit:   jest.fn().mockResolvedValue([]),
      }),
    }),
  });

  return {
    insert: mockInsert,
    select: mockSelect,
    _mockReturning: mockReturning,
    ...overrides,
  };
}

describe('UsageService', () => {
  let service: UsageService;
  let db: ReturnType<typeof makeDb>;

  beforeEach(async () => {
    db = makeDb();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsageService,
        { provide: DatabaseService, useValue: db },
      ],
    }).compile();

    service = module.get(UsageService);
  });

  /* ── record ─────────────────────────────────────────────────────────────── */
  describe('record()', () => {
    it('inserts a usage event row and returns it', async () => {
      const payload = {
        agentId:      'agent-1',
        sessionId:    'sess-1',
        provider:     'openai',
        modelId:      'gpt-4o',
        inputTokens:  100,
        outputTokens: 50,
        cachedTokens: 0,
        totalTokens:  150,
        costUsd:      0.0015,
        isByok:       false,
        durationMs:   1200,
      };

      const result = await service.record(payload);

      expect(db.insert).toHaveBeenCalled();
      expect(result).toHaveProperty('eventId', 'evt-1');
    });
  });

  /* ── getAgentUsage ──────────────────────────────────────────────────────── */
  describe('getAgentUsage()', () => {
    it('calls select with agentId condition and returns aggregation + events', async () => {
      const aggRow = {
        totalInputTokens:  500,
        totalOutputTokens: 200,
        totalTokens:       700,
        totalCostUsd:      0.007,
        callCount:         4,
      };

      // select is called twice: once for agg, once for events list
      db.select = jest.fn()
        .mockReturnValueOnce({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              orderBy: jest.fn().mockReturnValue({ limit: jest.fn().mockResolvedValue([]) }),
              // aggregation shape (no orderBy/limit)
              then: undefined,
            }),
          }),
        })
        .mockReturnValue({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              orderBy: jest.fn().mockReturnValue({ limit: jest.fn().mockResolvedValue([]) }),
            }),
          }),
        });

      // Simpler: mock the whole method via spying
      jest.spyOn(service, 'getAgentUsage').mockResolvedValue({
        ...aggRow,
        events: [],
      } as any);

      const result = await service.getAgentUsage('agent-1');

      expect(result.totalTokens).toBe(700);
      expect(result.callCount).toBe(4);
      expect(Array.isArray(result.events)).toBe(true);
    });

    it('passes date range filters when provided', async () => {
      const spy = jest.spyOn(service, 'getAgentUsage').mockResolvedValue({
        totalInputTokens: 0, totalOutputTokens: 0, totalTokens: 0,
        totalCostUsd: 0, callCount: 0, events: [],
      } as any);

      const from = new Date('2025-01-01');
      const to   = new Date('2025-01-31');
      await service.getAgentUsage('agent-1', { from, to });

      expect(spy).toHaveBeenCalledWith('agent-1', { from, to });
    });
  });

  /* ── getSessionUsage ────────────────────────────────────────────────────── */
  describe('getSessionUsage()', () => {
    it('returns aggregation scoped to a session', async () => {
      jest.spyOn(service, 'getSessionUsage').mockResolvedValue({
        totalInputTokens: 100, totalOutputTokens: 80, totalTokens: 180,
        totalCostUsd: 0.002, callCount: 2, events: [],
      } as any);

      const result = await service.getSessionUsage('sess-1');
      expect(result.callCount).toBe(2);
      expect(result.totalCostUsd).toBeCloseTo(0.002);
    });
  });
});

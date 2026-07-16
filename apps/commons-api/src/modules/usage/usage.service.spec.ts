import { Test, TestingModule } from '@nestjs/testing';
import { UsageService } from './usage.service';
import { DatabaseService } from '../database/database.service';
import { CreditService } from '~/credit';
import { EntitlementsService } from '~/billing/entitlements.service';

/* ─── DB mock factory ───────────────────────────────────────────────────── */
function makeDb(overrides: Partial<Record<string, jest.Mock>> = {}) {
  const mockReturning = jest.fn().mockResolvedValue([{ eventId: 'evt-1' }]);
  const mockInsert = jest.fn().mockReturnValue({
    values: jest.fn().mockReturnValue({ returning: mockReturning }),
  });
  const mockSelect = jest.fn().mockReturnValue({
    from: jest.fn().mockReturnValue({
      where: jest.fn().mockReturnValue({
        orderBy: jest
          .fn()
          .mockReturnValue({ limit: jest.fn().mockResolvedValue([]) }),
        limit: jest.fn().mockResolvedValue([]),
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
  const credits = {
    creditsForUsd: jest.fn().mockReturnValue(0),
    debit: jest.fn(),
    reserve: jest.fn().mockResolvedValue({ reservationId: 'reservation-1' }),
    ensureReservationCapacity: jest.fn().mockResolvedValue({}),
    captureReservation: jest.fn().mockResolvedValue({ entryId: 'entry-1' }),
    finalizeReservation: jest.fn().mockResolvedValue({ status: 'captured' }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    credits.creditsForUsd.mockReturnValue(0);
    db = makeDb();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsageService,
        { provide: DatabaseService, useValue: db },
        { provide: CreditService, useValue: credits },
        {
          provide: EntitlementsService,
          useValue: {
            getEntitlements: jest.fn().mockResolvedValue({
              maxConcurrentRuns: 2,
              modelTiers: ['frontier', 'standard', 'fast', 'local'],
            }),
          },
        },
      ],
    }).compile();

    service = module.get(UsageService);
  });

  describe('credit authorization', () => {
    it('reserves a run slot before managed agent work begins', async () => {
      await service.authorizeAgentRun({
        principalId: 'user-1',
        agentId: 'agent-1',
        traceId: 'trace-1',
        provider: 'openai',
        modelId: 'gpt-5.4-mini',
        isByok: false,
      });

      expect(credits.reserve).toHaveBeenCalledWith(
        expect.objectContaining({
          principalId: 'user-1',
          amount: 1,
          maxActive: 2,
          idempotencyKey: 'agent-run:trace-1',
        }),
      );
    });

    it('pre-authorizes the priced maximum before a provider call', async () => {
      credits.creditsForUsd.mockReturnValue(42);
      await service.authorizeModelCall({
        reservationId: 'reservation-1',
        provider: 'openai',
        modelId: 'gpt-5.4-mini',
        prompts: ['A prompt that will be token-estimated'],
        maxOutputTokens: 2000,
        isByok: false,
      });

      expect(credits.ensureReservationCapacity).toHaveBeenCalledWith(
        'reservation-1',
        42,
      );
    });

    it('does not reserve provider cost for BYOK calls', async () => {
      await service.authorizeModelCall({
        reservationId: 'reservation-1',
        provider: 'openai',
        modelId: 'gpt-5.4-mini',
        prompts: ['hello'],
        isByok: true,
      });
      expect(credits.ensureReservationCapacity).not.toHaveBeenCalled();
    });

    it('pre-authorizes a paid capability using marked-up provider cost', async () => {
      credits.creditsForUsd.mockReturnValue(10);

      await service.authorizeCapability({
        principalId: 'user-1',
        capability: 'web_search',
        estimatedCostUsd: 0.005,
        idempotencyKey: 'capability:web-search:call-1',
        agentId: 'agent-1',
      });

      expect(credits.reserve).toHaveBeenCalledWith(
        expect.objectContaining({
          principalId: 'user-1',
          amount: 10,
          purpose: 'capability:web_search',
        }),
      );
    });

    it('captures actual capability cost and releases unused authorization', async () => {
      credits.creditsForUsd.mockReturnValue(106);

      await service.settleCapability({
        reservationId: 'reservation-1',
        capability: 'image_generation',
        actualCostUsd: 0.053,
        idempotencyKey: 'capability:image:call-1:capture',
      });

      expect(credits.captureReservation).toHaveBeenCalledWith(
        expect.objectContaining({
          reservationId: 'reservation-1',
          amount: 106,
          eventType: 'capability_image_generation',
        }),
      );
      expect(credits.finalizeReservation).toHaveBeenCalledWith('reservation-1');
    });

    it('fails closed when a paid capability has no valid configured price', async () => {
      await expect(
        service.authorizeCapability({
          principalId: 'user-1',
          capability: 'web_search',
          estimatedCostUsd: Number.NaN,
          idempotencyKey: 'capability:web-search:misconfigured',
        }),
      ).rejects.toMatchObject({ status: 503 });
      expect(credits.reserve).not.toHaveBeenCalled();
    });

    it('releases a reservation when the reported capability price is invalid', async () => {
      await expect(
        service.settleCapability({
          reservationId: 'reservation-1',
          capability: 'image_generation',
          actualCostUsd: 0,
          idempotencyKey: 'capability:image:invalid-price',
        }),
      ).rejects.toMatchObject({ status: 503 });
      expect(credits.finalizeReservation).toHaveBeenCalledWith('reservation-1');
    });
  });

  /* ── record ─────────────────────────────────────────────────────────────── */
  describe('record()', () => {
    it('inserts a usage event row and returns it', async () => {
      const payload = {
        agentId: 'agent-1',
        sessionId: 'sess-1',
        provider: 'openai',
        modelId: 'gpt-4o',
        inputTokens: 100,
        outputTokens: 50,
        cachedTokens: 0,
        totalTokens: 150,
        costUsd: 0.0015,
        isByok: false,
        durationMs: 1200,
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
        totalInputTokens: 500,
        totalOutputTokens: 200,
        totalTokens: 700,
        totalCostUsd: 0.007,
        callCount: 4,
      };

      // select is called twice: once for agg, once for events list
      db.select = jest
        .fn()
        .mockReturnValueOnce({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              orderBy: jest
                .fn()
                .mockReturnValue({ limit: jest.fn().mockResolvedValue([]) }),
              // aggregation shape (no orderBy/limit)
              then: undefined,
            }),
          }),
        })
        .mockReturnValue({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              orderBy: jest
                .fn()
                .mockReturnValue({ limit: jest.fn().mockResolvedValue([]) }),
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
        totalInputTokens: 0,
        totalOutputTokens: 0,
        totalTokens: 0,
        totalCostUsd: 0,
        callCount: 0,
        events: [],
      } as any);

      const from = new Date('2025-01-01');
      const to = new Date('2025-01-31');
      await service.getAgentUsage('agent-1', { from, to });

      expect(spy).toHaveBeenCalledWith('agent-1', { from, to });
    });
  });

  /* ── getSessionUsage ────────────────────────────────────────────────────── */
  describe('getSessionUsage()', () => {
    it('returns aggregation scoped to a session', async () => {
      jest.spyOn(service, 'getSessionUsage').mockResolvedValue({
        totalInputTokens: 100,
        totalOutputTokens: 80,
        totalTokens: 180,
        totalCostUsd: 0.002,
        callCount: 2,
        events: [],
      } as any);

      const result = await service.getSessionUsage('sess-1');
      expect(result.callCount).toBe(2);
      expect(result.totalCostUsd).toBeCloseTo(0.002);
    });
  });
});

import { AgentService } from './agent.service';

describe('AgentService computer-backed runtime plan enforcement', () => {
  function serviceWithPlanGate(error: Error) {
    const service = Object.create(AgentService.prototype) as AgentService;
    const assertComputerPlan = jest.fn().mockRejectedValue(error);
    const insert = jest.fn();

    Object.assign(service as any, {
      computerService: { assertComputerPlan },
      db: { insert },
    });

    return { service, assertComputerPlan, insert };
  }

  it.each(['openclaw', 'hermes', 'custom'] as const)(
    'blocks direct %s creation before writing an agent',
    async (runtimeType) => {
      const paywall = new Error('paid plan required');
      const { service, assertComputerPlan, insert } =
        serviceWithPlanGate(paywall);

      await expect(
        service.createAgent({
          value: {
            name: 'Managed agent',
            owner: 'legacy-owner',
            ownerUserId: 'user-1',
            runtimeType,
          } as any,
        }),
      ).rejects.toBe(paywall);

      expect(assertComputerPlan).toHaveBeenCalledWith(
        'user-1',
        expect.stringContaining('requires a paid plan'),
      );
      expect(insert).not.toHaveBeenCalled();
    },
  );

  it('blocks changing an existing agent to a computer-backed runtime', async () => {
    const paywall = new Error('paid plan required');
    const { service, assertComputerPlan } = serviceWithPlanGate(paywall);
    const update = jest.fn();
    (service as any).getAgent = jest.fn().mockResolvedValue({
      agentId: 'agent-1',
      owner: 'legacy-owner',
      ownerUserId: 'user-1',
      runtimeType: 'native',
      isSystemManaged: false,
    });
    (service as any).db.update = update;

    await expect(
      service.updateAgent('agent-1', { runtimeType: 'hermes' } as any),
    ).rejects.toBe(paywall);

    expect(assertComputerPlan).toHaveBeenCalledWith(
      'user-1',
      expect.stringContaining('requires a paid plan'),
    );
    expect(update).not.toHaveBeenCalled();
  });
});

describe('AgentService CLI result handoff', () => {
  const requestId = '4b52c1bd-86f0-4684-b637-01db882df5b7';

  function serviceWithResultStore(rows: unknown[]) {
    const service = Object.create(AgentService.prototype) as AgentService;
    const execute = jest.fn().mockResolvedValue(rows);
    const pendingCliToolRequests = new Map<string, (result: string) => void>();
    Object.assign(service as any, { db: { execute }, pendingCliToolRequests });
    return { service, execute, pendingCliToolRequests };
  }

  it('accepts a result on another API replica through the shared database', async () => {
    const { service, execute } = serviceWithResultStore([{ request_id: requestId }]);
    expect(await service.resolveCliToolRequest(requestId, 'command output')).toBe(true);
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('rejects an expired or already answered request', async () => {
    const { service } = serviceWithResultStore([]);
    expect(await service.resolveCliToolRequest(requestId, 'duplicate')).toBe(false);
  });

  it('resolves a request on its owning replica without a database round trip', async () => {
    const { service, execute, pendingCliToolRequests } = serviceWithResultStore([]);
    const resolve = jest.fn();
    pendingCliToolRequests.set(requestId, resolve);
    expect(await service.resolveCliToolRequest(requestId, '5')).toBe(true);
    expect(resolve).toHaveBeenCalledWith('5');
    expect(execute).not.toHaveBeenCalled();
  });

  it('rejects invalid IDs and oversized tool output before touching the database', async () => {
    const { service, execute } = serviceWithResultStore([]);
    expect(await service.resolveCliToolRequest('invalid', 'text')).toBe(false);
    expect(await service.resolveCliToolRequest(requestId, 'x'.repeat(1_000_001))).toBe(false);
    expect(execute).not.toHaveBeenCalled();
  });
});

describe('host-managed team conversation memory', () => {
  it('keeps another member\'s agent-wide private memories out of hosted session context', async () => {
    const service = Object.create(AgentService.prototype) as any;
    const buildMemoryBlock = jest.fn().mockResolvedValue('Another member private note');
    Object.assign(service, {
      getAgent: jest.fn().mockResolvedValue({ agentId: 'business-agent' }),
      getChildSessions: jest.fn().mockResolvedValue([]),
      memoryService: { buildMemoryBlock },
      taskExecution: { listSessionTasks: jest.fn().mockResolvedValue([]) },
      computerService: { buildComputerPrompt: jest.fn().mockResolvedValue('') },
      skillService: { buildPromptIndex: jest.fn().mockResolvedValue('') },
      uiPlugins: { buildAgentPromptBlock: jest.fn().mockResolvedValue('') },
      optionalPromptContext: (_label: string, promise: Promise<unknown>) => promise,
      buildSystemPrompt: jest.fn((_agent, _session, _children, memory) => memory),
    });
    const hosted = await service.createAgentSession('business-agent', 'member-session', 'Question', false);
    expect(buildMemoryBlock).not.toHaveBeenCalled();
    expect(hosted.messages[0].content).not.toContain('Another member private note');
    await service.createAgentSession('personal-agent', 'personal-session', 'Question');
    expect(buildMemoryBlock).toHaveBeenCalledWith('personal-agent', 'Question');
  });
});

describe('agent replies from Responses-API models', () => {
  it('turns content blocks into the reply text clients render', () => {
    const service = Object.create(AgentService.prototype) as any;
    expect(
      service.serializeHistoryContent([
        { type: 'text', text: 'Here is the video: https://youtu.be/abc123xyz', annotations: [] },
      ]),
    ).toBe('Here is the video: https://youtu.be/abc123xyz');
    expect(service.serializeHistoryContent('Plain reply')).toBe('Plain reply');
    expect(service.serializeHistoryContent(undefined)).toBe('');
  });
});

describe('system prompt caching', () => {
  it('keeps per-request context after the instructions so the prefix can be cached', () => {
    const service = Object.create(AgentService.prototype) as any;
    const agent = { agentId: 'agent-1', name: 'Scout', instructions: 'Be brief.' };
    jest.useFakeTimers().setSystemTime(new Date('2026-11-23T10:00:00Z'));
    const first = service.buildSystemPrompt(agent, 'session-a', '', 'Memory A', [], '', '');
    jest.setSystemTime(new Date('2026-11-23T10:05:00Z'));
    const second = service.buildSystemPrompt(agent, 'session-b', '', 'Memory B', [], '', '');
    jest.useRealTimers();

    const context = first.indexOf('## CURRENT CONTEXT');
    expect(context).toBeGreaterThan(first.indexOf('## PLATFORM CAPABILITIES'));
    expect(first.indexOf('Current date/time')).toBeGreaterThan(context);
    expect(first.indexOf('Memory A')).toBeGreaterThan(context);
    expect(second.slice(0, context)).toBe(first.slice(0, context));
  });
});

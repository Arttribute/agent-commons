import { ProvenanceService } from './provenance.service';

describe('ProvenanceService', () => {
  type TestQueue = Array<{ kind: string; value?: Record<string, any> }>;
  const createService = () => new ProvenanceService({} as never);
  const runBase = {
    sessionId: '00000000-0000-4000-8000-000000000010',
    provider: 'test',
    modelId: 'test-model',
  };
  const queueOf = (service: ProvenanceService) =>
    (service as unknown as { queue: TestQueue }).queue;

  afterEach(() => {
    delete process.env.PROVENANCE_ONCHAIN_ENABLED;
    delete process.env.PROVENANCE_FULL_CAPTURE_ENABLED;
  });

  it('defaults to structural metadata without storing prompt content', () => {
    const service = createService();
    service.startRun({
      ...runBase,
      traceId: '00000000-0000-4000-8000-000000000001',
      agentId: '00000000-0000-4000-8000-000000000002',
      input: { prompt: 'do not persist me', authorization: 'secret' },
    });

    const event = queueOf(service).find((item) => item.kind === 'event')?.value;
    expect(JSON.stringify(event)).not.toContain('do not persist me');
    expect(JSON.stringify(event)).not.toContain('secret');
    expect(event?.payload).toMatchObject({ type: 'object' });
  });

  it('redacts secrets and private reasoning during explicit full capture', () => {
    const service = createService();
    service.startRun({
      ...runBase,
      traceId: '00000000-0000-4000-8000-000000000003',
      agentId: '00000000-0000-4000-8000-000000000004',
      options: { mode: 'full' },
    });
    service.recordEvent('00000000-0000-4000-8000-000000000003', {
      category: 'model',
      eventType: 'gen_ai.chat',
      name: 'Model call',
      payload: {
        authorization: 'Bearer secret',
        reasoning: 'private chain of thought',
        answer: 'disclosed answer',
      },
    });

    const event = queueOf(service)
      .filter((item) => item.kind === 'event')
      .at(-1)?.value;
    expect(event?.payload).toMatchObject({
      authorization: '[redacted]',
      reasoning: '[not captured]',
      answer: 'disclosed answer',
    });
    expect(JSON.stringify(event?.contentHash)).not.toContain('private chain of thought');
  });

  it('records an unavailable request without invoking an on-chain sink', () => {
    process.env.PROVENANCE_ONCHAIN_ENABLED = 'false';
    const service = createService();
    service.startRun({
      ...runBase,
      traceId: '00000000-0000-4000-8000-000000000005',
      agentId: '00000000-0000-4000-8000-000000000006',
      options: { onchain: true },
    });
    const run = queueOf(service).find((item) => item.kind === 'start')?.value;
    expect(run).toMatchObject({
      onchainRequested: true,
      anchorStatus: 'unavailable',
    });
  });
});

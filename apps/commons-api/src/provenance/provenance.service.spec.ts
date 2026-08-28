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
    expect(JSON.stringify(event?.contentHash)).not.toContain(
      'private chain of thought',
    );
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

  it('keeps web query, provider and canonical ranked sources in metadata mode', () => {
    const service = createService();
    const traceId = '00000000-0000-4000-8000-000000000007';
    service.startRun({
      ...runBase,
      traceId,
      agentId: '00000000-0000-4000-8000-000000000008',
    });
    service.recordEvent(traceId, {
      category: 'tool',
      eventType: 'tool.execute',
      name: 'webSearch',
      spanId: 'call-1',
      payload: JSON.stringify({ query: 'source transparency' }),
      result: {
        query: 'source transparency',
        provider: 'brave',
        results: [
          {
            title: 'Example',
            url: 'https://www.example.com/article#section',
            description: 'Evidence',
          },
        ],
      },
    });
    const event = queueOf(service)
      .filter((item) => item.kind === 'event')
      .at(-1)?.value;
    expect(event?.metadata.lineage).toMatchObject({
      kind: 'web_search',
      query: { text: 'source transparency' },
      tool: { name: 'webSearch', provider: 'brave', invocationId: 'call-1' },
      sources: [
        {
          url: 'https://www.example.com/article',
          domain: 'example.com',
          title: 'Example',
          rank: 1,
        },
      ],
    });
  });

  it('records explainable library similarity percentages and origins', () => {
    const service = createService();
    const traceId = '00000000-0000-4000-8000-000000000009';
    service.startRun({
      ...runBase,
      traceId,
      agentId: '00000000-0000-4000-8000-000000000010',
    });
    service.recordEvent(traceId, {
      category: 'tool',
      eventType: 'tool.execute',
      name: 'searchLibraryArtifacts',
      payload: JSON.stringify({ query: 'brand guide' }),
      result: [
        {
          itemId: 'item-1',
          name: 'Brand Guide',
          score: 0.87654,
          sourceType: 'upload',
          sourceUri: 'https://example.com/brand.pdf',
          contentHash: 'sha256:abc',
          embeddingModel: 'text-embedding-3-small',
        },
      ],
    });
    const event = queueOf(service)
      .filter((item) => item.kind === 'event')
      .at(-1)?.value;
    expect(event?.metadata.lineage.library).toMatchObject({
      query: 'brand guide',
      algorithm: 'hybrid',
      semanticWeight: 0.75,
      lexicalWeight: 0.25,
      embedding: {
        model: 'text-embedding-3-small',
        dimensions: 1536,
        normalizationVersion: 'agent-commons-library-v1',
        computedBy: 'agent-commons',
        vectorIncluded: false,
      },
      results: [
        {
          itemId: 'item-1',
          percentageMatch: 87.65,
          rank: 1,
          sourceType: 'upload',
          contentHash: 'sha256:abc',
          embeddingModel: 'text-embedding-3-small',
          embeddingCacheKey: expect.stringMatching(/^sha256:/),
        },
      ],
    });
  });

  it('attributes human approvals without persisting approval credentials', () => {
    const service = createService();
    const traceId = '00000000-0000-4000-8000-000000000011';
    service.startRun({
      ...runBase,
      traceId,
      agentId: '00000000-0000-4000-8000-000000000012',
      initiator: 'reviewer@example.com',
      options: { mode: 'full' },
    });
    service.recordEvent(traceId, {
      category: 'tool',
      eventType: 'tool.execute',
      name: 'request_user_input',
      payload: {
        approvalToken: 'never-store-this',
        questions: [
          {
            id: 'deploy',
            question: 'Deploy this change?',
            options: [{ label: 'Approve' }, { label: 'Reject' }],
          },
        ],
      },
      result: { approved: true, answers: { deploy: 'Approve' } },
    });

    const event = queueOf(service)
      .filter((item) => item.kind === 'event')
      .at(-1)?.value;
    const serialized = JSON.stringify(event);
    expect(serialized).not.toContain('never-store-this');
    expect(event?.payload.approvalToken).toBe('[redacted]');
    expect(event?.eaaAction.performedBy).toBe('human:reviewer@example.com');
    expect(event?.metadata.lineage.decision).toMatchObject({
      type: 'human_approval',
      outcome: true,
      approval: {
        reviewerId: 'reviewer@example.com',
        reviewerType: 'human',
        prompt: 'Deploy this change?',
        questionIds: ['deploy'],
      },
    });
  });

  it('namespaces runtime actor roles for ProvenanceKit validation', async () => {
    const traceId = '00000000-0000-4000-8000-000000000013';
    const startedAt = new Date('2026-08-28T00:00:00.000Z');
    const service = new ProvenanceService({
      query: {
        provenanceRun: {
          findFirst: jest.fn().mockResolvedValue({
            traceId,
            scopeType: 'workflow',
            scopeId: 'execution-1',
            initiator: 'reviewer@example.com',
            captureMode: 'metadata',
            status: 'completed',
          }),
        },
        provenanceEvent: {
          findMany: jest.fn().mockResolvedValue([
            {
              category: 'system',
              contentHash: 'sha256:runtime-event',
              startedAt,
              eaaAction: {
                id: `urn:agentcommons:event:${traceId}:1`,
                type: 'verify',
                performedBy: 'service:reviewer@example.com',
                timestamp: startedAt.toISOString(),
                inputs: [],
                outputs: [],
              },
            },
          ]),
        },
      },
    } as never);

    const bundle = await service.buildBundle(traceId);

    expect(
      bundle.entities?.find(
        (entity) => entity.id === 'service:reviewer@example.com',
      ),
    ).toMatchObject({ role: 'ext:agentcommons:runtime' });
  });
});

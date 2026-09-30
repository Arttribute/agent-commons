import { BadRequestException } from '@nestjs/common';
import { CommonToolService } from './common-tool.service';

const projectId = '4fc976a3-259d-4313-a5a9-7cb43c10aa3e';
const sessionId = '571c946f-a62e-4b43-ae62-b58ca3803899';

function queryResult(rows: unknown[], paged = false) {
  const query: any = {};
  query.from = jest.fn(() => query);
  query.where = jest.fn(() => query);
  query.orderBy = jest.fn(() => query);
  query.limit = jest.fn(() => paged ? query : Promise.resolve(rows));
  query.offset = jest.fn(() => Promise.resolve(rows));
  return query;
}

function harness(...results: Array<{ rows: unknown[]; paged?: boolean }>) {
  const service = Object.create(CommonToolService.prototype) as any;
  const queries = results.map((result) => queryResult(result.rows, result.paged));
  service.db = { select: jest.fn().mockImplementation(() => queries.shift()) };
  return service as CommonToolService;
}

const metadata = { agentId: 'agent-1', ownerId: 'user-1', sessionId };

describe('CommonToolService project chat access', () => {
  it('requires a trusted current chat and owner', async () => {
    const service = harness();
    await expect(service.listProjectChats({ agentId: 'agent-1' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('stops when the current project is unavailable to the owner', async () => {
    const service = harness({ rows: [{ projectId }] }, { rows: [] });
    await expect(service.listProjectChats({ agentId: 'agent-1' }, metadata)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('pages the project chat index and only returns compact previews', async () => {
    const now = new Date();
    const service = harness(
      { rows: [{ projectId }] },
      { rows: [{ projectId }] },
      { paged: true, rows: [
        { sessionId, title: 'Shoe shop', updatedAt: now, history: [{ role: 'user', content: 'Build a shoe shop' }, { role: 'ai', content: 'Long answer' }] },
        { sessionId: 'another', title: 'Checkout', updatedAt: now, history: [{ role: 'user', content: 'Add checkout' }] },
        { sessionId: 'third', title: 'More work', updatedAt: now, history: [] },
      ] },
    );
    const result = await service.listProjectChats({ agentId: 'agent-1', limit: 2 }, metadata);
    expect(result.nextOffset).toBe(2);
    expect(result.chats).toHaveLength(2);
    expect(result.chats[0]).toEqual({ sessionId, title: 'Shoe shop', updatedAt: now.toISOString(), firstRequest: 'Build a shoe shop' });
    expect(JSON.stringify(result)).not.toContain('Long answer');
  });

  it('refuses a chat outside the current project', async () => {
    const service = harness({ rows: [{ projectId }] }, { rows: [{ projectId }] }, { rows: [] });
    await expect(service.readProjectChat({ agentId: 'agent-1', targetSessionId: 'd6c663b4-a62e-429e-9637-8b209c468aef' }, metadata)).rejects.toBeInstanceOf(BadRequestException);
  });
});

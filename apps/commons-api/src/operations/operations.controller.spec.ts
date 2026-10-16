import { OperationsController } from './operations.controller';
import { bindReport } from './operations.service';
import { PgDialect } from 'drizzle-orm/pg-core';

describe('scoped operations reports', () => {
  const report = jest.fn().mockResolvedValue({ calls: 1 });
  const controller = new OperationsController({ report } as any);
  const principal = {
    principalId: 'svc_ops',
    principalType: 'service',
    workspaceId: 'ops:production',
    scopes: ['ops:read'],
  };
  const previous = process.env.APP_ENV;
  beforeEach(() => {
    process.env.APP_ENV = 'production';
    jest.clearAllMocks();
  });
  afterAll(() => {
    if (previous === undefined) delete process.env.APP_ENV;
    else process.env.APP_ENV = previous;
  });
  it.each([
    undefined,
    { ...principal, principalType: 'user' },
    { ...principal, workspaceId: 'ops:staging' },
    { ...principal, scopes: [] },
  ])('rejects non-staff and mismatched credentials', async (p) => {
    await expect(
      controller.report({ principal: p }, 'summary', {}),
    ).rejects.toMatchObject({ status: 403 });
    expect(report).not.toHaveBeenCalled();
  });
  it('accepts a bounded report with canonical filters', async () => {
    await expect(
      controller.report({ principal }, 'usage', {
        userId: 'usr_customer',
        days: '7',
      }),
    ).resolves.toEqual({ data: { calls: 1 } });
    expect(report).toHaveBeenCalledWith('usage', {
      userId: 'usr_customer',
      days: 7,
      offset: 0,
      ids: [],
    });
  });
  it.each([
    ['unknown', {}],
    ['account', {}],
    ['usage', { days: '9999' }],
    ['usage', { userId: "usr_a' OR true" }],
    ['directory', { ids: Array(51).fill('usr_a').join(',') }],
    ['billing', { offset: '-1' }],
  ])('rejects invalid report names and filters', async (name, query) => {
    await expect(
      controller.report({ principal }, name as string, query as any),
    ).rejects.toMatchObject({ status: 400 });
    expect(report).not.toHaveBeenCalled();
  });
  it('binds values without adding them to SQL text', () => {
    const value = "customer' OR true --";
    const query = new PgDialect().sqlToQuery(
      bindReport('select $1::text,$2::int,$1::text', [value, 7]),
    );
    expect(query.sql).not.toContain(value);
    expect(query.params).toEqual([value, 7, value]);
  });
});

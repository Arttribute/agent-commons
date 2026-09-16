import { parseAppQuery, sanitizeDocument } from './app-data.types';
import { validateFields } from './app-data.service';

describe('parseAppQuery', () => {
  it('parses portable filters, sort and bounds', () => {
    expect(
      parseAppQuery({
        where: { status: 'open', score: { $gte: 3 }, tag: { in: ['a', 'b'] } },
        orderBy: 'score',
        direction: 'asc',
        limit: 500,
        offset: -4,
      }),
    ).toEqual({
      filters: [
        { field: 'status', op: 'eq', value: 'open' },
        { field: 'score', op: 'gte', value: 3 },
        { field: 'tag', op: 'in', value: ['a', 'b'] },
      ],
      orderBy: { field: 'score', direction: 'asc' },
      limit: 100,
      offset: 0,
    });
  });

  it('rejects nested paths, operators and object operands', () => {
    expect(() => parseAppQuery({ where: { 'a.b': 1 } })).toThrow(
      'Invalid field',
    );
    expect(() => parseAppQuery({ where: { a: { $where: '1' } } })).toThrow(
      'Unsupported operator',
    );
    expect(() => parseAppQuery({ where: { a: { eq: { $ne: 1 } } } })).toThrow(
      'scalar',
    );
    expect(() => parseAppQuery({ orderBy: 'data->>x' })).toThrow('orderBy');
  });
});

describe('sanitizeDocument', () => {
  it('strips record metadata and rejects dangerous keys', () => {
    expect(sanitizeDocument({ id: 'x', _id: 'y', title: 'Hi' })).toEqual({
      title: 'Hi',
    });
    expect(() =>
      sanitizeDocument(JSON.parse('{"__proto__":{"a":1}}')),
    ).toThrow();
    expect(() => sanitizeDocument({ nested: { $set: 1 } })).toThrow();
    expect(() => sanitizeDocument({ 'a.b': 1 })).toThrow();
    expect(() => sanitizeDocument([1, 2])).toThrow('JSON object');
  });

  it('enforces the size limit', () => {
    expect(() => sanitizeDocument({ text: 'x'.repeat(70_000) })).toThrow(
      '64 KB',
    );
  });
});

describe('validateFields', () => {
  const plugin = {
    manifest: {
      data: {
        collections: [
          {
            name: 'trips',
            fields: {
              destination: { type: 'string' as const, required: true },
              budget: { type: 'number' as const },
            },
          },
        ],
      },
    },
  } as any;

  it('checks declared types and required fields', () => {
    expect(() => validateFields(plugin, 'trips', { budget: 3 }, false)).toThrow(
      'required',
    );
    expect(() =>
      validateFields(
        plugin,
        'trips',
        { destination: 'Lima', budget: '3' },
        false,
      ),
    ).toThrow('must be a number');
    expect(() =>
      validateFields(plugin, 'trips', { budget: 3 }, true),
    ).not.toThrow();
  });
});

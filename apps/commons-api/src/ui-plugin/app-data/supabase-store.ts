import { BadRequestException } from '@nestjs/common';
import { guardedHttpsRequest } from '../app-network/network-guard';
import type {
  AppDataStore,
  AppFilter,
  AppQuery,
  AppRecord,
} from './app-data.types';

const META_COLUMNS: Record<string, string> = {
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  id: 'id',
};

/**
 * Stores app records as rows in the owner's Supabase project through its
 * PostgREST API. Each collection maps to a table named `<prefix><collection>`
 * with an `id` primary key; other columns are the record fields. Row Level
 * Security in the owner's project still applies to the key they provide.
 */
export class SupabaseAppDataStore implements AppDataStore {
  private readonly base: URL;

  constructor(
    url: string,
    private readonly key: string,
    private readonly tablePrefix: string,
  ) {
    this.base = new URL(url);
  }

  async insert(collection: string, data: Record<string, unknown>) {
    const rows = await this.call(
      'POST',
      this.table(collection),
      undefined,
      data,
      {
        prefer: 'return=representation',
      },
    );
    return toRecord(firstRow(rows));
  }

  async get(collection: string, id: string) {
    const rows = await this.call(
      'GET',
      this.table(collection),
      new URLSearchParams({ id: `eq.${id}`, limit: '1' }),
    );
    return Array.isArray(rows) && rows.length ? toRecord(rows[0]) : null;
  }

  async update(collection: string, id: string, data: Record<string, unknown>) {
    // Rows are column-shaped, so a replace and a patch both update the given
    // columns. Fields the app omits keep their column defaults or values.
    const rows = await this.call(
      'PATCH',
      this.table(collection),
      new URLSearchParams({ id: `eq.${id}` }),
      { ...data, updated_at: new Date().toISOString() },
      { prefer: 'return=representation' },
    ).catch(async (error) => {
      if (String(error?.message).includes('updated_at')) {
        return this.call(
          'PATCH',
          this.table(collection),
          new URLSearchParams({ id: `eq.${id}` }),
          data,
          { prefer: 'return=representation' },
        );
      }
      throw error;
    });
    return Array.isArray(rows) && rows.length ? toRecord(rows[0]) : null;
  }

  async delete(collection: string, id: string) {
    const rows = await this.call(
      'DELETE',
      this.table(collection),
      new URLSearchParams({ id: `eq.${id}` }),
      undefined,
      { prefer: 'return=representation' },
    );
    return Array.isArray(rows) && rows.length > 0;
  }

  async query(collection: string, query: AppQuery) {
    const params = new URLSearchParams();
    for (const filter of query.filters) {
      params.append(columnFor(filter.field), postgrestFilter(filter));
    }
    const column = columnFor(query.orderBy.field);
    params.set('order', `${column}.${query.orderBy.direction}.nullslast`);
    params.set('limit', String(query.limit + 1));
    params.set('offset', String(query.offset));
    const rows = await this.call('GET', this.table(collection), params);
    const list = Array.isArray(rows) ? rows : [];
    return {
      items: list.slice(0, query.limit).map(toRecord),
      hasMore: list.length > query.limit,
    };
  }

  async collections() {
    const spec = (await this.call('GET', '', undefined)) as any;
    const tables = Object.keys(
      spec?.definitions ?? spec?.components?.schemas ?? {},
    );
    return tables
      .filter((name) => name.startsWith(this.tablePrefix))
      .map((name) => ({ name: name.slice(this.tablePrefix.length) }))
      .filter((entry) => /^[a-z][a-z0-9_]{0,39}$/.test(entry.name));
  }

  async check() {
    await this.call('GET', '', undefined);
  }

  private table(collection: string) {
    return `${this.tablePrefix}${collection}`;
  }

  private async call(
    method: string,
    table: string,
    params: URLSearchParams | undefined,
    body?: unknown,
    options: { prefer?: string } = {},
  ) {
    const url = new URL(
      `/rest/v1/${encodeURIComponent(table)}`.replace(/\/$/, '/'),
      this.base.origin,
    );
    if (params) url.search = params.toString();
    const payload =
      body === undefined ? undefined : Buffer.from(JSON.stringify(body));
    const headers: Record<string, string> = {
      apikey: this.key,
      authorization: `Bearer ${this.key}`,
      accept: 'application/json',
    };
    if (payload) {
      headers['content-type'] = 'application/json';
      headers['content-length'] = String(payload.byteLength);
    }
    if (options.prefer) headers.prefer = options.prefer;
    const response = await guardedHttpsRequest(url, method, headers, payload, {
      maxResponseBytes: 2_000_000,
      timeoutMs: 15_000,
    });
    if (response.status === 401 || response.status === 403) {
      throw new BadRequestException(
        'Supabase rejected the key. Check the key and its row level security policies.',
      );
    }
    if (response.status === 404) {
      throw new BadRequestException(
        `Supabase table ${table} was not found. Create it with an id primary key.`,
      );
    }
    if (response.status >= 400) {
      const message =
        typeof response.body === 'object' && response.body
          ? String((response.body as any).message ?? '')
          : '';
      throw new BadRequestException(
        `Supabase request failed${message ? `: ${message.slice(0, 200)}` : ''}`,
      );
    }
    return response.body;
  }
}

function columnFor(field: string) {
  return META_COLUMNS[field] ?? field;
}

function postgrestFilter(filter: AppFilter) {
  const encode = (value: unknown) =>
    typeof value === 'string'
      ? `"${value.replace(/(["\\])/g, '\\$1')}"`
      : String(value);
  switch (filter.op) {
    case 'eq':
      return filter.value === null ? 'is.null' : `eq.${String(filter.value)}`;
    case 'ne':
      return filter.value === null
        ? 'not.is.null'
        : `neq.${String(filter.value)}`;
    case 'in':
      return `in.(${(filter.value as unknown[]).map(encode).join(',')})`;
    case 'contains':
      return `ilike.*${String(filter.value).replace(/[*%]/g, '')}*`;
    default:
      return `${filter.op}.${String(filter.value)}`;
  }
}

function firstRow(rows: unknown) {
  if (Array.isArray(rows) && rows.length) return rows[0];
  throw new BadRequestException('Supabase did not return the inserted row');
}

function toRecord(row: any): AppRecord {
  const { id, created_at, updated_at, ...data } = row ?? {};
  return {
    id: String(id),
    data,
    ...(created_at ? { createdAt: String(created_at) } : {}),
    ...(updated_at ? { updatedAt: String(updated_at) } : {}),
  };
}

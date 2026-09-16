import { BadRequestException } from '@nestjs/common';
import { and, asc, count, desc, eq, sql, type SQL } from 'drizzle-orm';
import * as schema from '#/models/schema';
import type { DatabaseService } from '~/modules/database/database.service';
import { MAX_RECORD_BYTES } from './app-data.types';
import type {
  AppDataStore,
  AppFilter,
  AppQuery,
  AppRecord,
} from './app-data.types';

export const COMMONS_STORE_LIMITS = {
  recordsPerApp: 20_000,
  bytesPerApp: 100_000_000,
};

const table = schema.appRecord;

/**
 * Commons-managed storage: one JSONB document per record in the
 * `commons_app_data` schema, always scoped by app and owner.
 */
export class CommonsAppDataStore implements AppDataStore {
  constructor(
    private readonly db: DatabaseService,
    private readonly pluginId: string,
    private readonly ownerId: string,
  ) {}

  async insert(collection: string, data: Record<string, unknown>) {
    const sizeBytes = Buffer.byteLength(JSON.stringify(data));
    const [usage] = await this.db
      .select({
        records: count(),
        bytes: sql<number>`coalesce(sum(${table.sizeBytes}), 0)::bigint`,
      })
      .from(table)
      .where(this.scope());
    if (Number(usage?.records ?? 0) >= COMMONS_STORE_LIMITS.recordsPerApp) {
      throw new BadRequestException('This app reached its record limit');
    }
    if (
      Number(usage?.bytes ?? 0) + sizeBytes >
      COMMONS_STORE_LIMITS.bytesPerApp
    ) {
      throw new BadRequestException('This app reached its storage limit');
    }
    const [row] = await this.db
      .insert(table)
      .values({
        pluginId: this.pluginId,
        ownerUserId: this.ownerId,
        collection,
        data,
        sizeBytes,
      })
      .returning();
    return toRecord(row);
  }

  async get(collection: string, id: string) {
    if (!isUuid(id)) return null;
    const [row] = await this.db
      .select()
      .from(table)
      .where(
        and(
          this.scope(),
          eq(table.collection, collection),
          eq(table.recordId, id),
        ),
      )
      .limit(1);
    return row ? toRecord(row) : null;
  }

  async update(
    collection: string,
    id: string,
    data: Record<string, unknown>,
    replace: boolean,
  ) {
    if (!isUuid(id)) return null;
    const next = replace
      ? sql`${JSON.stringify(data)}::jsonb`
      : sql`${table.data} || ${JSON.stringify(data)}::jsonb`;
    const [row] = await this.db
      .update(table)
      .set({
        data: next as any,
        sizeBytes: replace
          ? Buffer.byteLength(JSON.stringify(data))
          : (sql`octet_length((${table.data} || ${JSON.stringify(data)}::jsonb)::text)` as any),
        updatedAt: new Date(),
      })
      .where(
        and(
          this.scope(),
          eq(table.collection, collection),
          eq(table.recordId, id),
          // A merge can grow a record; keep it within the per-record limit.
          ...(replace
            ? []
            : [
                sql<boolean>`octet_length((${table.data} || ${JSON.stringify(data)}::jsonb)::text) <= ${MAX_RECORD_BYTES}`,
              ]),
        ),
      )
      .returning();
    if (!row && !replace && (await this.get(collection, id))) {
      throw new BadRequestException('Records must be smaller than 64 KB');
    }
    return row ? toRecord(row) : null;
  }

  async delete(collection: string, id: string) {
    if (!isUuid(id)) return false;
    const removed = await this.db
      .delete(table)
      .where(
        and(
          this.scope(),
          eq(table.collection, collection),
          eq(table.recordId, id),
        ),
      )
      .returning({ recordId: table.recordId });
    return removed.length > 0;
  }

  async query(collection: string, query: AppQuery) {
    const conditions = [
      this.scope(),
      eq(table.collection, collection),
      ...query.filters.map(filterSql),
    ];
    const rows = await this.db
      .select()
      .from(table)
      .where(and(...conditions))
      .orderBy(orderSql(query.orderBy.field, query.orderBy.direction))
      .limit(query.limit + 1)
      .offset(query.offset);
    return {
      items: rows.slice(0, query.limit).map(toRecord),
      hasMore: rows.length > query.limit,
    };
  }

  async collections() {
    const rows = await this.db
      .select({ name: table.collection, count: count() })
      .from(table)
      .where(this.scope())
      .groupBy(table.collection);
    return rows.map((row) => ({ name: row.name, count: Number(row.count) }));
  }

  async check() {
    await this.db
      .select({ value: sql`1` })
      .from(table)
      .limit(1);
  }

  private scope() {
    return and(
      eq(table.pluginId, this.pluginId),
      eq(table.ownerUserId, this.ownerId),
    )!;
  }
}

/** Field names are validated by parseAppQuery and bound as parameters. */
export function filterSql(filter: AppFilter): SQL {
  const field = fieldSql(filter.field);
  const json = (value: unknown) => sql`${JSON.stringify(value)}::jsonb`;
  switch (filter.op) {
    case 'eq':
      return filter.value === null
        ? sql`(${field} IS NULL OR ${field} = 'null'::jsonb)`
        : sql`${field} = ${json(filter.value)}`;
    case 'ne':
      return sql`${field} IS DISTINCT FROM ${json(filter.value)}`;
    case 'gt':
      return sql`${field} > ${json(filter.value)}`;
    case 'gte':
      return sql`${field} >= ${json(filter.value)}`;
    case 'lt':
      return sql`${field} < ${json(filter.value)}`;
    case 'lte':
      return sql`${field} <= ${json(filter.value)}`;
    case 'in': {
      const values = filter.value as unknown[];
      if (!values.length) return sql`false`;
      return sql`${field} IN (${sql.join(values.map(json), sql`, `)})`;
    }
    case 'contains': {
      const pattern = `%${String(filter.value).replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
      return sql`${table.data} ->> ${filter.field} ILIKE ${pattern}`;
    }
  }
}

function fieldSql(field: string) {
  if (field === 'id') return sql`to_jsonb(${table.recordId}::text)`;
  if (field === 'createdAt') return sql`to_jsonb(${table.createdAt})`;
  if (field === 'updatedAt') return sql`to_jsonb(${table.updatedAt})`;
  return sql`(${table.data} -> ${field})`;
}

function orderSql(field: string, direction: 'asc' | 'desc') {
  const order = direction === 'asc' ? asc : desc;
  if (field === 'createdAt') return order(table.createdAt);
  if (field === 'updatedAt') return order(table.updatedAt);
  if (field === 'id') return order(table.recordId);
  return direction === 'asc'
    ? sql`${table.data} -> ${field} ASC NULLS LAST`
    : sql`${table.data} -> ${field} DESC NULLS LAST`;
}

function toRecord(row: typeof table.$inferSelect): AppRecord {
  return {
    id: row.recordId,
    data: row.data,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value,
  );
}

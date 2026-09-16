import { BadRequestException } from '@nestjs/common';

export type AppRecord = {
  id: string;
  data: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
};

export type Scalar = string | number | boolean | null;

export type AppFilter = {
  field: string;
  op: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'contains';
  value: Scalar | Scalar[];
};

export type AppQuery = {
  filters: AppFilter[];
  orderBy: { field: string; direction: 'asc' | 'desc' };
  limit: number;
  offset: number;
};

export interface AppDataStore {
  insert(collection: string, data: Record<string, unknown>): Promise<AppRecord>;
  get(collection: string, id: string): Promise<AppRecord | null>;
  update(
    collection: string,
    id: string,
    data: Record<string, unknown>,
    replace: boolean,
  ): Promise<AppRecord | null>;
  delete(collection: string, id: string): Promise<boolean>;
  query(
    collection: string,
    query: AppQuery,
  ): Promise<{ items: AppRecord[]; hasMore: boolean }>;
  collections(): Promise<Array<{ name: string; count?: number }>>;
  check(): Promise<void>;
  close?(): Promise<void>;
}

export const MAX_RECORD_BYTES = 64_000;
export const RECORD_META_FIELDS = new Set(['id', 'createdAt', 'updatedAt']);

const OPERATORS = new Set([
  'eq',
  'ne',
  'gt',
  'gte',
  'lt',
  'lte',
  'in',
  'contains',
]);
const FIELD = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;

export function isRecordId(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(value);
}

/**
 * Parses the portable query shape apps send:
 * `{ where: { status: 'open', score: { gte: 3 } }, orderBy: 'createdAt',
 *    direction: 'desc', limit: 20, offset: 0 }`.
 * Only top-level fields and scalar operands are accepted, so the same query
 * runs against Commons storage, Supabase and MongoDB without an injection
 * surface in any of them.
 */
export function parseAppQuery(input: unknown): AppQuery {
  const params = isPlainObject(input) ? input : {};
  const filters: AppFilter[] = [];
  const where = params.where ?? {};
  if (!isPlainObject(where)) {
    throw new BadRequestException('where must be an object');
  }
  for (const [field, condition] of Object.entries(where)) {
    if (!FIELD.test(field)) {
      throw new BadRequestException(`Invalid field name ${field}`);
    }
    if (isPlainObject(condition)) {
      for (const [op, value] of Object.entries(condition)) {
        const normalizedOp = op.replace(/^\$/, '');
        if (!OPERATORS.has(normalizedOp)) {
          throw new BadRequestException(`Unsupported operator ${op}`);
        }
        filters.push({
          field,
          op: normalizedOp as AppFilter['op'],
          value: operand(normalizedOp, value, field),
        });
      }
    } else {
      filters.push({ field, op: 'eq', value: operand('eq', condition, field) });
    }
  }
  if (filters.length > 20) throw new BadRequestException('Too many filters');

  const orderField =
    typeof params.orderBy === 'string' ? params.orderBy : 'createdAt';
  if (!FIELD.test(orderField)) {
    throw new BadRequestException('Invalid orderBy field');
  }
  const direction = params.direction === 'asc' ? 'asc' : 'desc';
  const limit = boundedInteger(params.limit, 50, 1, 100);
  const offset = boundedInteger(params.offset, 0, 0, 10_000);
  return {
    filters,
    orderBy: { field: orderField, direction },
    limit,
    offset,
  };
}

function operand(op: string, value: unknown, field: string) {
  if (op === 'in') {
    if (!Array.isArray(value) || value.length > 100 || !value.every(isScalar)) {
      throw new BadRequestException(
        `${field}.in must be an array of up to 100 scalars`,
      );
    }
    return value as Scalar[];
  }
  if (op === 'contains') {
    if (typeof value !== 'string' || value.length > 200) {
      throw new BadRequestException(`${field}.contains must be a short string`);
    }
    return value;
  }
  if (!isScalar(value)) {
    throw new BadRequestException(`${field} must be compared to a scalar`);
  }
  return value as Scalar;
}

function isScalar(value: unknown) {
  return (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value))
  );
}

function boundedInteger(
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number,
) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.round(value)));
}

/** Copies a JSON document, rejecting prototype keys and oversize payloads. */
export function sanitizeDocument(value: unknown): Record<string, unknown> {
  if (!isPlainObject(value)) {
    throw new BadRequestException('data must be a JSON object');
  }
  const copy = copyJson(value, 0) as Record<string, unknown>;
  for (const key of RECORD_META_FIELDS) delete copy[key];
  delete copy._id;
  if (Buffer.byteLength(JSON.stringify(copy)) > MAX_RECORD_BYTES) {
    throw new BadRequestException('Records must be smaller than 64 KB');
  }
  return copy;
}

function copyJson(value: unknown, depth: number): unknown {
  if (depth > 12) throw new BadRequestException('data is nested too deeply');
  if (value === null || typeof value === 'boolean' || typeof value === 'string')
    return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new BadRequestException('data numbers must be finite');
    }
    return value;
  }
  if (Array.isArray(value)) {
    if (value.length > 1_000)
      throw new BadRequestException('data array too large');
    return value.map((item) => copyJson(item, depth + 1));
  }
  if (isPlainObject(value)) {
    const entries = Object.entries(value);
    if (entries.length > 500)
      throw new BadRequestException('data object too large');
    const result: Record<string, unknown> = {};
    for (const [key, item] of entries) {
      if (
        key === '__proto__' ||
        key === 'constructor' ||
        key === 'prototype' ||
        key.startsWith('$') ||
        key.includes('.') ||
        key.length > 200
      ) {
        throw new BadRequestException(
          `Invalid key ${key.slice(0, 40)} in data`,
        );
      }
      result[key] = copyJson(item, depth + 1);
    }
    return result;
  }
  throw new BadRequestException('data contains an unsupported value');
}

export function isPlainObject(
  value: unknown,
): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

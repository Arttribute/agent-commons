import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

type AppRecord = { id: string; collection: string; data: Record<string, unknown>; createdAt: string; updatedAt: string };
type Scalar = string | number | boolean | null;
type Filter = { field: string; op: string; value: Scalar | Scalar[] };

const FIELD = /^[A-Za-z_][A-Za-z0-9_.]{0,63}$/;
const COLLECTION = /^[a-z][a-z0-9_-]{0,63}$/;
const OPERATORS = new Set(["eq", "ne", "gt", "gte", "lt", "lte", "in", "contains"]);
const MAX_RECORDS = 5_000;
const MAX_RECORD_BYTES = 64_000;

export class LocalAppDataError extends Error {
  code: number;
  constructor(code: number, message: string) {
    super(message);
    this.code = code;
  }
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function fieldValue(item: AppRecord, field: string): unknown {
  if (field === "id" || field === "createdAt" || field === "updatedAt") return item[field];
  return field.split(".").reduce<unknown>((value, key) => record(value)[key], item.data);
}

function compare(left: unknown, right: unknown) {
  if (typeof left === "number" && typeof right === "number") return left - right;
  return String(left ?? "").localeCompare(String(right ?? ""));
}

function matches(item: AppRecord, filter: Filter) {
  const value = fieldValue(item, filter.field);
  switch (filter.op) {
    case "eq": return value === filter.value;
    case "ne": return value !== filter.value;
    case "gt": return compare(value, filter.value) > 0;
    case "gte": return compare(value, filter.value) >= 0;
    case "lt": return compare(value, filter.value) < 0;
    case "lte": return compare(value, filter.value) <= 0;
    case "in": return Array.isArray(filter.value) && filter.value.includes(value as Scalar);
    case "contains": return typeof value === "string" && value.toLowerCase().includes(String(filter.value).toLowerCase());
    default: return false;
  }
}

function parseQuery(input: unknown) {
  const params = record(input);
  const filters: Filter[] = [];
  for (const [field, condition] of Object.entries(record(params.where))) {
    if (!FIELD.test(field)) throw new LocalAppDataError(-32602, `Invalid field name ${field}`);
    if (condition && typeof condition === "object" && !Array.isArray(condition)) {
      for (const [op, value] of Object.entries(condition)) {
        const normalized = op.replace(/^\$/, "");
        if (!OPERATORS.has(normalized)) throw new LocalAppDataError(-32602, `Unsupported operator ${op}`);
        filters.push({ field, op: normalized, value: value as Scalar });
      }
    } else filters.push({ field, op: "eq", value: condition as Scalar });
  }
  const orderBy = typeof params.orderBy === "string" && FIELD.test(params.orderBy) ? params.orderBy : "createdAt";
  const direction = params.direction === "asc" ? 1 : -1;
  const limit = Math.min(100, Math.max(1, Math.trunc(Number(params.limit) || 50)));
  const offset = Math.min(10_000, Math.max(0, Math.trunc(Number(params.offset) || 0)));
  return { filters, orderBy, direction, limit, offset };
}

/**
 * The Private Local counterpart of Commons app data: the same operations and
 * result shapes as the Cloud store, persisted as one owner-only JSON file per
 * app in the Local workspace.
 */
export class LocalAppData {
  private readonly directory: string;

  constructor(appsDirectory: string) {
    this.directory = join(appsDirectory, ".data");
  }

  private file(appId: string) {
    if (!/^[a-zA-Z0-9_-]{1,128}$/.test(appId)) throw new LocalAppDataError(-32602, "Invalid app");
    return join(this.directory, `${appId}.json`);
  }

  private read(appId: string): AppRecord[] {
    const path = this.file(appId);
    if (!existsSync(path)) return [];
    try {
      const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
      return Array.isArray(parsed) ? parsed as AppRecord[] : [];
    } catch {
      return [];
    }
  }

  private write(appId: string, records: AppRecord[]) {
    mkdirSync(this.directory, { recursive: true, mode: 0o700 });
    const path = this.file(appId);
    writeFileSync(`${path}.tmp`, JSON.stringify(records), { mode: 0o600 });
    renameSync(`${path}.tmp`, path);
  }

  execute(appId: string, method: string, params: Record<string, unknown>, declared: Array<{ name: string; description?: string }> = []) {
    const records = this.read(appId);
    if (method === "data.collections") {
      const names = new Set([...declared.map((entry) => entry.name), ...records.map((entry) => entry.collection)]);
      return {
        provider: "local",
        collections: [...names].map((name) => ({
          name,
          description: declared.find((entry) => entry.name === name)?.description,
          count: records.filter((entry) => entry.collection === name).length,
        })),
      };
    }
    const collection = String(params.collection ?? "");
    if (!COLLECTION.test(collection)) throw new LocalAppDataError(-32602, "A valid collection name is required");
    const view = ({ id, data, createdAt, updatedAt }: AppRecord) => ({ id, data, createdAt, updatedAt });
    const find = () => {
      const id = String(params.id ?? "");
      const found = records.find((entry) => entry.collection === collection && entry.id === id);
      if (!found) throw new LocalAppDataError(-32004, "Record not found");
      return found;
    };
    const document = () => {
      const data = record(params.data);
      if (Buffer.byteLength(JSON.stringify(data)) > MAX_RECORD_BYTES) throw new LocalAppDataError(-32602, "Records must be smaller than 64 KB");
      for (const key of ["id", "createdAt", "updatedAt"]) delete data[key];
      return data;
    };
    switch (method) {
      case "data.get":
        return view(find());
      case "data.query": {
        const query = parseQuery(params.query ?? params);
        const items = records
          .filter((entry) => entry.collection === collection && query.filters.every((filter) => matches(entry, filter)))
          .sort((left, right) => compare(fieldValue(left, query.orderBy), fieldValue(right, query.orderBy)) * query.direction);
        const page = items.slice(query.offset, query.offset + query.limit + 1);
        return { items: page.slice(0, query.limit).map(view), hasMore: page.length > query.limit };
      }
      case "data.insert": {
        if (records.length >= MAX_RECORDS) throw new LocalAppDataError(-32602, "This app reached its record limit");
        const timestamp = new Date().toISOString();
        const created = { id: randomUUID(), collection, data: document(), createdAt: timestamp, updatedAt: timestamp };
        this.write(appId, [...records, created]);
        return view(created);
      }
      case "data.update": {
        const existing = find();
        const data = document();
        existing.data = params.replace ? data : { ...existing.data, ...data };
        existing.updatedAt = new Date().toISOString();
        this.write(appId, records);
        return view(existing);
      }
      case "data.delete": {
        const existing = find();
        this.write(appId, records.filter((entry) => entry !== existing));
        return { deleted: true };
      }
    }
    throw new LocalAppDataError(-32601, "This Commons method is not available.");
  }
}

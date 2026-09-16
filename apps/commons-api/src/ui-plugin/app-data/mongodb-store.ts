import { BadRequestException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { MongoClient, type Collection, type Filter } from 'mongodb';
import {
  assertPublicHostname,
  guardedLookup,
} from '../app-network/network-guard';
import type {
  AppDataStore,
  AppFilter,
  AppQuery,
  AppRecord,
} from './app-data.types';

type MongoDocument = {
  _id: string;
  createdAt: Date;
  updatedAt: Date;
  [key: string]: unknown;
};

const clients = new Map<string, { client: MongoClient; lastUsed: number }>();
const CLIENT_IDLE_MS = 5 * 60_000;

/**
 * Stores app records in the owner's MongoDB database. Collections are named
 * `<prefix><collection>`; record ids are opaque strings kept in `_id`.
 */
export class MongoAppDataStore implements AppDataStore {
  constructor(
    private readonly cacheKey: string,
    private readonly uri: string,
    private readonly database: string,
    private readonly prefix: string,
  ) {}

  async insert(collection: string, data: Record<string, unknown>) {
    const now = new Date();
    const document: MongoDocument = {
      ...data,
      _id: randomUUID(),
      createdAt: now,
      updatedAt: now,
    };
    await (await this.collection(collection)).insertOne(document);
    return toRecord(document);
  }

  async get(collection: string, id: string) {
    const document = await (
      await this.collection(collection)
    ).findOne({
      _id: id,
    });
    return document ? toRecord(document) : null;
  }

  async update(
    collection: string,
    id: string,
    data: Record<string, unknown>,
    replace: boolean,
  ) {
    const target = await this.collection(collection);
    const now = new Date();
    if (replace) {
      const existing = await target.findOne({ _id: id });
      if (!existing) return null;
      const document = {
        ...data,
        _id: id,
        createdAt: existing.createdAt,
        updatedAt: now,
      };
      await target.replaceOne({ _id: id }, document);
      return toRecord(document as MongoDocument);
    }
    const result = await target.findOneAndUpdate(
      { _id: id },
      { $set: { ...data, updatedAt: now } },
      { returnDocument: 'after' },
    );
    return result ? toRecord(result) : null;
  }

  async delete(collection: string, id: string) {
    const result = await (
      await this.collection(collection)
    ).deleteOne({
      _id: id,
    });
    return result.deletedCount > 0;
  }

  async query(collection: string, query: AppQuery) {
    const filter: Filter<MongoDocument> = {};
    for (const condition of query.filters) {
      const field = condition.field === 'id' ? '_id' : condition.field;
      const existing = (filter as any)[field] ?? {};
      (filter as any)[field] = { ...existing, ...mongoCondition(condition) };
    }
    const sortField =
      query.orderBy.field === 'id' ? '_id' : query.orderBy.field;
    const documents = await (
      await this.collection(collection)
    )
      .find(filter)
      .sort({ [sortField]: query.orderBy.direction === 'asc' ? 1 : -1 })
      .skip(query.offset)
      .limit(query.limit + 1)
      .maxTimeMS(10_000)
      .toArray();
    return {
      items: documents.slice(0, query.limit).map(toRecord),
      hasMore: documents.length > query.limit,
    };
  }

  async collections() {
    const db = (await this.client()).db(this.database);
    const collections = await db
      .listCollections({}, { nameOnly: true })
      .toArray();
    return collections
      .map((entry) => entry.name)
      .filter((name) => name.startsWith(this.prefix))
      .map((name) => ({ name: name.slice(this.prefix.length) }))
      .filter((entry) => /^[a-z][a-z0-9_]{0,39}$/.test(entry.name));
  }

  async check() {
    await (await this.client()).db(this.database).command({ ping: 1 });
  }

  private async collection(name: string): Promise<Collection<MongoDocument>> {
    return (await this.client())
      .db(this.database)
      .collection<MongoDocument>(`${this.prefix}${name}`);
  }

  private async client() {
    const cached = clients.get(this.cacheKey);
    if (cached) {
      cached.lastUsed = Date.now();
      return cached.client;
    }
    await assertMongoHostsArePublic(this.uri);
    const client = new MongoClient(this.uri, {
      maxPoolSize: 3,
      serverSelectionTimeoutMS: 8_000,
      connectTimeoutMS: 8_000,
      socketTimeoutMS: 20_000,
      lookup: guardedLookup as any,
    } as any);
    try {
      await client.connect();
    } catch (error: any) {
      await client.close().catch(() => undefined);
      throw new BadRequestException(
        `MongoDB connection failed: ${String(error?.message ?? 'unknown error').slice(0, 200)}`,
      );
    }
    clients.set(this.cacheKey, { client, lastUsed: Date.now() });
    sweepIdleClients();
    return client;
  }
}

export function closeMongoClient(cacheKey: string) {
  const cached = clients.get(cacheKey);
  clients.delete(cacheKey);
  return cached?.client.close().catch(() => undefined);
}

function sweepIdleClients() {
  const now = Date.now();
  for (const [key, entry] of clients) {
    if (now - entry.lastUsed > CLIENT_IDLE_MS) {
      clients.delete(key);
      void entry.client.close().catch(() => undefined);
    }
  }
}

export function validateMongoUri(uri: string) {
  let parsed: URL;
  try {
    parsed = new URL(uri);
  } catch {
    throw new BadRequestException('Enter a valid MongoDB connection string');
  }
  if (!['mongodb:', 'mongodb+srv:'].includes(parsed.protocol)) {
    throw new BadRequestException(
      'MongoDB connection strings start with mongodb:// or mongodb+srv://',
    );
  }
  return parsed;
}

async function assertMongoHostsArePublic(uri: string) {
  const parsed = validateMongoUri(uri);
  // Standard connection strings may list several hosts before the path.
  const authority = uri
    .replace(/^mongodb(\+srv)?:\/\//, '')
    .split('/')[0]
    .split('@')
    .pop()!;
  const hosts = authority
    .split(',')
    .map((host) => host.replace(/:\d+$/, ''))
    .filter(Boolean);
  for (const host of hosts.length ? hosts : [parsed.hostname]) {
    await assertPublicHostname(host);
  }
}

function mongoCondition(filter: AppFilter) {
  switch (filter.op) {
    case 'eq':
      return { $eq: filter.value };
    case 'ne':
      return { $ne: filter.value };
    case 'gt':
      return { $gt: filter.value };
    case 'gte':
      return { $gte: filter.value };
    case 'lt':
      return { $lt: filter.value };
    case 'lte':
      return { $lte: filter.value };
    case 'in':
      return { $in: filter.value as unknown[] };
    case 'contains':
      return {
        $regex: String(filter.value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
        $options: 'i',
      };
  }
}

function toRecord(document: MongoDocument | Record<string, any>): AppRecord {
  const { _id, createdAt, updatedAt, ...data } = document as MongoDocument;
  return {
    id: String(_id),
    data,
    ...(createdAt ? { createdAt: new Date(createdAt).toISOString() } : {}),
    ...(updatedAt ? { updatedAt: new Date(updatedAt).toISOString() } : {}),
  };
}

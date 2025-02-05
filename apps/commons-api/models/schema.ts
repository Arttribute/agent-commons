import { jsonb, pgTable, timestamp, uuid, text } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { ChatCompletionTool } from 'openai/resources/chat/completions';
import { WalletData } from '@coinbase/coinbase-sdk';

export const agent = pgTable('agent', {
  agentId: text('agent_id')
    .default(sql`uuid_generate_v4()`)
    .primaryKey(),

  wallet: jsonb().notNull().$type<WalletData>(),

  createdAt: timestamp('created_at', { withTimezone: true })
    .default(sql`timezone('utc', now())`)
    .notNull(),
});

export const tool = pgTable('tool', {
  toolId: uuid('tool_id')
    .default(sql`uuid_generate_v4()`)
    .primaryKey(),

  name: text().notNull(),

  schema: jsonb().notNull().$type<ChatCompletionTool>(),

  createdAt: timestamp('created_at', { withTimezone: true })
    .default(sql`timezone('utc', now())`)
    .notNull(),
});

export const resource = pgTable('resource', {
  resourceId: uuid('resource_id')
    .default(sql`uuid_generate_v4()`)
    .primaryKey(),
  name: text().notNull(),

  resourceType: text().notNull(),

  // schema: jsonb().notNull().$type<>(),

  createdAt: timestamp('created_at', { withTimezone: true })
    .default(sql`timezone('utc', now())`)
    .notNull(),
});

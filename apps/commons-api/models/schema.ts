import {
  jsonb,
  pgTable,
  timestamp,
  uuid,
  text,
  integer,
  real,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { ChatCompletionTool } from 'openai/resources/chat/completions';
import { WalletData } from '@coinbase/coinbase-sdk';

export const agent = pgTable('agent', {
  agentId: text('agent_id')
    .default(sql`uuid_generate_v4()`)
    .primaryKey(),
  wallet: jsonb().notNull().$type<WalletData>(),
  instructions: text(),
  persona: text(),
  owner: text(),
  name: text().notNull(),
  knowledgebase: text(),
  externalTools: jsonb('external_tools').$type<string[]>(),
  commonTools: jsonb('common_tools').$type<string[]>(),
  temperature: real('temperature'),
  maxTokens: integer('max_tokens'),
  topP: real('top_p'),
  presencePenalty: real('presence_penalty'),
  frequencyPenalty: real('frequency_penalty'),
  stopSequence: jsonb('stop_sequence').$type<string[]>(),
  avatar: text(),

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
  resourceId: text('resource_id')
    .default(sql`uuid_generate_v4()`)
    .primaryKey(),

  resourceType: text().notNull(),

  schema: jsonb().notNull().$type<any>(),
  tags: jsonb().notNull().$type<string[]>(),

  createdAt: timestamp('created_at', { withTimezone: true })
    .default(sql`timezone('utc', now())`)
    .notNull(),
});

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

// TOOL TABLE
export const tool = pgTable('tool', {
  toolId: uuid('tool_id')
    .default(sql`uuid_generate_v4()`)
    .primaryKey(),

  // The "name" must match the function's "name" field
  name: text().notNull(),

  /**
   * The schema is a JSON column, and we’ll store:
   * - The "function" shape (name, description, parameters)
   * - The "apiSpec" that describes how to call the external API
   */
  schema: jsonb().notNull().$type<
    ChatCompletionTool & {
      apiSpec?: {
        baseUrl: string;
        path: string;
        method: string; // GET, POST, PUT, ...
        headers?: Record<string, string>;
        queryParams?: Record<string, string>;
        bodyTemplate?: any;
      };
    }
  >(),

  createdAt: timestamp('created_at', { withTimezone: true })
    .default(sql`timezone('utc', now())`)
    .notNull(),
});

export const resource = pgTable('resource', {
  resourceId: text('resource_id')
    .default(sql`uuid_generate_v4()`)
    .primaryKey(),

  resourceType: text('resource_type').notNull(),

  schema: jsonb('schema').notNull().$type<any>(),
  tags: jsonb().notNull().$type<string[]>(),
  resourceFile: text('resource_file').notNull(),

  createdAt: timestamp('created_at', { withTimezone: true })
    .default(sql`timezone('utc', now())`)
    .notNull(),
});

export const session = pgTable('session', {
  sessionId: uuid('session_id')
    .default(sql`uuid_generate_v4()`)
    .primaryKey(),
  model: jsonb(),
  query: jsonb(),
  history: jsonb(),

  createdAt: timestamp('created_at', { withTimezone: true })
    .default(sql`timezone('utc', now())`)
    .notNull(),
});

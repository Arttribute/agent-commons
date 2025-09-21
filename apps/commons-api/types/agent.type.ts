import type { Except, SetRequired } from 'type-fest'

import type * as schema from '../models/index.js'

export type Agent = typeof schema.agent.$inferSelect
export type InsertAgent = typeof schema.agent.$inferInsert


interface BaseAgent
  extends Partial<
    Agent
  > {
}

// interface Agent {
// 	name?: string;
// 	teamId?: string & tags.Format<"uuid">;
// 	description?: string;
// 	startAt?: string & tags.Format<"date-time">;
// 	location?: AgentLocation;
// }

export interface CreateAgent
  extends SetRequired<Except<BaseAgent, 'agentId'>, 'name' | "owner"> {
}

export interface UpdateAgent extends Except<BaseAgent, 'agentId'> {
}

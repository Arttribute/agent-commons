import type { Except, SetRequired } from 'type-fest'

import type * as schema from '../models/index.js'

export type Space = typeof schema.space.$inferSelect
export type InsertSpace = typeof schema.space.$inferInsert

interface BaseSpace extends Partial<Space> {}

// interface Space {
// 	name?: string;
// 	teamId?: string & tags.Format<"uuid">;
// 	description?: string;
// 	startAt?: string & tags.Format<"date-time">;
// 	location?: SpaceLocation;
// }

export interface CreateSpace
  extends SetRequired<Except<BaseSpace, 'spaceId'>, 'name'> {}

export interface UpdateSpace extends Except<BaseSpace, 'spaceId'> {}

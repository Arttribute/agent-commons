import type { Except, SetRequired } from "type-fest";

import type * as schema from "../models/index.js";

export type Tool = typeof schema.tool.$inferSelect;
export type InsertTool = typeof schema.tool.$inferInsert;

interface BaseTool extends Partial<Tool> {}

// interface Tool {
// 	name?: string;
// 	teamId?: string & tags.Format<"uuid">;
// 	description?: string;
// 	startAt?: string & tags.Format<"date-time">;
// 	location?: ToolLocation;
// }

export interface CreateTool extends Except<BaseTool, "toolId"> {}

export interface UpdateTool extends Except<BaseTool, "toolId"> {}

export interface ToolSchema {
	name: string;
	apiSpec: {
		path: string;
		method: string;
		baseUrl: string;
		headers: Record<string, string>;
		queryParams: Record<string, string>;
	};
	parameters: {
		type: string;
		required: string[];
		properties: {};
	};
	description: string;
}

import { and, eq } from "drizzle-orm";
import { inject, injectable } from "tsyringe";
import { DatabaseService } from "../helpers/database";
import * as schema from "../models/schema.js";

export interface Memory {
	addMemoryEntry(props: { content: string }): any;
	getMemoryEntries(props: {}): any;
}

@injectable()
export class MemoryService implements Memory {
	constructor(@inject(DatabaseService) private readonly $db: DatabaseService) {}

	async addMemoryEntry(
		props: {
			content: string;
		},
		metadata?: { agentId?: string; sessionId?: string; userId?: string },
	) {
		this.$db.insert(schema.memory).values({
			agentId: metadata?.agentId,
			sessionId: metadata?.sessionId,
			userId: metadata?.userId,
			content: props.content,
		});
	}

	async getMemoryEntries(
		props: {},
		metadata?: { agentId?: string; sessionId?: string; userId?: string },
	) {
		return this.$db
			.select()
			.from(schema.memory)
			.where(
				and(
					// metadata?.agentId ? eq(schema.memory.agentId, metadata.agentId) : undefined,
					// metadata?.sessionId ? eq(schema.memory.sessionId, metadata.sessionId) : undefined,
					metadata?.userId
						? eq(schema.memory.userId, metadata.userId)
						: undefined,
				),
			);
	}
}

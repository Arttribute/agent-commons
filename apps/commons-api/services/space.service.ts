import { AIMessage, type BaseMessage } from "@langchain/core/messages";
import {
	Annotation,
	MessagesAnnotation,
	StateGraph,
} from "@langchain/langgraph";
import { eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { first, merge, sumBy } from "lodash-es";
import { inject, injectable } from "tsyringe";
import { DatabaseService } from "../helpers/database.js";
import {
	chronologicalPostgresCheckpointer,
	postgresCheckpointer,
} from "../helpers/langchain.js";
import * as schema from "../models/index.js";
import type { Space } from "../types/space.type.js";
import { SpaceMemberService } from "./space-member.service.js";

export const SpacesAnnotation = Annotation.Root({
	...MessagesAnnotation.spec, // Spread in the messages state
	title: Annotation<string>,
	sessionId: Annotation<string>,
	spaceId: Annotation<string>,
	//   childSessions: Annotation<Record<string, string>>({ reducer: merge }),
	sessions: Annotation<Record<string, string>>({ reducer: merge }),
	metadata: Annotation<Record<string, any>>({ reducer: merge }),
});

@injectable()
export class SpaceService {
	constructor(
    @inject(DatabaseService) private $db: DatabaseService,
    @inject(SpaceMemberService) private $spaceMember: SpaceMemberService,
  ) {}

	async createSpace(props: {
		name: string;
		description?: string;
		createdBy: string;
		createdByType: "agent" | "human";
		sessionId?: string;
		isPublic?: boolean;
		maxMembers?: number;
		settings?: any;
	}) {
		const { createdBy, createdByType, ...spaceData } = props;

		const space = await this.$db
			.insert(schema.space)
			.values({
				...spaceData,
				createdBy,
				createdByType,
				settings: props.settings ?? {
					allowAgents: true,
					allowHumans: true,
					requireApproval: false,
					moderators: [],
				},
			})
			.returning()
			.then(first<Space>);

		if (!space) {
			throw new HTTPException(500, { message: "Failed to create space" });
		}

		await this.$spaceMember.createSpaceMember({
			spaceId: space.spaceId,
			memberId: createdBy,
			memberType: createdByType,
			role: "owner",
		});

		return space;
	}

	async getSpace(props: { id: string }) {
		const { id } = props;

		const spaceEntry = await this.$db.query.space.findFirst({
			where: (t) => eq(t.spaceId, id),
		});

		if (!spaceEntry) {
			throw new HTTPException(404, { message: "Space not found" });
		}

		const messages = await this.getMessagesInSpace({ spaceId: id });

		if (!messages || messages.length === 0) {
			return spaceEntry;
		}

		const config = { configurable: { thread_id: id } };

		const graph = new StateGraph(SpacesAnnotation).compile({
			checkpointer: postgresCheckpointer,
		});

		const state = await graph.getState(config);

		const firstCheckpoint = chronologicalPostgresCheckpointer
			.list(config, { limit: 1 })
			.next();

		const lastAIMessage = messages?.findLast((_) => _ instanceof AIMessage);
		// @ts-expect-error
		const toolCallsCount = sumBy(messages, (_) => _?.tool_calls?.length || 0);

		return {
			...spaceEntry,
			model: { modelName: lastAIMessage?.response_metadata?.model_name },
			metrics: {
				toolCalls: toolCallsCount,
				totalTokens: lastAIMessage?.response_metadata?.tokenUsage?.totalTokens,
			},
			createdAt: (await firstCheckpoint).value.checkpoint.ts,
			updatedAt: state.createdAt,
		};
	}

	async getMessagesInSpace(props: { spaceId: string }) {
		const { spaceId } = props;
		const graph = new StateGraph(SpacesAnnotation).compile({
			checkpointer: postgresCheckpointer,
		});

		const config = { configurable: { thread_id: spaceId } };

		const state = await graph.getState(config);

		const messages: Array<BaseMessage> | undefined = state.values?.messages;

		return messages;
	}
}

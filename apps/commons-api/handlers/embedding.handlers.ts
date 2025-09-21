import { typiaValidator } from "@hono/typia-validator";
import type {
	BaseMessage,
	BaseMessageLike,
	MessageContent,
	MessageType,
} from "@langchain/core/messages";
import {
	END,
	type Messages,
	MessagesAnnotation,
	START,
	StateGraph,
} from "@langchain/langgraph";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { ChatOpenAI } from "@langchain/openai";
import { LangChainCallbackHandler } from "@posthog/ai";
import dedent from "dedent";
import { type Context, Hono } from "hono";
import { createFactory } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import { omit } from "lodash-es";
import type { ChatCompletionMessageParam } from "openai/resources/index.mjs";
import { PostHog } from "posthog-node";
import { container } from "tsyringe";
import typia from "typia";
import { v4 } from "uuid";
import { postgresCheckpointer } from "../helpers/langchain.js";
import { AgentService } from "../services/agent.service.js";
import { EmbeddingService } from "../services/embedding.service.js";
import { getPostHogClient } from "../services/posthog.service.js";
import type { Agent, CreateAgent, UpdateAgent } from "../types/agent.type.js";
import type { CreateEmbedding } from "../types/embedding.type.js";

const factory = createFactory();

const createEmbedding = factory.createHandlers(
	typiaValidator("json", typia.createValidate<CreateEmbedding>()),
	async (c) => {
		const createEmbedding = c.req.valid("json");

		const $embedding = container.resolve(EmbeddingService);

		return c.json($embedding.createEmbedding(createEmbedding));
	},
);

const findEmbedding = factory.createHandlers(
	typiaValidator("json", typia.createValidate<CreateEmbedding>()),
	async (c) => {
		const searchEmbedding = c.req.valid("json");

		const $embedding = container.resolve(EmbeddingService);

		return c.json($embedding.find(searchEmbedding), 200);
	},
);

export const app = new Hono();

app.post(...createEmbedding);
app.post("find", ...findEmbedding);

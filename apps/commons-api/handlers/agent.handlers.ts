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
import { getPostHogClient } from "../services/posthog.service.js";
import type { Agent, CreateAgent, UpdateAgent } from "../types/agent.type.js";

const factory = createFactory();

const createAgent = factory.createHandlers(
	typiaValidator(
		"json",
		typia.createValidate<CreateAgent & { commonsOwned?: boolean }>(),
	),
	async (c) => {
		const body = c.req.valid("json");

		if (!body.name || !body.owner) {
			throw new HTTPException(400, { message: "Missing fields" });
		}
		// We assume isLiaison => true

		const $agent = container.resolve(AgentService);
		const agent = await $agent.createAgent({
			value: body,
			commonsOwned: body.commonsOwned,
		});

		return c.json({
			data: agent,
		});
	},
);

const getAgent = factory.createHandlers(
	typiaValidator(
		"param",
		typia.createValidate<{ agentId: Agent["agentId"] }>(),
	),
	async (c) => {
		const { agentId } = c.req.valid("param");

		const $agent = container.resolve(AgentService);
		const agent = await $agent.getAgent({
			id: agentId,
		});

		return c.json({
			data: agent,
		});
	},
);

const getAgents = factory.createHandlers(
	typiaValidator(
		"query",
		// @ts-expect-error
		typia.misc.createValidatePrune<{ owner?: Agent["owner"] }>(),
	),
	async (c) => {
		const { owner } = c.req.valid("query");

		const $agent = container.resolve(AgentService);
		const agents = await $agent.getAgents();

		return c.json({
			data: agents,
		});
	},
);

const updateAgent = factory.createHandlers(
	typiaValidator(
		"param",
		typia.createValidate<{ agentId: Agent["agentId"] }>(),
	),
	// @ts-expect-error
	typiaValidator("json", typia.misc.createValidatePrune<UpdateAgent>()),
	async (c) => {
		const delta = c.req.valid("json") as UpdateAgent;
		const { agentId } = c.req.valid("param");

		const $agent = container.resolve(AgentService);
		const updatedAgent = await $agent.updateAgent({
			id: agentId,
			delta,
		});

		return c.json({ data: updatedAgent });
	},
);

export const app = new Hono();

app.post(...createAgent);
app.get(...getAgents);
app.get("/:agentId", ...getAgent);
app.patch("/:agentId", ...updateAgent);

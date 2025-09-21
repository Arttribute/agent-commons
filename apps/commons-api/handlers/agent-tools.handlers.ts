import { typiaValidator } from "@hono/typia-validator";
import type {
	BaseMessage,
	BaseMessageLike,
	MessageContent,
	MessageType,
} from "@langchain/core/messages";
import type { ToolCall } from "@langchain/core/messages/tool";
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
import { merge, omit } from "lodash-es";
import type {
	ChatCompletionMessageFunctionToolCall,
	ChatCompletionMessageParam,
	ChatCompletionMessageToolCall,
} from "openai/resources/index.mjs";
import { PostHog } from "posthog-node";
import { container } from "tsyringe";
import typia from "typia";
import { v4 } from "uuid";
import { postgresCheckpointer } from "../helpers/langchain.js";
import { AgentService } from "../services/agent.service.js";
import { AgentToolService } from "../services/agent-tool.service.js";
import { CommonToolService } from "../services/common-tool.service.js";
import { EthereumToolService } from "../services/ethereum-tool.service.js";
import { getPostHogClient } from "../services/posthog.service.js";
import { ResourceService } from "../services/resource.service.js";
import { ToolService } from "../services/tool.service.js";
import type { Agent, CreateAgent, UpdateAgent } from "../types/agent.type.js";

export type StringWithAutocomplete<T> = T | (string & Record<never, never>);

const factory = createFactory();

const getAgentTools = factory.createHandlers(
	typiaValidator(
		"param",
		typia.createValidate<{ agentId: Agent["agentId"] }>(),
	),
	async (c) => {
		const { agentId } = c.req.valid("param");

		const $agentTool = container.resolve(AgentToolService);

		const tools = await $agentTool.getAgentTools(agentId);
		// Do not expose secureKeyRef
		return c.json({ data: tools.map(({ secureKeyRef, ...rest }) => rest) });
	},
);

const addAgentTool = factory.createHandlers(
	typiaValidator(
		"param",
		typia.createValidate<{ agentId: Agent["agentId"] }>(),
	),
	typiaValidator(
		"json",
		typia.createValidate<{ toolId: string; usageComments?: string }>(),
	),
	async (c) => {
		const { agentId } = c.req.valid("param");
		const body = c.req.valid("json");

		const $agentTool = container.resolve(AgentToolService);

		const tool = await $agentTool.addAgentTool(
			agentId,
			body.toolId,
			body.usageComments,
		);
		// Do not expose secureKeyRef
		const { secureKeyRef, ...rest } = tool;
		return c.json({ data: rest });
	},
);

const removeAgentTool = factory.createHandlers(
	typiaValidator("param", typia.createValidate<{ id: string }>()),
	async (c) => {
		const { id } = c.req.valid("param");

		const $agentTool = container.resolve(AgentToolService);

		await $agentTool.removeAgentTool(id);
		return c.json({ success: true });
	},
);

export const app = new Hono();

app.post("/:agentId/tools", ...addAgentTool);
app.get("/:agentId/tools", ...getAgentTools);
app.delete("/:agentId/tools/:id", ...removeAgentTool);

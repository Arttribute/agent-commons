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
import { CommonToolService } from "../services/common-tool.service.js";
import { EthereumToolService } from "../services/ethereum-tool.service.js";
import { getPostHogClient } from "../services/posthog.service.js";
import { ResourceService } from "../services/resource.service.js";
import { ToolService } from "../services/tool.service.js";
import type { Agent, CreateAgent, UpdateAgent } from "../types/agent.type.js";

export type StringWithAutocomplete<T> = T | (string & Record<never, never>);

const factory = createFactory();

const makeAgentToolCall = factory.createHandlers(
	typiaValidator(
		"json",
		typia.createValidate<{
			toolCall: ToolCall;
			metadata: any; // e.g. { agentId: string }
		}>(),
	),
	async (c) => {
		const { metadata, toolCall } = c.req.valid("json");
		// const args = JSON.parse(toolCall.args);
		const args = toolCall.args;
		const functionName = toolCall.name;
		const { agentId } = metadata;

		const $agent = container.resolve(AgentService);

		// 1) Verify agent
		const agent = await $agent.getAgent({ id: agentId });
		if (!agent) {
			throw new HTTPException(400, { message: `Agent "${agentId}" not found` });
		}

		// 2) Merge the agent's private key into metadata if needed
		const privateKey = $agent.seedToPrivateKey(agent.wallet.seed);
		merge(metadata, { privateKey });

		console.log("Tool Call", { functionName, args, metadata });

		// ------------------------------------------------------------------------------------
		// 3) First check: a DB-based "tool" from the tool table
		// If found AND has an apiSpec, do dynamic approach. Otherwise, fallback to next check.
		// ------------------------------------------------------------------------------------
		const $tool = container.resolve(ToolService);
		let dbTool = null;
		try {
			dbTool = await $tool.getToolByName(functionName);
		} catch (err) {
			// Not found in tool table
			dbTool = null;
		}

		if (dbTool && dbTool.schema?.apiSpec) {
			// => dynamic approach (API fetch)
			return c.json(await invokeDynamicTool(dbTool.schema.apiSpec, args));
		} else if (dbTool) {
			// If a DB-based tool is found but no apiSpec, you might do a code-based approach or error out
			// For now, let's just error or handle a partial scenario:
			throw new HTTPException(400, {
				message: `Tool "${functionName}" found in DB, but has no apiSpec or static method.`,
			});
		}

		// ------------------------------------------------------------------------------------
		// 4) Second check: "static" approach in our local code (commonToolService, ethereumToolService)
		// ------------------------------------------------------------------------------------

		const $commonTool = container.resolve(CommonToolService);
		const $ethereumTool = container.resolve(EthereumToolService);
		const staticService = [$commonTool, $ethereumTool].find(
			(service) => typeof (service as any)[functionName] === "function",
		);

		if (staticService) {
			// 4a) Call the static method
			// @ts-expect-error because we know it's a function
			const data = await staticService[functionName](args, metadata);
			return c.json(data);
		}

		// ------------------------------------------------------------------------------------
		// 5) Third check: Resource-based tools in resource table
		//    For example, the functionName might be "resourceTool_123",
		//    or the resource might store a name inside resource.schema.tool.name
		// ------------------------------------------------------------------------------------

		// (A) If your approach is to name them "resourceTool_<id>", parse the ID from the name:
		const match = functionName.match(/^resourceTool_(\w+)$/);
		if (match) {
			const resourceId = match[1]; // captured group
			console.log("Resource-based tool ID:", resourceId);

			const $resource = container.resolve(ResourceService);

			// Try to fetch that resource
			const resource = await $resource.getResourceById(resourceId);
			if (!resource) {
				throw new HTTPException(400, {
					message: `Resource-based tool not found for ID "${resourceId}"`,
				});
			}

			// If resource.schema.tool has an apiSpec, do dynamic approach:
			if (resource.schema?.apiSpec) {
				return c.json(await invokeDynamicTool(resource.schema.apiSpec, args));
			}
			// Otherwise, if it points to a static method name, you'd do that approach
			// Or throw an error if no approach:
			throw new HTTPException(400, {
				message: `Resource-based tool #${resourceId} has no "apiSpec" or static fallback`,
			});
		}

		// (B) If your approach is to store the "functionName" inside resource.schema.tool.name
		// you'd do a direct resource search by that name. e.g.:
		//
		// const resource = await this.resourceService.findResourceByFunctionName(functionName);
		// if (resource && resource.schema?.tool?.apiSpec) { ... }

		// For now, let's just throw an error if we got here
		throw new HTTPException(400, {
			message: `No static, dynamic, or resource-based tool found for "${functionName}"`,
		});
	},
);

/**
 * The "dynamic" approach for either DB-based or resource-based apiSpec:
 * build a request to external API from the tool's `apiSpec`.
 */
async function invokeDynamicTool(
	apiSpec: {
		method: string;
		baseUrl: string;
		path: string;
		headers?: Record<string, string>;
		queryParams?: Record<string, string>;
		bodyTemplate?: any;
	},
	parsedArgs: Record<string, any>,
): Promise<any> {
	const { method, baseUrl, path, headers, queryParams, bodyTemplate } = apiSpec;

	// 1) Build final URL with query params
	let finalUrl = `${baseUrl}${path}`;
	const url = new URL(finalUrl);
	if (queryParams) {
		for (const [k, v] of Object.entries(queryParams)) {
			const matched = v.match(/^\{(.+)\}$/);
			if (matched) {
				const argKey = matched[1];
				if (parsedArgs[argKey] !== undefined) {
					url.searchParams.set(k, parsedArgs[argKey].toString());
				}
			} else {
				url.searchParams.set(k, v);
			}
		}
	}
	finalUrl = url.toString();

	// 2) Build request body if not GET
	let requestBody: any;
	if (method.toUpperCase() !== "GET" && bodyTemplate) {
		requestBody = buildBodyFromTemplate(bodyTemplate, parsedArgs);
	}

	// 3) Execute fetch
	const response = await fetch(finalUrl, {
		method,
		headers: headers ?? {},
		body: requestBody ? JSON.stringify(requestBody) : undefined,
	});

	if (!response.ok) {
		throw new HTTPException(400, {
			message: `Dynamic API error: ${response.status} ${response.statusText}`,
		});
	}
	return await response.json();
}

function buildBodyFromTemplate(template: any, args: Record<string, any>): any {
	if (Array.isArray(template)) {
		return template.map((elem) => buildBodyFromTemplate(elem, args));
	} else if (template && typeof template === "object") {
		const result: any = {};
		for (const [key, val] of Object.entries(template)) {
			result[key] = buildBodyFromTemplate(val, args);
		}
		return result;
	} else if (typeof template === "string") {
		const matched = template.match(/^\{(.+)\}$/);
		if (matched) {
			const argKey = matched[1];
			return args[argKey];
		}
		return template;
	} else {
		// number, boolean, etc.
		return template;
	}
}

export const app = new Hono();

app.post("/tools/call", ...makeAgentToolCall);

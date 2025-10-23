import { typiaValidator } from "@hono/typia-validator";
import type { Messages } from "@langchain/langgraph";
import { Hono } from "hono";
import { createFactory } from "hono/factory";
import { stream, streamSSE } from "hono/streaming";
import { container } from "tsyringe";
import typia from "typia";

import { AgentActionsService } from "../services/agent-actions.service.js";

export type StringWithAutocomplete<T> = T | (string & Record<never, never>);

const factory = createFactory();

const runAgent = factory.createHandlers(
	typiaValidator("param", typia.createValidate<{ agentId: string }>()),
	typiaValidator(
		"json",
		typia.createValidate<{
			// agentId: string
			userId: string;
			sessionId?: string;
			messages: Messages;
			config?: { temperature?: number; topP?: number };
		}>(),
	),
	async (c) => {
		const { agentId } = await c.req.valid("param");
		const body = await c.req.valid("json");

		const { sessionId, userId } = body;

		const $agentActions = container.resolve(AgentActionsService);

		const state = await $agentActions.runAgent({
			agentId,
			userId,
			sessionId,
			messages: body.messages,
			config: body.config,
		});

		return c.json({
			message: state.state.messages.at(-1)?.toDict(),
			metadata: state.state.metadata,
			title: state.state.title,
			sessionId: state.sessionId,
		});

		// // const tStart = performance.now();
		// // const agent = await agentService.getAgent(agentId);

		// // get the session and see if agent has been initialized
		// // [{system}]

		// // System message

		// const messages = sessionId
		// 	? body.messages
		// 	: await addSystemMessage({ agentId, messages: body.messages });

		// const toolNode = new ToolNode([]);

		// const conversationId = sessionId || v4();

		// const posthogCallback = new LangChainCallbackHandler({
		// 	client: getPostHogClient(),
		// 	// distinctId: 'user_123', // optional
		// 	// traceId: 'trace_456', // optional
		// 	properties: { conversationId }, // optional
		// 	// groups: { company: 'company_id_in_your_db' }, // optional
		// 	privacyMode: false, // optional
		// 	debug: false, // optional - when true, logs all events to console
		// });

		// const callModel = async (
		// 	state: typeof CommonsStateAnnotation.State,
		// 	config: LangGraphRunnableConfig,
		// ) => {
		// 	llm.temperature = body?.config?.temperature || DEFAULT_TEMPERATURE;
		// 	llm.topP = body?.config?.topP || DEFAULT_TOP_P;

		// 	const messages = await llm.invoke(state.messages, {
		// 		callbacks: [posthogCallback],
		// 	});

		// 	return {
		// 		messages: messages,
		// 		metadata: {
		// 			messages: {
		// 				[messages.id!]: {
		// 					config: {
		// 						temperature: llm.temperature,
		// 						topP: llm.topP,
		// 					},
		// 				},
		// 			},
		// 		},
		// 	};
		// };

		// const generateTitle = async (
		// 	state: typeof CommonsStateAnnotation.State,
		// 	config: LangGraphRunnableConfig,
		// ) => {
		// 	const lastUserMessage = state.messages.findLast(
		// 		(_) => _ instanceof HumanMessage,
		// 	);

		// 	// Truncate message if too long
		// 	let truncatedMessage: string | undefined;

		// 	if (lastUserMessage) {
		// 		let contentWithText;

		// 		if (typeof lastUserMessage.content === "string") {
		// 			truncatedMessage = lastUserMessage.content.substring(0, 200);
		// 		} else if (
		// 			(contentWithText = find(lastUserMessage.content, { type: "text" }))
		// 		) {
		// 			truncatedMessage = (
		// 				contentWithText as MessageContentText
		// 			).text.substring(0, 200);
		// 		}
		// 	}

		// 	if (!truncatedMessage) {
		// 		return {};
		// 	}

		// 	const response = await titleLlm.invoke([
		// 		new SystemMessage({
		// 			content:
		// 				"Generate a short, descriptive title (max 6 words) for this conversation based on the user's message. Do not use quotes or special characters.",
		// 		}),
		// 		new HumanMessage({ content: truncatedMessage }),
		// 	]);
		// 	const title = response.content?.toString()?.trim();

		// 	return { title };
		// };

		// const modelBranching = (state: typeof CommonsStateAnnotation.State) => {
		// 	const { messages } = state;
		// 	const lastMessage = messages[messages.length - 1];

		// 	const nodes = [];

		// 	if (!state.title) {
		// 		nodes.push("generateTitle");
		// 	}

		// 	if (
		// 		"tool_calls" in lastMessage &&
		// 		Array.isArray(lastMessage.tool_calls) &&
		// 		lastMessage.tool_calls?.length
		// 	) {
		// 		nodes.push("tools");
		// 	}

		// 	if (nodes.length === 0) {
		// 		return END;
		// 	}
		// 	return nodes;
		// };

		// const workflow = new StateGraph(CommonsStateAnnotation)
		// 	// Define the node and edge
		// 	.addNode("model", callModel)
		// 	.addNode("generateTitle", generateTitle)
		// 	.addNode("tools", toolNode)
		// 	.addEdge(START, "model")
		// 	.addConditionalEdges("model", modelBranching, [
		// 		"tools",
		// 		"generateTitle",
		// 		END,
		// 	])
		// 	.addEdge("tools", "model")
		// 	.addEdge("generateTitle", END);

		// const graph = workflow.compile({ checkpointer: postgresCheckpointer });

		// const config: Parameters<typeof graph.invoke>[1] = {
		// 	// configurable: { thread_id: conversationId, user_id: "", agent_id: "" },
		// 	configurable: {
		// 		thread_id: conversationId,
		// 	},
		// };

		// const llmResponse = await graph.invoke({ messages }, config);

		// // console.log({ llmResponse });

		// return c.json({
		// 	message: llmResponse.messages.at(-1)?.toDict(),
		// 	metadata: llmResponse.metadata,
		// 	title: llmResponse.title,
		// 	sessionId: conversationId,
		// });
	},
);

const runAgentStream = factory.createHandlers(
	runAgent[0],
	runAgent[1],
	async (c) => {
		const { agentId } = c.req.valid("param");
		const body = c.req.valid("json");
		const accept = c.req.header()["accept"] || "text/event-stream";

		const { sessionId, userId } = body;

		const $agentActions = container.resolve(AgentActionsService);

		const { state: stateStream, sessionId: newSessionId } =
			await $agentActions.runAgent(
				{
					agentId,
					sessionId,
					userId,
					messages: body.messages,
					config: body.config,
				},
				{ stream: true },
			);

		c.res.headers.set("Connection", "keep-alive");
		c.res.headers.set("Transfer-Encoding", "chunked");
		c.res.headers.set("Cache-Control", "no-transform");

		if (accept === "application/x-ndjson") {
			c.res.headers.set("Content-Type", "application/x-ndjson");

			return stream(c, async (stream) => {
				for await (const stateChunk of stateStream) {
					console.log({ stateChunk });
					if ("chunk" in stateChunk.data) {
						const chunk = `${JSON.stringify(stateChunk)}\n`;

						await stream.write(chunk);
					}
				}
			});
		}
		let id = 0;

		c.res.headers.set("Content-Type", "text/event-stream");

		return streamSSE(c, async (stream) => {
			while (true) {
				const message = `It is ${new Date().toISOString()}`;
				await stream.writeSSE({
					data: message,
					event: "time-update",
					id: String(id++),
				});
				await stream.sleep(1000);
			}
		});
	},
);

export const app = new Hono();

app.post("/:agentId/run", ...runAgent);
app.post("/:agentId/run/stream", ...runAgentStream);

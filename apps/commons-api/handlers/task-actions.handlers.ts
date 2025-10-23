import { typiaValidator } from "@hono/typia-validator";
import type { Messages } from "@langchain/langgraph";
import { Hono } from "hono";
import { createFactory } from "hono/factory";
import typia from "typia";

export type StringWithAutocomplete<T> = T | (string & Record<never, never>);

const factory = createFactory();

const runTask = factory.createHandlers(
	typiaValidator("param", typia.createValidate<{ agentId: string }>()),
	typiaValidator(
		"json",
		typia.createValidate<{
			// agentId: string
			sessionId?: string;
			messages: Messages;
			config?: { temperature?: number; topP?: number };
		}>(),
	),
	async (c) => {
		// Maybe get the task then resolve the session from it then determine the agent
	},
);

export const app = new Hono();

app.post("/:taskId/run", ...runTask);
// app.post("/:taskId/run/stream", ...runTaskStream);

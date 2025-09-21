import { typiaValidator } from "@hono/typia-validator";
import { Hono } from "hono";
import { createFactory } from "hono/factory";
import type { ChatCompletionTool } from "openai/resources";
import { container } from "tsyringe";
import typia from "typia";
import { ToolService } from "../services/tool.service.js";

const factory = createFactory();

const createTool = factory.createHandlers(
	typiaValidator(
		"json",
		typia.createValidate<{
			name: string;
			schema: ChatCompletionTool;
			tags?: string[];
			rating?: number;
			version?: string;
		}>(),
	),
	async (c) => {
		const body = c.req.valid("json");

		const $tool = container.resolve(ToolService);

		const created = await $tool.createTool(body);

		return c.json({ data: created });
	},
);

const getAllTools = factory.createHandlers(async (c) => {
	const $tool = container.resolve(ToolService);

	const tools = await $tool.getAllTools();

	return c.json({ data: tools });
});

const getToolByName = factory.createHandlers(
	typiaValidator(
		"param",
		typia.createValidate<{
			name: string;
		}>(),
	),
	async (c) => {
		const { name } = c.req.valid("param");

		const $tool = container.resolve(ToolService);

		const tool = await $tool.getToolByName(name);

		return c.json({ data: tool });
	},
);

const updateTool = factory.createHandlers(
	typiaValidator(
		"param",
		typia.createValidate<{
			name: string;
		}>(),
	),
	typiaValidator(
		"json",
		typia.createValidate<{
			schema?: ChatCompletionTool;
			tags?: string[];
			rating?: number;
			version?: string;
		}>(),
	),
	async (c) => {
		const { name } = c.req.valid("param");
		const body = c.req.valid("json");

		const $tool = container.resolve(ToolService);

		const updated = await $tool.updateToolByName({
			name,
			...body,
		});

		return c.json({ data: updated });
	},
);

export const app = new Hono();

app.post(...createTool);
app.get(...getAllTools);
app.get("/:name", ...getToolByName);
app.put("/:name", ...updateTool);

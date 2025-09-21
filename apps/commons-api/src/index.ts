import "reflect-metadata";

import { serve } from "@hono/node-server";
import { getConnInfo } from "@hono/node-server/conninfo";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import { Hono } from "hono";
import { showRoutes } from "hono/dev";
import { logger } from "hono/logger";

import { app as agentApp } from "../handlers/agent.handlers.js";
import { app as agentActionsApp } from "../handlers/agent-actions.handlers.js";
import { app as agentToolsApp } from "../handlers/agent-tools.handlers.js";
import { app as agentToolsActionsApp } from "../handlers/agent-tools-actions.handlers.js";
import { app as embeddingApp } from "../handlers/embedding.handlers.js";
import { app as sessionApp } from "../handlers/session.handlers.js";
import { app as spaceApp } from "../handlers/space.handlers.js";
import { app as spaceActionsApp } from "../handlers/space-actions.handlers.js";
import { app as spaceMemberApp } from "../handlers/space-member.handlers.js";
import { app as toolApp } from "../handlers/tool.handlers.js";

// import { app as agentAc  tionsApp } from "../handlers/agent-actions.handlers.js";

const v1 = new Hono().basePath("/v1");

v1.route("/agents", agentApp);
v1.route("/agents", agentToolsApp);
v1.route("/agents", agentToolsActionsApp);
v1.route("/agents", agentActionsApp);
v1.route("/sessions", sessionApp);
v1.route("/spaces", spaceApp);
v1.route("/spaces", spaceActionsApp);
v1.route("/spaces", spaceMemberApp);
v1.route("/embeddings", embeddingApp);
v1.route("/tools", toolApp);
// v1.route("/agents", agentActionsApp);

const app = new Hono();

app.use((c, next) => {
	try {
		const info = getConnInfo(c);
		const clientIP = c.req.header()["x-real-ip"];
		return logger((message: string, ...rest: string[]) => {
			console.log(clientIP || info.remote.address, message, ...rest);
		})(c, next);
	} catch (err) {
		return logger()(c, next);
	}
});

app.get("/", (c) => {
	return c.text("Hello Hono!");
});
app.route("/", v1);

serve(
	{ fetch: app.fetch, port: parseInt(process.env.PORT!) || 3000 },
	(info) => {
		showRoutes(app, { colorize: true, verbose: true });
		console.log(`Server is running on http://localhost:${info.port}`);

		const {
			POSTGRES_DATABASE,
			POSTGRES_HOST,
			POSTGRES_PASSWORD,
			POSTGRES_PORT,
			POSTGRES_USER,
		} = process.env;
		const checkpointer = PostgresSaver.fromConnString(
			`postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@${POSTGRES_HOST}:${POSTGRES_PORT}/${POSTGRES_DATABASE}`,
		);

		checkpointer.setup();
	},
);

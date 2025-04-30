import { serve } from "@hono/node-server";
import { createAgent, runAgent } from "../handlers/agents.handlers.js";
// import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import { Hono } from "hono";
import { env } from "hono/adapter";
import { showRoutes } from "hono/dev";

const v1 = new Hono().basePath("/v1");

v1.post("/agents", createAgent);
v1.post("/agents/run", runAgent);
// v1.post("/agents/tools", makeAgentToolCall);

const app = new Hono();

let setupCheckpointer = false;
app.use(async (c, next) => {
  if (!setupCheckpointer) {
    const {
      POSTGRES_DATABASE,
      POSTGRES_HOST,
      POSTGRES_PASSWORD,
      POSTGRES_PORT,
      POSTGRES_USER,
    } = env<{
      OPENAI_API_KEY: string;
      POSTGRES_USER: string;
      POSTGRES_PASSWORD: string;
      POSTGRES_HOST: string;
      POSTGRES_PORT: string;
      POSTGRES_DATABASE: string;
    }>(c);
    const checkpointer = PostgresSaver.fromConnString(
      `postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@${POSTGRES_HOST}:${POSTGRES_PORT}/${POSTGRES_DATABASE}`
    );

    await checkpointer.setup().then(() => {
      setupCheckpointer = true;
    });
  }
  await next();
});

app.get("/", (c) => {
  return c.text("Hello Hono!");
});
app.route("/", v1);

serve(
  {
    fetch: app.fetch,
    port: parseInt(process.env.PORT!) || 3000,
  },
  (info) => {
    showRoutes(app, { colorize: true, verbose: true });
    console.log(`Server is running on http://localhost:${info.port}`);
  }
);

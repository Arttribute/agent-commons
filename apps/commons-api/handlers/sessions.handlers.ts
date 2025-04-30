import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { postgresCheckpointer } from "../services/langchain.service.js";
import { MessagesAnnotation, StateGraph } from "@langchain/langgraph";

export async function getSession(c: Context) {
  const sessionId = c.req.param("sessionId");
  if (!sessionId) {
    throw new HTTPException(400, { message: "Missing sessionId" });
  }

  const graph = new StateGraph(MessagesAnnotation).compile({
    checkpointer: postgresCheckpointer,
  });
  const { values } = await graph.getState({ configurable: { thread_id: "" } });

  return c.json({ values });
}

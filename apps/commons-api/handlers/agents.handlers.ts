import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { agentService } from "../services/agent.service.js";
import {
  END,
  MessagesAnnotation,
  START,
  StateGraph,
  type Messages,
} from "@langchain/langgraph";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { v4 } from "uuid";
import { ChatOpenAI } from "@langchain/openai";
import { database as db } from "../services/database.service.js";
import type { ChatCompletionMessageParam } from "openai/resources/index.mjs";
import dedent from "dedent";
import type {
  BaseMessage,
  BaseMessageLike,
  MessageContent,
  MessageType,
} from "@langchain/core/messages";
import { omit } from "lodash-es";
import typia from "typia";
import { postgresCheckpointer } from "../services/langchain.service.js";
import { LangChainCallbackHandler } from "@posthog/ai";
import { getPosthog } from "../services/posthog.service.js";

export type StringWithAutocomplete<T> = T | (string & Record<never, never>);

export async function createAgent(c: Context) {
  const body = await c.req.json<{
    name: string;
    owner: string;
  }>();
  if (!body.name || !body.owner) {
    throw new HTTPException(400, { message: "Missing fields" });
  }
  // We assume isLiaison => true
  const result = await agentService.createAgent({
    name: body.name,
    owner: body.owner,
    isLiaison: true,
  });

  return c.json({
    agentId: result.agent.agentId,
    name: result.agent.name,
    liaisonKey: result.liaisonKey || null,
    liaisonKeyDisplay: result.agent.liaisonKeyDisplay || null,
  });
}

async function addSystemMessage(props: {
  messages: Messages;
  agentId: string;
}): Promise<Messages> {
  const { messages, agentId } = props;
  const agent = await agentService.getAgent(agentId);

  const systemMessage: BaseMessageLike = {
    role: "system",
    content: dedent`You are the following agent:
      ${JSON.stringify(omit(agent, ["instructions", "persona", "wallet"]))}
      Use any tools necessary to get information in order to perform the task.
      Ensure that the arguments provided to the tools are correct and as accurate as possible.

      The following is the persona you are meant to adopt:
      ${agent.persona}

      The following are the instructions you are meant to follow:
      ${agent.instructions}`,
  };

  if (
    Array.isArray(messages) &&
    !typia.is<
      [
        StringWithAutocomplete<
          MessageType | "user" | "assistant" | "placeholder"
        >,
        MessageContent,
      ]
    >(messages)
  ) {
    // messages.unshift(systemMessage);
    return [systemMessage, ...messages];
  } else {
    return [systemMessage, messages];
  }
}

export async function runAgent(c: Context) {
  const body = await c.req.json<{
    agentId: string;
    messages: Messages;
    sessionId?: string;
  }>();

  const { agentId } = body;

  // const tStart = performance.now();
  // const agent = await agentService.getAgent(agentId);

  // get the session and see if agent has been initialized
  // [{sytem}]

  // System message

  const llm = new ChatOpenAI({
    model: "gpt-4o", //4o is better in coding tasks so far compared to 4o-mini: however 4o-mini is cheaper for testing
    temperature: 0,
    supportsStrictToolCalling: true,
    apiKey: process.env.OPENAI_API_KEY,
  });

  const messages = await addSystemMessage({ agentId, messages: body.messages });

  // llm = Gemini()

  let toolNode = new ToolNode([]);

  const conversationId = v4();

  const posthogCallback = new LangChainCallbackHandler({
    client: getPosthog(),
    // distinctId: 'user_123', // optional
    // traceId: 'trace_456', // optional
    properties: { conversationId }, // optional
    // groups: { company: 'company_id_in_your_db' }, // optional
    privacyMode: false, // optional
    debug: false, // optional - when true, logs all events to console
  });
  const callModel = async (s: typeof MessagesAnnotation.State) => ({
    messages: await llm.invoke(s.messages, {
      callbacks: [posthogCallback],
    }),
  });

  const shouldContinue = (state: typeof MessagesAnnotation.State) => {
    const { messages } = state;
    const lastMessage = messages[messages.length - 1];

    if (
      "tool_calls" in lastMessage &&
      Array.isArray(lastMessage.tool_calls) &&
      lastMessage.tool_calls?.length
    ) {
      return "tools";
    }
    return END;
  };

  const workflow = new StateGraph(MessagesAnnotation)
    // Define the node and edge
    .addNode("model", callModel)
    .addNode("tools", toolNode)
    .addEdge(START, "model")
    .addConditionalEdges("model", shouldContinue, ["tools", END]);
  // .addConditionalEdges("tools", updateTools, ["model"]);
  // .addEdge('model', END);

  const graph = workflow.compile({ checkpointer: postgresCheckpointer });
  graph.

  const config: Parameters<typeof graph.invoke>[1] = {
    // configurable: { thread_id: conversationId, user_id: "", agent_id: "" },
    configurable: { thread_id: conversationId },
  };

  const llmResponse = await graph.invoke({ messages }, config);

  return c.json({
    ...llmResponse.messages.at(-1)?.toDict(),
    // sessionId: uuid,
  });
}

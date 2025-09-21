import type { StreamEvent } from '@langchain/core/tracers/log_stream'
import type { IterableReadableStream } from '@langchain/core/utils/stream'
import type { IChatGptSchema } from '@samchon/openapi'
import type { ChatCompletionFunctionTool } from 'openai/resources'
import {
  HumanMessage,
  type MessageContentText,
  SystemMessage,
} from '@langchain/core/messages'
import { tool } from '@langchain/core/tools'
import {
  Annotation,
  END,
  type LangGraphRunnableConfig,
  type Messages,
  MessagesAnnotation,
  START,
  StateGraph,
} from '@langchain/langgraph'
import { ToolNode } from '@langchain/langgraph/prebuilt'
import { ChatOpenAI } from '@langchain/openai'
import { LangChainCallbackHandler } from '@posthog/ai'
import dedent from 'dedent'
import got, { HTTPError } from 'got'
import { find, map, merge, omit } from 'lodash-es'
import { inject, injectable } from 'tsyringe'
import typia from 'typia'
import { v4 } from 'uuid'

import type { CommonTool } from './common-tool.service.js'
import type { EthereumTool } from './ethereum-tool.service.js'
import { postgresCheckpointer } from '../helpers/langchain.js'
import { AgentService } from './agent.service.js'
import { getPostHogClient } from './posthog.service.js'

const app = typia.llm.application<EthereumTool & CommonTool, 'chatgpt'>()

type StringWithAutocomplete<T> = T | (string & Record<never, never>)

const DEFAULT_TEMPERATURE = 0.7
const DEFAULT_TOP_P = 1

export const AgentsAnnotation = Annotation.Root({
  ...MessagesAnnotation.spec, // Spread in the messages state
  title: Annotation<string>,
  sessionId: Annotation<string>,
  childSessions: Annotation<Record<string, string>>({ reducer: merge }),
  metadata: Annotation<Record<string, any>>({ reducer: merge }),
})

@injectable()
export class AgentActionsService {
  private llm = new ChatOpenAI({
    model: 'gpt-5-mini', //4o is better in coding tasks so far compared to 4o-mini: however 4o-mini is cheaper for testing
    temperature: DEFAULT_TEMPERATURE,
    topP: DEFAULT_TOP_P,
    // TODO: not sure about the implications of supportsStrictToolCalling: true
    // supportsStrictToolCalling: true,
    apiKey: process.env.OPENAI_API_KEY,
  })

  private titleLlm = new ChatOpenAI({
    model: 'gpt-5-nano',
    temperature: 0.3,
    maxTokens: 20,
    apiKey: process.env.OPENAI_API_KEY,
  })

  constructor(@inject(AgentService) private $agent: AgentService) {}

  async createSystemMessage(props: { agentId: string; sessionId: string }) {
    const { agentId, sessionId } = props

    const agent = await this.$agent.getAgent({ id: agentId })

    const childSessions = await this.$agent.getChildSessions(sessionId)

    const childSessionsInfo =
      childSessions.length > 0
        ? `\n\nEXISTING CHILD SESSIONS:\nYou have the following ongoing conversations with other agents. Use these sessionIds to continue existing conversations instead of starting new ones:\n${childSessions.map((cs) => `- Agent ${cs.childAgentId}: ${cs.title || 'Untitled conversation'} (sessionId=${cs.childSessionId}, started: ${cs.createdAt})`).join('\n')}`
        : ''

    return new SystemMessage({
      content: dedent`You are the following agent:
          ${JSON.stringify(omit(agent, ['instructions', 'persona', 'wallet']))}
              Persona:
          ${agent.persona}

          Instructions:
          ${agent.instructions}
          

          The current date and time is ${new Date().toISOString()}.
           **SESSION ID**: ${sessionId}

          Note that you can interact and engage with other agents using the interactWithAgent tool. This tool allows you to interact with other agents one at a time. Once you initiate a conversation with another agent, you can continue the conversation by calling the interactWithAgent tool again with the sessionId provided in the result of running the interactWithAgent tool. This will allow you to continue the conversation with the other agent.${childSessionsInfo}
          It is also possible to interact with a group of agents in spaces. You can use the createSpace tool to create a new space and can add other agents to the space using addAgentToSpace tool. Once in a space, you can send meassages to the space using the sendMessageToSpace tool. To get the context of the interactions on space, you can use the getSpaceMessages tool before sending messagesto the space. You can also join spaces created by other entities using the joinSpace tool.
          To unsubscribe from a space, you can use the unsubscribeFromSpace tool. To subscribe to a space, you can use the subscribeToSpace tool.
          If your response to the agent/agents/users involves multiple tasks let them know by sending a message before creating the goals and tasks.
          If you have a session id, provide it as an arg when sending a message to a space.


          STRICTLY ABIDE BY THE FOLLOWING:
          • If a request is simple and does not require complex planning give an immediate response.
          • If a request is complex and requires multiple steps, call createGoal which creates a goal and then get the goal id and use createTask to create tasks for the goal with the necessary details.
          • In the process of creating a goal, think very deeply and critically about it. Break it down and detail every single paart of it. Set a SMART(Specific, Measureble, Achievable, Relevant and Time-bound) goal with a clear description. Consider all factors and create a well thought out plan of action and include it in the goal description. This should now guide the tasks to be created. Include the tasks breakdown in the goal description as well.The tasks to be created should match the tasks breakdown in the goal description. If no exact timelines are provided for the goal set the goal deadline to the current time.
          • Similarly, when creating tasks, think very deeply and critically about it. Set a SMART(Specific, Measureble, Achievable, Relevant and Time-bound) task with a clear description. Consider all factors and create a well thought out plan of action and include it in the task description. Remember some tasks may be dependent on each other. Think about what tools might be needed to accomplish the task and include them in the task description and task tools.
          • For every task specify the context of the task. The context should contain all the necessary information that are either needed or would be beneficial for the task.
          • Before starting the execution make sure that the goal and all its tasks are fully created .
          • STRICTLY DO NOT start execution of a task or update any task using updateTaskProgress until the user specifically asks you to do so.
          ## ONLY DO THESE ONCE THE GOAL AND TASKS ARE FULLY CREATED AND THE USER ASKS YOU TO DO SO:
          • As you execute tasks, update tasks progress accordingly with all the necessary information, call the updateTaskProgress  with the necessary details.Provide the actual result content of the task and the summary of the task.
          • If tasks require the use of tools, include the needed tools in the task and use the tools to execute the tasks.
          • For each task, perform the task and produce the content expected for the task given by the expectedOutputType in the task context. The result content should be the actual conent produced. For example if the task was to generate code, the result content should contain the code generated. If the task was to fetch data, the result content should contain the data fetched. If the task was to generate a report, the result content should contain the report generated. If the task was to generate an image, the result content should contain the image generated. If the task was to generate a video, the result content should contain the video generated. If the task was to generate a text, the result content should contain the text generated. If the task was to generate a pdf, the result content should contain the pdf generated.
          • Unless given specific completion deadlines and schedules, all goals and tasks should be completed immediately.
          • In case of any new information that is relevant to the task, update the task and task context with the new information. 
          • If you are unable to complete a task, call the updateTaskProgress with the necessary details and provide a summary of the failure.
        `,
    })
  }

  async runAgent(
    props: {
      agentId: string
      sessionId?: string
      messages: Messages
      config?: { temperature?: number; topP?: number }
    },
    options: { stream: true },
  ): Promise<{ state: IterableReadableStream<StreamEvent>; sessionId: string }>
  async runAgent(
    props: {
      agentId: string
      sessionId?: string
      messages: Messages
      config?: { temperature?: number; topP?: number }
    },
    options?: { stream?: boolean },
  ): Promise<{ state: typeof AgentsAnnotation.State; sessionId: string }>
  async runAgent(
    props: {
      agentId: string
      sessionId?: string
      messages: Messages
      config?: { temperature?: number; topP?: number }
    },
    options?: { stream?: boolean },
  ) {
    const { agentId, sessionId = v4(), messages } = props
    const { stream } = options || {}

    const staticTools = map(app.functions, (_) => ({
      type: 'function',
      function: {
        ..._,
        parameters:
          _?.parameters as unknown as ChatCompletionFunctionTool['function']['parameters'],
      },
      endpoint: `http://localhost:${process.env.PORT}/v1/agents/tools/call`,
    })) as (ChatCompletionFunctionTool & { endpoint: string })[]

    // staticTools.forEach((_) => {
    //   delete _.function.parameters?.$defs
    //   // @ts-expect-error
    //   delete _.function.parameters?.properties?.metadata
    // })

    const makeRunner = (
      def: ChatCompletionFunctionTool & { endpoint: string },
    ) =>
      tool(
        async (args, config) => {
          const fn = config.toolCall?.name ?? 'unknown'
          const t0 = performance.now()
          const data = await got
            .post(`http://localhost:${process.env.PORT}/v1/agents/tools/call`, {
              json: {
                args,
                toolCall: config.toolCall,
                metadata: { agentId, sessionId },
              },
              headers: { 'Content-Type': 'application/json' },
            })
            .json<any>()
            .catch((e: any) => {
              // toolUsage.push({
              // 	name: fn,
              // 	status: "error",
              // 	duration: performance.now() - t0,
              // });
              // console.log({ error: e })
              console.log({ message: (e as HTTPError).message })
              throw e
            })

          // toolUsage.push({
          // 	name: fn,
          // 	status: "success",
          // 	duration: performance.now() - t0,
          // });

          const callObj = {
            role: 'tool',
            name: fn,
            status: 'success',
            duration: performance.now() - t0,
            args,
            result: data,
            timestamp: new Date().toISOString(),
          }

          // executedCalls.push(callObj);

          // subscriber.next({
          // 	type: "tool",
          // 	...callObj,
          // });

          return { toolData: data }
        },
        {
          name: def.function.name,
          description: def.function.description,
          schema: def.function
            .parameters as unknown as IChatGptSchema.IParameters,
        },
      )

    const toolRunners = staticTools.map((def) =>
      makeRunner(def as ChatCompletionFunctionTool & { endpoint: string }),
    )

    const toolNode = new ToolNode(toolRunners)

    const workflow = new StateGraph(AgentsAnnotation)
      // Define the node and edge
      .addNode('model', this.callModel.bind(this))
      .addNode('generateTitle', this.generateTitle.bind(this))
      .addNode('tools', toolNode)
      .addEdge(START, 'model')
      .addConditionalEdges('model', this.modelBranching, [
        'tools',
        'generateTitle',
        END,
      ])
      .addEdge('tools', 'model')
      .addEdge('generateTitle', END)

    const graph = workflow.compile({ checkpointer: postgresCheckpointer })

    const config: Parameters<typeof graph.invoke>[1] = {
      // configurable: { thread_id: conversationId, user_id: "", agent_id: "" },
      configurable: {
        thread_id: sessionId,
        models: {
          basic: staticTools.length
            ? this.llm.bindTools(
                staticTools,
                // TODO: Not sure about the implications of strict: false
                { strict: false, parallel_tool_calls: true },
              )
            : this.llm,
        },
        // user_id: "",
        agentId,
        topP: props.config?.topP || DEFAULT_TOP_P,
        temperature: props.config?.temperature || DEFAULT_TEMPERATURE,
      },
    }

    if (stream) {
      return {
        state: await graph.streamEvents(
          { messages, sessionId },
          { ...config, version: 'v2' },
        ),
        sessionId,
      }
    }

    const state = await graph.invoke({ messages, sessionId }, config)

    return { state, sessionId }
  }

  private async generateTitle(state: typeof AgentsAnnotation.State) {
    const lastUserMessage = state.messages.findLast(
      (_) => _ instanceof HumanMessage,
    )

    // Truncate message if too long
    let truncatedMessage: string | undefined

    if (lastUserMessage) {
      let contentWithText

      if (typeof lastUserMessage.content === 'string') {
        truncatedMessage = lastUserMessage.content.substring(0, 200)
      } else if (
        (contentWithText = find(lastUserMessage.content, { type: 'text' }))
      ) {
        truncatedMessage = (
          contentWithText as MessageContentText
        ).text.substring(0, 200)
      }
    }

    if (!truncatedMessage) {
      return {}
    }

    const response = await this.titleLlm.invoke([
      new SystemMessage({
        content:
          "Generate a short, descriptive title (max 6 words) for this conversation based on the user's message. Do not use quotes or special characters.",
      }),
      new HumanMessage({ content: truncatedMessage }),
    ])
    const title = response.content?.toString()?.trim()

    return { title }
  }

  private async callModel(
    state: typeof AgentsAnnotation.State,
    config: LangGraphRunnableConfig,
  ) {
    const llm = config.configurable?.models?.basic || this.llm

    // console.log(llm.defaultOptions.tools[2].function)

    llm.temperature = config.configurable?.temperature || DEFAULT_TEMPERATURE
    llm.topP = config.configurable?.topP || DEFAULT_TOP_P

    const posthogCallback = new LangChainCallbackHandler({
      client: getPostHogClient(),
      // distinctId: 'user_123', // optional
      // traceId: 'trace_456', // optional
      properties: { conversationId: config.configurable?.thread_id }, // optional
      // groups: { company: 'company_id_in_your_db' }, // optional
      privacyMode: false, // optional
      debug: false, // optional - when true, logs all events to console
    })

    if (!(state.messages[0] instanceof SystemMessage)) {
      state.messages.unshift(
        await this.createSystemMessage({
          agentId: config.configurable?.agentId!,
          sessionId: config.configurable?.thread_id!,
        }),
      )
    }

    const message = await llm.invoke(state.messages, {
      callbacks: [posthogCallback],
    })

    return {
      messages: message,
      metadata: {
        messages: {
          [message.id!]: {
            agentId: config.configurable?.agentId,
            config: { temperature: this.llm.temperature, topP: this.llm.topP },
          },
        },
      },
    }
  }

  private modelBranching(state: typeof AgentsAnnotation.State) {
    const { messages } = state
    const lastMessage = messages[messages.length - 1]

    const nodes = []

    // if (!state.title) {
    //   nodes.push('generateTitle')
    // }

    if (
      'tool_calls' in lastMessage &&
      Array.isArray(lastMessage.tool_calls) &&
      lastMessage.tool_calls?.length
    ) {
      nodes.push('tools')
    }

    if (nodes.length === 0) {
      return END
    }
    return nodes
  }
}

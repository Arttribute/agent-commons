import { typiaValidator } from '@hono/typia-validator'
import { type BaseMessageLike, SystemMessage } from '@langchain/core/messages'
import { StateGraph } from '@langchain/langgraph'
import dedent from 'dedent'
import { Hono } from 'hono'
import { createFactory } from 'hono/factory'
import { HTTPException } from 'hono/http-exception'
import { container } from 'tsyringe'
import typia from 'typia'
import { v4 } from 'uuid'

import { postgresCheckpointer } from '../helpers/langchain.js'
import { AgentActionsService } from '../services/agent-actions.service.js'
import { SpacesAnnotation } from '../services/space.service.js'
import { SpaceActionsService } from '../services/space-actions.service.js'

const factory = createFactory()

const createSpace = factory.createHandlers((c) => {
  // Create a new space in the database or any other source
  return c.json({ id: v4() })
})

const addMessageToSpace = factory.createHandlers(
  typiaValidator(
    'json',
    typia.createValidate<{ message: BaseMessageLike; userId?: string }>(),
  ),
  typiaValidator('param', typia.createValidate<{ spaceId: string }>()),
  async (c) => {
    const { spaceId } = c.req.valid('param')
    const { message, userId } = c.req.valid('json')
    if (!spaceId) {
      throw new HTTPException(400, { message: 'Missing spaceId' })
    }

    const $spaceActions = container.resolve(SpaceActionsService)

    await $spaceActions.sendMessage({
      senderId: userId || 'unknown',
      spaceId,
      message,
    })

    // Create a new space in the database or any other source
    return c.json({ id: spaceId })
  },
)

const promptAgentFromSpace = factory.createHandlers(
  typiaValidator('param', typia.createValidate<{ spaceId: string }>()),
  typiaValidator(
    'json',
    typia.createValidate<{ agentId: string; sessionId?: string }>(),
  ),
  async (c) => {
    const { spaceId } = c.req.valid('param')
    let { agentId, sessionId } = c.req.valid('json')
    if (!spaceId) {
      throw new HTTPException(400, { message: 'Missing spaceId' })
    }

    const graph = new StateGraph(SpacesAnnotation).compile({
      checkpointer: postgresCheckpointer,
    })

    const config = { configurable: { thread_id: spaceId } }

    const state = await graph.getState(config)

    sessionId ||= (state.values as typeof SpacesAnnotation.State).sessions?.[
      agentId
    ]

    const messages =
      (state.values as typeof SpacesAnnotation.State).messages || []
    const metadata =
      (state.values as typeof SpacesAnnotation.State).metadata || []

    const messagesWithMetadata = messages.map((_) => {
      return {
        type: _.getType(),
        name: _.name,
        // ..._,
        // content: [{type:"text", content: ""}, ]
        content: dedent`
					${JSON.stringify(metadata.messages?.[_.id!] || {})}
					--------------------
					${_.content}
					`,
      }
    })

    const $agentActions = container.resolve(AgentActionsService)

    const { sessionId: newSessionId, state: response } =
      await $agentActions.runAgent({
        agentId,
        // TODO: Fix
        messages: sessionId
          ? messagesWithMetadata
          : [
              new SystemMessage({
                content: dedent`
				You are an agent in a space, which is a collaborative conversation group that has both users and agents.
				You are provided with the conversation history of the space, which may include messages from you, users and other agents.
				Your task is to respond to the latest user message in the space, taking into account the context of the conversation history.
				`,
              }),
              ...messagesWithMetadata,
            ],
        sessionId,
      })

    await graph.invoke(
      {
        messages: response.messages.at(-1),
        sessions: { [agentId]: newSessionId },
        metadata: {
          messages: {
            // @ts-expect-error
            [response.messages.at(-1).id]: {
              agentId,
              createdAt: new Date().toISOString(),
            },
          },
        },
      },
      config,
    )

    // response.messages[0].content
    // graph.invoke({messages: {}})

    return c.json({ id: spaceId, sessionId: newSessionId })
  },
)

export const app = new Hono()

app.post('/:spaceId/messages', ...addMessageToSpace)
app.post('/:spaceId/agents/prompt', ...promptAgentFromSpace)

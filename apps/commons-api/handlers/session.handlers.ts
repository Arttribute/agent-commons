import { typiaValidator } from '@hono/typia-validator'
import { AIMessage, type BaseMessage } from '@langchain/core/messages'
import { StateGraph } from '@langchain/langgraph'
import { Hono } from 'hono'
import { createFactory } from 'hono/factory'
import { HTTPException } from 'hono/http-exception'
import { sumBy } from 'lodash-es'
import typia from 'typia'

import {
  chronologicalPostgresCheckpointer,
  postgresCheckpointer,
} from '../helpers/langchain.js'
import { AgentsAnnotation } from '../services/agent-actions.service.js'

const factory = createFactory()

const getSession = factory.createHandlers(
  typiaValidator('param', typia.createValidate<{ sessionId: string }>()),
  async (c) => {
    const sessionId = c.req.param('sessionId')
    if (!sessionId) {
      throw new HTTPException(400, { message: 'Missing sessionId' })
    }

    const graph = new StateGraph(AgentsAnnotation).compile({
      checkpointer: postgresCheckpointer,
    })

    // graph.invoke({messages: {}})

    const config = { configurable: { thread_id: sessionId } }

    const firstCheckpoint = chronologicalPostgresCheckpointer
      .list(config, { limit: 1 })
      .next()

    const state = await graph.getState(config)

    const messages: Array<BaseMessage> | undefined = state.values?.messages

    // @ts-expect-error
    const toolCallsCount = sumBy(messages, (_) => _?.tool_calls?.length || 0)

    const lastAIMessage = messages?.findLast((_) => _ instanceof AIMessage)

    // console.log(state);

    return c.json({
      ...state.values,
      messages: messages?.map((_) => _.toDict()),

      model: { modelName: lastAIMessage?.response_metadata?.model_name },
      metrics: {
        toolCalls: toolCallsCount,
        totalTokens: lastAIMessage?.response_metadata?.tokenUsage?.totalTokens,
      },
      createdAt: (await firstCheckpoint).value.checkpoint.ts,
      updatedAt: state.createdAt,
    })
  },
)

export const app = new Hono()

app.get('/:sessionId', ...getSession)

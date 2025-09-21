import {
  AIMessage,
  type BaseMessageLike,
  SystemMessage,
} from '@langchain/core/messages'
import { END, START, StateGraph } from '@langchain/langgraph'
import { ChatOpenAI } from '@langchain/openai'
import dedent from 'dedent'
import { and, eq } from 'drizzle-orm'
import { HTTPException } from 'hono/http-exception'
import { container, inject, injectable } from 'tsyringe'
import typia from 'typia'
import { v4 } from 'uuid'

import { DatabaseService } from '../helpers/database.js'
import { postgresCheckpointer } from '../helpers/langchain.js'
import * as schema from '../models/schema.js'
import { SpacesAnnotation } from '../services/space.service.js'
import { AgentActionsService } from './agent-actions.service.js'
import { SpaceMemberService } from './space-member.service.js'

@injectable()
export class SpaceActionsService {
  private routerLlm = new ChatOpenAI({
    model: 'gpt-5-nano',
    temperature: 1,
    // maxTokens: 20,
    apiKey: process.env.OPENAI_API_KEY,
  })

  constructor(
    @inject(DatabaseService) private $db: DatabaseService,
    @inject(SpaceMemberService) private $spaceMember: SpaceMemberService,
  ) {}

  async sendMessage(props: {
    spaceId: string
    senderId: string
    // senderType: 'agent' | 'human'
    // content: string
    message: BaseMessageLike
    // sessionId?: string // optional session ID for context
    // targetType?: 'broadcast' | 'direct' | 'group'
    // targetIds?: string[]
    // messageType?: string
    metadata?: any
  }) {
    const {
      spaceId,
      senderId,
      //   senderType,
      message,
      //   content,
      //   targetType = 'broadcast',
      //   targetIds,
      //   messageType = 'text',
      metadata,
    } = props

    try {
      if (senderId !== 'system') {
        const isMember = await this.$spaceMember.isSpaceMember(
          spaceId,
          senderId,
        )
        if (!isMember)
          throw new HTTPException(403, {
            message: 'Only space members can send messages',
          })
      }

      const member = await this.$db.query.spaceMember.findFirst({
        where: and(
          eq(schema.spaceMember.spaceId, spaceId),
          eq(schema.spaceMember.memberId, senderId),
          //   eq(schema.spaceMember.memberType, senderType),
        ),
      })

      if (!member || member.status !== 'active') {
        throw new HTTPException(403, {
          message: 'Only active space members can send messages',
        })
      }

      if (!member.permissions?.canWrite) {
        throw new HTTPException(403, {
          message: 'You do not have permission to send messages in this space',
        })
      }

      console.log(
        `Sending message in space ${spaceId} from ${member.memberType} ${senderId}`,
      )

      //   if (senderId !== 'system') {
      //   }

      //   const [message] = await this.$db
      //     .insert(schema.spaceMessage)
      //     .values({
      //       spaceId,
      //       senderId,
      //       senderType,
      //       content,
      //       targetType,
      //       targetIds,
      //       messageType,
      //       metadata,
      //     })
      //     .returning()

      //   if (senderId !== 'system') {
      // }
      const graph = new StateGraph(SpacesAnnotation)
        .addNode('router', this.routeMessageToAgent.bind(this))
        .addNode('agent', this.runAgent.bind(this))
        .addEdge(START, 'router')
        .addEdge('agent', 'router')
        .addConditionalEdges('router', this.shouldRunAgent.bind(this), [
          'agent',
          END,
        ])
        .compile({ checkpointer: postgresCheckpointer })

      const config = { configurable: { thread_id: spaceId } }

      //   const messagesWithIds = messages.map((_) => {
      //     // @ts-expect-error
      //     _.id ||= v4()
      //     // @ts-expect-error
      //     _.name ||= `user:${userId}`
      //     return _ as BaseMessageLike & { id: string; name: string }
      //   })

      //   const messagesMetadata = messagesWithIds.reduce((acc, curr) => {
      //     acc.set(curr.id, { userId, createdAt: new Date().toISOString() })
      //     return acc
      //   }, new Map())

      // @ts-expect-error
      message.id ||= v4()
      // @ts-expect-error
      message.name ||= `${member.memberType}:${senderId}`

      await graph.invoke(
        {
          messages: message,
          metadata: {
            messages: {
              // @ts-expect-error
              [message.id]: {
                memberId: member.memberId,
                memberType: member.memberType,
                createdAt: new Date().toISOString(),
                // ...metadata?.messages?.[message.id],
              },
            },
            spaceId,
          },
        },
        config,
      )

      await this.$db
        .update(schema.spaceMember)
        .set({ lastActiveAt: new Date() })
        .where(
          and(
            eq(schema.spaceMember.spaceId, spaceId),
            eq(schema.spaceMember.memberId, senderId),
            eq(schema.spaceMember.memberType, member.memberType),
          ),
        )

      //   const sessionIdToUse = metadata?.sessionId || props.sessionId
      //   console.log(`Session ID to use: when calling ${sessionIdToUse}`)
      //   if (sessionIdToUse) {
      //     const session = await this.$db.query.session.findFirst({
      //       where: eq(schema.session.sessionId, sessionIdToUse),
      //     })
      //     if (session) {
      //       console.log(`Adding space data to session ${sessionIdToUse}`)
      //       // Add the spaceId to the session
      //       const currentSpaces = session.spaces || {}
      //       console.log(
      //         `Current spaces in session: ${JSON.stringify(currentSpaces)}`,
      //       )

      //       const currentSpaceIds = (currentSpaces as any).spaceIds || []
      //       if (!currentSpaceIds.includes(spaceId)) {
      //         const updatedSpaces = {
      //           ...currentSpaces,
      //           spaceIds: [...currentSpaceIds, spaceId],
      //         }
      //         await this.$db
      //           .update(schema.session)
      //           .set({ spaces: updatedSpaces as any })
      //           .where(eq(schema.session.sessionId, sessionIdToUse))
      //       }
      //     }
      //   }
      // Trigger subsribed agents to run
      //   const currentTurn = metadata.turnCount ?? 0
      //   const maxTurnsParam = metadata.maxTurns ?? 1

      //   const subscribedAgents = await this.$db.query.spaceMember.findMany({
      //     where: and(
      //       eq(schema.spaceMember.spaceId, spaceId),
      //       eq(schema.spaceMember.memberType, 'agent'),
      //       eq(schema.spaceMember.isSubscribed, true),
      //     ),
      //   })

      // const triggerRunAgent = async (agentId: string) => {
      //   await lastValueFrom(
      //     this.agentService
      //       .runAgent({
      //         agentId,
      //         messages: [{ role: 'user', content }],
      //         spaceId,
      //         initiator: senderId,
      //         turnCount: currentTurn + 1,
      //         maxTurns: maxTurnsParam,
      //       })
      //       .pipe(filter((chunk) => chunk.type === 'final')),
      //   ).catch((err) =>
      //     console.error(
      //       `runAgent failed for agent ${agentId} in space ${spaceId}:`,
      //       err,
      //     ),
      //   );
      // };

      // if (targetType === 'broadcast') {
      //   for (const agent of subscribedAgents) {
      //     // avoid echoing back to the sender if the sender was an agent
      //     if (agent.memberId === senderId && senderType === 'agent') continue;
      //     await triggerRunAgent(agent.memberId);
      //   }
      // } else if (targetType === 'direct' && targetIds) {
      //   for (const id of targetIds) {
      //     const isSubscribed = subscribedAgents.some((a) => a.memberId === id);
      //     if (isSubscribed) await triggerRunAgent(id);
      //   }
      // }

      return message
    } catch (error) {
      console.error('Error in sendMessage:', error)
      throw error
    }
  }

  private async routeMessageToAgent(state: typeof SpacesAnnotation.State) {
    // Run the messages through nano
    // Have nano have a json output of which agent should handle the message
    // If it thinks no agent should, then nothing to run
    // So we could add all the messages in the actual state, change the system message though

    const $spaceMember = container.resolve(SpaceMemberService)

    const spaceMembers = await $spaceMember.getSpaceMembers({
      spaceId: state.metadata.spaceId,
    })

    // Assuming that spaces don't have system messages
    const message = await this.routerLlm
      .withStructuredOutput(
        typia.llm.parameters<{ agentId?: string }, 'chatgpt'>(),
      )
      .invoke([
        new SystemMessage({
          content: dedent`
				You are an agent in a space with the following members:
				${spaceMembers.map((member) => `- ${member.id} (${member.memberType})`).join('\n')}
	
				Your task is to determine which member should handle the latest message in the space.
				`,
        }),
        // Last 20 messages
        ...state.messages.slice(-20),
      ])

    // Might want to set name
    // message.name = `agent:nano`

    return { messages: message }
  }

  private async runAgent(state: typeof SpacesAnnotation.State) {
    // Get the agent and session for the agent the run the agent
    // @ts-expect-error
    const agentId = state.messages.at(-1)['agentId']

    // Get the session for the agent
    const sessionId = state.sessions[agentId]

    // Run the agent
    if (sessionId) {
      const $agentActions = container.resolve(AgentActionsService)
      const response = await $agentActions.runAgent({
        agentId,
        sessionId,
        messages: state.messages,
      })

      const lastMessage = response.state.messages.findLast(
        (_) => _ instanceof AIMessage,
      )

      lastMessage!.name ||= `agent:${agentId}`
      return {
        messages: lastMessage,
        sessions: { [agentId]: response.sessionId },
        metadata: {
          messages: {
            // @ts-expect-error
            [lastMessage!.id]: {
              agentId,
              createdAt: new Date().toISOString(),
              ...response.state.metadata.messages?.[lastMessage!.id!],
            },
          },
        },
      }
    }
  }

  private shouldRunAgent(state: typeof SpacesAnnotation.State) {
    // @ts-expect-error
    const agentId = state.messages.at(-1)['agentId']
    if (agentId) {
      return ['agent']
    }
    return END
  }
}

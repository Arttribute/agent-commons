import { typiaValidator } from '@hono/typia-validator'
import { Hono } from 'hono'
import { createFactory } from 'hono/factory'
import { HTTPException } from 'hono/http-exception'
import { container } from 'tsyringe'
import typia from 'typia'

import { SpaceService } from '../services/space.service.js'

const factory = createFactory()

const createSpace = factory.createHandlers(
  typiaValidator(
    'json',
    typia.createValidate<{
      name: string
      description?: string
      createdBy: string
      createdByType: 'agent' | 'human'
      sessionId?: string
      isPublic?: boolean
      maxMembers?: number
      settings?: any
    }>(),
  ),
  async (c) => {
    const body = c.req.valid('json')

    const $space = container.resolve(SpaceService)

    const space = await $space.createSpace(body)

    // Create a new space in the database or any other source
    return c.json(space)
  },
)

const getSpace = factory.createHandlers(
  typiaValidator('param', typia.createValidate<{ spaceId: string }>()),
  async (c) => {
    const spaceId = c.req.param('spaceId')
    if (!spaceId) {
      throw new HTTPException(400, { message: 'Missing spaceId' })
    }

    const $space = container.resolve(SpaceService)

    const space = await $space.getSpace({ id: spaceId })
    if (!space) {
      throw new HTTPException(404, { message: 'Space not found' })
    }
    return c.json(space)
  },
)

const getMessagesInSpace = factory.createHandlers(
  typiaValidator('param', typia.createValidate<{ spaceId: string }>()),
  async (c) => {
    const { spaceId } = c.req.valid('param')

    const $space = container.resolve(SpaceService)
    const messages = await $space.getMessagesInSpace({ spaceId })

    return c.json({ messages })
  },
)

export const app = new Hono()

app.post('/', ...createSpace)
app.get('/:spaceId', ...getSpace)
app.get('/:spaceId/messages', ...getMessagesInSpace)

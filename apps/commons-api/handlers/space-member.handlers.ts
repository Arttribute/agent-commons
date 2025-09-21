import { typiaValidator } from '@hono/typia-validator'
import { Hono } from 'hono'
import { createFactory } from 'hono/factory'
import { container } from 'tsyringe'
import typia from 'typia'

import { SpaceMemberService } from '../services/space-member.service.js'

const factory = createFactory()

const getMembersInSpace = factory.createHandlers(
  typiaValidator('param', typia.createValidate<{ spaceId: string }>()),
  async (c) => {
    const { spaceId } = c.req.valid('param')

    const $spaceMember = container.resolve(SpaceMemberService)
    const members = await $spaceMember.getSpaceMembers({ spaceId })

    return c.json({ members })
  },
)

const addMemberToSpace = factory.createHandlers(
  typiaValidator(
    'json',
    typia.createValidate<{ memberType: 'human' | 'agent'; memberId: string }>(),
  ),
  typiaValidator('param', typia.createValidate<{ spaceId: string }>()),
  async (c) => {
    const { spaceId } = c.req.valid('param')
    const body = c.req.valid('json')

    const $spaceMember = container.resolve(SpaceMemberService)

    const space = await $spaceMember.createSpaceMember({
      spaceId,
      memberType: body.memberType,
      memberId: body.memberId,
    })

    return c.json(space)
  },
)

export const app = new Hono()

// app.post('/', ...createSpace)
app.get('/:spaceId/members', ...getMembersInSpace)
app.post('/:spaceId/members', ...addMemberToSpace)

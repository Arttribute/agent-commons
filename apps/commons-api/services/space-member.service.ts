import { and, desc, eq, type InferInsertModel } from 'drizzle-orm'
import { HTTPException } from 'hono/http-exception'
import { inject, injectable } from 'tsyringe'

import { DatabaseService } from '../helpers/database.js'
import * as schema from '../models/schema.js'

@injectable()
export class SpaceMemberService {
  constructor(@inject(DatabaseService) private $db: DatabaseService) {}

  async createSpaceMember(props: {
    spaceId: string
    memberId: string
    memberType: 'agent' | 'human'
    role?: string
    permissions?: any
  }) {
    const {
      spaceId,
      memberId,
      memberType,
      role = 'member',
      permissions,
    } = props
    console.log(
      `Adding member ${memberId} of type ${memberType} to space ${spaceId}`,
    )
    const space = await this.$db.query.space.findFirst({
      where: eq(schema.space.spaceId, spaceId),
    })
    if (!space)
      throw new HTTPException(404, {
        message: `Space with ID ${spaceId} not found`,
      })

    const existing = await this.$db.query.spaceMember.findFirst({
      where: and(
        eq(schema.spaceMember.spaceId, spaceId),
        eq(schema.spaceMember.memberId, memberId),
        eq(schema.spaceMember.memberType, memberType),
      ),
    })
    if (existing)
      throw new HTTPException(400, {
        message: 'Member already exists in this space',
      })

    if (space.maxMembers) {
      const count = await this.$db.query.spaceMember.findMany({
        where: and(
          eq(schema.spaceMember.spaceId, spaceId),
          eq(schema.spaceMember.status, 'active'),
        ),
      })
      if (count.length >= space.maxMembers) {
        throw new HTTPException(400, {
          message: 'Space has reached maximum member capacity',
        })
      }
    }

    const [member] = await this.$db
      .insert(schema.spaceMember)
      .values({
        spaceId,
        memberId,
        memberType,
        role,
        permissions: permissions ?? {
          canWrite: true,
          canInvite: role === 'owner' || role === 'moderator',
          canModerate: role === 'owner' || role === 'moderator',
        },
      })
      .returning()

    return member
  }

  async getSpaceMembers(props: { spaceId: string }) {
    const { spaceId } = props
    const spaceMembers = await this.$db.query.spaceMember.findMany({
      where: eq(schema.spaceMember.spaceId, spaceId),
      orderBy: desc(schema.spaceMember.joinedAt),
    })
    return spaceMembers
  }

  async updateSpaceMember(
    spaceId: string,
    memberId: string,
    memberType: 'agent' | 'human',
    updates: Partial<InferInsertModel<typeof schema.spaceMember>>,
  ) {
    const [updatedMember] = await this.$db
      .update(schema.spaceMember)
      .set(updates)
      .where(
        and(
          eq(schema.spaceMember.spaceId, spaceId),
          eq(schema.spaceMember.memberId, memberId),
          eq(schema.spaceMember.memberType, memberType),
        ),
      )
      .returning()
    if (!updatedMember)
      throw new HTTPException(404, {
        message: 'Member not found in this space',
      })
    return updatedMember
  }

  async deleteSpaceMember(
    spaceId: string,
    memberId: string,
    memberType: 'agent' | 'human',
  ) {
    const deleted = await this.$db
      .delete(schema.spaceMember)
      .where(
        and(
          eq(schema.spaceMember.spaceId, spaceId),
          eq(schema.spaceMember.memberId, memberId),
          eq(schema.spaceMember.memberType, memberType),
        ),
      )
      .returning()
    if (!deleted.length)
      throw new HTTPException(404, {
        message: 'Member not found in this space',
      })
    return { success: true }
  }

  async isSpaceMember(
    spaceId: string,
    memberId: string,
    memberType?: 'agent' | 'human',
  ) {
    const member = await this.$db.query.spaceMember.findFirst({
      where: and(
        eq(schema.spaceMember.spaceId, spaceId),
        eq(schema.spaceMember.memberId, memberId),
        memberType ? eq(schema.spaceMember.memberType, memberType) : undefined, //reconsider haviing this...messages my fail if an agent in correctly adds a human as an ai agent
        eq(schema.spaceMember.status, 'active'),
      ),
    })
    console.log(
      `Checking membership for ${memberType} ${memberId} in space ${spaceId}:`,
      member ? 'Member found' : 'Member not found',
    )
    return !!member
  }
}

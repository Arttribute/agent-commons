// src/space/space.service.ts
import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { eq, InferInsertModel, desc, and, or } from 'drizzle-orm';
import { DatabaseService } from '~/modules/database/database.service';
import * as schema from '#/models/schema';

@Injectable()
export class SpaceService {
  constructor(private db: DatabaseService) {}

  /* ─────────────────────────  SPACE MANAGEMENT  ───────────────────────── */

  async createSpace(props: {
    name: string;
    description?: string;
    createdBy: string;
    createdByType: 'agent' | 'human';
    sessionId?: string;
    isPublic?: boolean;
    maxMembers?: number;
    settings?: any;
  }) {
    const { createdBy, createdByType, ...spaceData } = props;

    const [space] = await this.db
      .insert(schema.space)
      .values({
        ...spaceData,
        createdBy,
        createdByType,
        settings: props.settings ?? {
          allowAgents: true,
          allowHumans: true,
          requireApproval: false,
          moderators: [],
        },
      })
      .returning();

    await this.addMember({
      spaceId: space.spaceId,
      memberId: createdBy,
      memberType: createdByType,
      role: 'owner',
    });

    return space;
  }

  async getSpace(spaceId: string) {
    const space = await this.db.query.space.findFirst({
      where: eq(schema.space.spaceId, spaceId),
      with: {
        members: true,
        messages: {
          orderBy: desc(schema.spaceMessage.createdAt),
          limit: 50,
        },
      },
    });
    if (!space)
      throw new NotFoundException(`Space with ID ${spaceId} not found`);
    return space;
  }

  async getSpacesForMember(memberId: string, memberType: 'agent' | 'human') {
    const memberSpaces = await this.db.query.spaceMember.findMany({
      where: and(
        eq(schema.spaceMember.memberId, memberId),
        eq(schema.spaceMember.memberType, memberType),
        eq(schema.spaceMember.status, 'active'),
      ),
      with: {
        space: { with: { members: true } },
      },
    });
    return memberSpaces.map((m) => m.space);
  }

  async getPublicSpaces() {
    return this.db.query.space.findMany({
      where: eq(schema.space.isPublic, true),
      with: { members: true },
      orderBy: desc(schema.space.createdAt),
    });
  }

  async updateSpace(
    spaceId: string,
    updates: Partial<InferInsertModel<typeof schema.space>>,
  ) {
    const [updatedSpace] = await this.db
      .update(schema.space)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(schema.space.spaceId, spaceId))
      .returning();
    if (!updatedSpace)
      throw new NotFoundException(`Space with ID ${spaceId} not found`);
    return updatedSpace;
  }

  async deleteSpace(spaceId: string) {
    const deleted = await this.db
      .delete(schema.space)
      .where(eq(schema.space.spaceId, spaceId))
      .returning();
    if (!deleted.length)
      throw new NotFoundException(`Space with ID ${spaceId} not found`);
    return { success: true };
  }

  /* ─────────────────────────  MEMBER MANAGEMENT  ───────────────────────── */

  async addMember(props: {
    spaceId: string;
    memberId: string;
    memberType: 'agent' | 'human';
    role?: string;
    permissions?: any;
  }) {
    const {
      spaceId,
      memberId,
      memberType,
      role = 'member',
      permissions,
    } = props;

    const space = await this.db.query.space.findFirst({
      where: eq(schema.space.spaceId, spaceId),
    });
    if (!space)
      throw new NotFoundException(`Space with ID ${spaceId} not found`);

    const existing = await this.db.query.spaceMember.findFirst({
      where: and(
        eq(schema.spaceMember.spaceId, spaceId),
        eq(schema.spaceMember.memberId, memberId),
        eq(schema.spaceMember.memberType, memberType),
      ),
    });
    if (existing)
      throw new BadRequestException('Member already exists in this space');

    if (space.maxMembers) {
      const count = await this.db.query.spaceMember.findMany({
        where: and(
          eq(schema.spaceMember.spaceId, spaceId),
          eq(schema.spaceMember.status, 'active'),
        ),
      });
      if (count.length >= space.maxMembers) {
        throw new BadRequestException(
          'Space has reached maximum member capacity',
        );
      }
    }

    const [member] = await this.db
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
      .returning();

    return member;
  }

  async removeMember(
    spaceId: string,
    memberId: string,
    memberType: 'agent' | 'human',
  ) {
    const deleted = await this.db
      .delete(schema.spaceMember)
      .where(
        and(
          eq(schema.spaceMember.spaceId, spaceId),
          eq(schema.spaceMember.memberId, memberId),
          eq(schema.spaceMember.memberType, memberType),
        ),
      )
      .returning();
    if (!deleted.length)
      throw new NotFoundException('Member not found in this space');
    return { success: true };
  }

  async updateMember(
    spaceId: string,
    memberId: string,
    memberType: 'agent' | 'human',
    updates: Partial<InferInsertModel<typeof schema.spaceMember>>,
  ) {
    const [updatedMember] = await this.db
      .update(schema.spaceMember)
      .set(updates)
      .where(
        and(
          eq(schema.spaceMember.spaceId, spaceId),
          eq(schema.spaceMember.memberId, memberId),
          eq(schema.spaceMember.memberType, memberType),
        ),
      )
      .returning();
    if (!updatedMember)
      throw new NotFoundException('Member not found in this space');
    return updatedMember;
  }

  async getSpaceMembers(spaceId: string) {
    return this.db.query.spaceMember.findMany({
      where: eq(schema.spaceMember.spaceId, spaceId),
      orderBy: desc(schema.spaceMember.joinedAt),
    });
  }

  async isMember(
    spaceId: string,
    memberId: string,
    memberType: 'agent' | 'human',
  ) {
    const member = await this.db.query.spaceMember.findFirst({
      where: and(
        eq(schema.spaceMember.spaceId, spaceId),
        eq(schema.spaceMember.memberId, memberId),
        eq(schema.spaceMember.memberType, memberType),
        eq(schema.spaceMember.status, 'active'),
      ),
    });
    return !!member;
  }

  /* ─────────────────────────  MESSAGE MANAGEMENT  ───────────────────────── */

  async sendMessage(props: {
    spaceId: string;
    senderId: string;
    senderType: 'agent' | 'human';
    content: string;
    targetType?: 'broadcast' | 'direct' | 'group';
    targetIds?: string[];
    messageType?: string;
    metadata?: any;
  }) {
    const {
      spaceId,
      senderId,
      senderType,
      content,
      targetType = 'broadcast',
      targetIds,
      messageType = 'text',
      metadata,
    } = props;

    if (senderId !== 'system') {
      const isMember = await this.isMember(spaceId, senderId, senderType);
      if (!isMember)
        throw new BadRequestException('Only space members can send messages');
    }

    if (senderId !== 'system') {
      const member = await this.db.query.spaceMember.findFirst({
        where: and(
          eq(schema.spaceMember.spaceId, spaceId),
          eq(schema.spaceMember.memberId, senderId),
          eq(schema.spaceMember.memberType, senderType),
        ),
      });
      if (!member?.permissions?.canWrite) {
        throw new BadRequestException(
          'You do not have permission to send messages in this space',
        );
      }
    }

    const [message] = await this.db
      .insert(schema.spaceMessage)
      .values({
        spaceId,
        senderId,
        senderType,
        content,
        targetType,
        targetIds,
        messageType,
        metadata,
      })
      .returning();

    if (senderId !== 'system') {
      await this.db
        .update(schema.spaceMember)
        .set({ lastActiveAt: new Date() })
        .where(
          and(
            eq(schema.spaceMember.spaceId, spaceId),
            eq(schema.spaceMember.memberId, senderId),
            eq(schema.spaceMember.memberType, senderType),
          ),
        );
    }

    const sessionIdToUse = metadata?.sessionId;
    if (sessionIdToUse) {
      const session = await this.db.query.session.findFirst({
        where: eq(schema.session.sessionId, sessionIdToUse),
      });
      if (session) {
        const currentSpaces = session.spaces || {};
        const currentSpaceIds = (currentSpaces as any).spaceIds || [];
        if (!currentSpaceIds.includes(spaceId)) {
          const updatedSpaces = {
            ...currentSpaces,
            spaceIds: [...currentSpaceIds, spaceId],
          };
          await this.db
            .update(schema.session)
            .set({ spaces: updatedSpaces as any })
            .where(eq(schema.session.sessionId, sessionIdToUse));
        }
      }
    }

    return message;
  }

  async getMessages(spaceId: string, limit = 50, offset = 0) {
    return this.db.query.spaceMessage.findMany({
      where: and(
        eq(schema.spaceMessage.spaceId, spaceId),
        eq(schema.spaceMessage.isDeleted, false),
      ),
      orderBy: desc(schema.spaceMessage.createdAt),
      limit,
      offset,
    });
  }

  async getMessagesForMember(
    spaceId: string,
    memberId: string,
    limit = 50,
    offset = 0,
  ) {
    return this.db.query.spaceMessage.findMany({
      where: and(
        eq(schema.spaceMessage.spaceId, spaceId),
        eq(schema.spaceMessage.isDeleted, false),
        or(
          eq(schema.spaceMessage.targetType, 'broadcast'),
          and(
            eq(schema.spaceMessage.targetType, 'direct'),
            or(
              eq(schema.spaceMessage.senderId, memberId),
              // For production, prefer JSONB operators
              eq(schema.spaceMessage.targetIds, [memberId] as any),
            ),
          ),
        ),
      ),
      orderBy: desc(schema.spaceMessage.createdAt),
      limit,
      offset,
    });
  }

  async updateMessage(
    messageId: string,
    updates: Partial<InferInsertModel<typeof schema.spaceMessage>>,
  ) {
    const [updatedMessage] = await this.db
      .update(schema.spaceMessage)
      .set({ ...updates, updatedAt: new Date(), isEdited: true })
      .where(eq(schema.spaceMessage.messageId, messageId))
      .returning();
    if (!updatedMessage)
      throw new NotFoundException(`Message with ID ${messageId} not found`);
    return updatedMessage;
  }

  async deleteMessage(messageId: string) {
    const [deletedMessage] = await this.db
      .update(schema.spaceMessage)
      .set({ isDeleted: true, updatedAt: new Date() })
      .where(eq(schema.spaceMessage.messageId, messageId))
      .returning();
    if (!deletedMessage)
      throw new NotFoundException(`Message with ID ${messageId} not found`);
    return { success: true };
  }

  async getFullSpaceData(spaceId: string) {
    const space = await this.db.query.space.findFirst({
      where: eq(schema.space.spaceId, spaceId),
    });
    if (!space)
      throw new NotFoundException(`Space with ID ${spaceId} not found`);

    const members = await this.db.query.spaceMember.findMany({
      where: eq(schema.spaceMember.spaceId, spaceId),
      orderBy: desc(schema.spaceMember.joinedAt),
    });

    const messages = await this.db.query.spaceMessage.findMany({
      where: eq(schema.spaceMessage.spaceId, spaceId),
      orderBy: desc(schema.spaceMessage.createdAt),
    });

    return { ...space, members, messages };
  }
}

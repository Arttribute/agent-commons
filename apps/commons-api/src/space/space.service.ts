import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import {
  eq,
  InferInsertModel,
  InferSelectModel,
  desc,
  and,
  or,
  inArray,
} from 'drizzle-orm';
import { DatabaseService } from '~/modules/database/database.service';
import * as schema from '#/models/schema';

@Injectable()
export class SpaceService {
  constructor(private db: DatabaseService) {}

  /* ─────────────────────────  SPACE MANAGEMENT  ───────────────────────── */

  /**
   * Create a new space
   */
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
        settings: props.settings || {
          allowAgents: true,
          allowHumans: true,
          requireApproval: false,
          moderators: [],
        },
      })
      .returning();

    // Add creator as owner
    await this.addMember({
      spaceId: space.spaceId,
      memberId: createdBy,
      memberType: createdByType,
      role: 'owner',
    });

    return space;
  }

  /**
   * Get space by ID with members and recent messages
   */
  async getSpace(spaceId: string) {
    const space = await this.db.query.space.findFirst({
      where: eq(schema.space.spaceId, spaceId),
      with: {
        members: true,
        messages: {
          limit: 50,
          orderBy: desc(schema.spaceMessage.createdAt),
        },
      },
    });

    if (!space) {
      throw new NotFoundException(`Space with ID ${spaceId} not found`);
    }

    return space;
  }

  /**
   * Get spaces where a member is participating
   */
  async getSpacesForMember(memberId: string, memberType: 'agent' | 'human') {
    const memberSpaces = await this.db.query.spaceMember.findMany({
      where: and(
        eq(schema.spaceMember.memberId, memberId),
        eq(schema.spaceMember.memberType, memberType),
        eq(schema.spaceMember.status, 'active'),
      ),
      with: {
        space: {
          with: {
            members: true,
          },
        },
      },
    });

    return memberSpaces.map((m) => m.space);
  }

  /**
   * Get public spaces
   */
  async getPublicSpaces() {
    return this.db.query.space.findMany({
      where: eq(schema.space.isPublic, true),
      with: {
        members: true,
      },
      orderBy: desc(schema.space.createdAt),
    });
  }

  /**
   * Update space settings
   */
  async updateSpace(
    spaceId: string,
    updates: Partial<InferInsertModel<typeof schema.space>>,
  ) {
    const [updatedSpace] = await this.db
      .update(schema.space)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(schema.space.spaceId, spaceId))
      .returning();

    if (!updatedSpace) {
      throw new NotFoundException(`Space with ID ${spaceId} not found`);
    }

    return updatedSpace;
  }

  /**
   * Delete space
   */
  async deleteSpace(spaceId: string) {
    const deleted = await this.db
      .delete(schema.space)
      .where(eq(schema.space.spaceId, spaceId))
      .returning();

    if (!deleted.length) {
      throw new NotFoundException(`Space with ID ${spaceId} not found`);
    }

    return { success: true };
  }

  /* ─────────────────────────  MEMBER MANAGEMENT  ───────────────────────── */

  /**
   * Add member to space
   */
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

    // Check if space exists
    const space = await this.db.query.space.findFirst({
      where: eq(schema.space.spaceId, spaceId),
    });

    if (!space) {
      throw new NotFoundException(`Space with ID ${spaceId} not found`);
    }

    // Check if member already exists
    const existingMember = await this.db.query.spaceMember.findFirst({
      where: and(
        eq(schema.spaceMember.spaceId, spaceId),
        eq(schema.spaceMember.memberId, memberId),
        eq(schema.spaceMember.memberType, memberType),
      ),
    });

    if (existingMember) {
      throw new BadRequestException('Member already exists in this space');
    }

    // Check space capacity
    if (space.maxMembers) {
      const memberCount = await this.db.query.spaceMember.findMany({
        where: and(
          eq(schema.spaceMember.spaceId, spaceId),
          eq(schema.spaceMember.status, 'active'),
        ),
      });

      if (memberCount.length >= space.maxMembers) {
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
        permissions: permissions || {
          canWrite: true,
          canInvite: role === 'owner' || role === 'moderator',
          canModerate: role === 'owner' || role === 'moderator',
        },
      })
      .returning();

    return member;
  }

  /**
   * Remove member from space
   */
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

    if (!deleted.length) {
      throw new NotFoundException('Member not found in this space');
    }

    return { success: true };
  }

  /**
   * Update member role or permissions
   */
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

    if (!updatedMember) {
      throw new NotFoundException('Member not found in this space');
    }

    return updatedMember;
  }

  /**
   * Get space members
   */
  async getSpaceMembers(spaceId: string) {
    return this.db.query.spaceMember.findMany({
      where: eq(schema.spaceMember.spaceId, spaceId),
      orderBy: desc(schema.spaceMember.joinedAt),
    });
  }

  /**
   * Check if member exists in space
   */
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

  /**
   * Send message to space
   */
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

    // Check if sender is a member (skip for system messages)
    if (senderId !== 'system') {
      const isMember = await this.isMember(spaceId, senderId, senderType);
      if (!isMember) {
        throw new BadRequestException('Only space members can send messages');
      }
    }

    // Check if sender has write permissions (skip for system messages)
    let member = null;
    if (senderId !== 'system') {
      member = await this.db.query.spaceMember.findFirst({
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

    // Update member's last active time
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

    return message;
  }

  /**
   * Get messages from space
   */
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

  /**
   * Get messages for a specific member (including direct messages)
   */
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
            // Check if member is in targetIds or is the sender
            or(
              eq(schema.spaceMessage.senderId, memberId),
              // Note: This is a simplified check - in production you'd want to use jsonb operators
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

  /**
   * Update message
   */
  async updateMessage(
    messageId: string,
    updates: Partial<InferInsertModel<typeof schema.spaceMessage>>,
  ) {
    const [updatedMessage] = await this.db
      .update(schema.spaceMessage)
      .set({ ...updates, updatedAt: new Date(), isEdited: true })
      .where(eq(schema.spaceMessage.messageId, messageId))
      .returning();

    if (!updatedMessage) {
      throw new NotFoundException(`Message with ID ${messageId} not found`);
    }

    return updatedMessage;
  }

  /**
   * Delete message
   */
  async deleteMessage(messageId: string) {
    const [deletedMessage] = await this.db
      .update(schema.spaceMessage)
      .set({ isDeleted: true, updatedAt: new Date() })
      .where(eq(schema.spaceMessage.messageId, messageId))
      .returning();

    if (!deletedMessage) {
      throw new NotFoundException(`Message with ID ${messageId} not found`);
    }

    return { success: true };
  }
}

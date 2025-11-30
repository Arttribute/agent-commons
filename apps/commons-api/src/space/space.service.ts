// src/space/space.service.ts
import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { EventEmitter } from 'events';
import { eq, InferInsertModel, desc, and, or, inArray } from 'drizzle-orm';
import { DatabaseService } from '~/modules/database/database.service';
import { AgentService } from '~/agent/agent.service';
import * as schema from '#/models/schema';
@Injectable()
export class SpaceService {
  constructor(
    private db: DatabaseService,
    @Inject(forwardRef(() => AgentService))
    private agentService: AgentService,
    private readonly emitter: EventEmitter,
  ) {}

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

  /**
   * Generic space query with lightweight filtering for list views.
   * Supports filtering by:
   *  - memberId/memberType (spaces a given member belongs to)
   *  - agentIds (any of the agentIds is a member)
   *  - publicOnly (only public spaces)
   *  - search (partial case-insensitive match on name or description)
   *  - paging (limit/offset)
   *  - includeMembers (attach members array when true)
   */
  async querySpaces(filters: {
    memberId?: string;
    memberType?: 'agent' | 'human';
    agentIds?: string[]; // any of these agents is a member
    publicOnly?: boolean;
    search?: string;
    limit?: number;
    offset?: number;
    includeMembers?: boolean;
  }) {
    const {
      memberId,
      memberType,
      agentIds,
      publicOnly,
      search,
      limit = 25,
      offset = 0,
      includeMembers = false,
    } = filters;

    // Build dynamic where clauses manually using drizzle since we already have simple helpers imported.
    const whereClauses: any[] = [];
    if (publicOnly) whereClauses.push(eq(schema.space.isPublic, true));

    // We'll fetch candidate spaceIds first if member-related filters are supplied to keep main query simple.
    let candidateSpaceIds: string[] | null = null;
    if (memberId && memberType) {
      const rows = await this.db.query.spaceMember.findMany({
        where: and(
          eq(schema.spaceMember.memberId, memberId),
          eq(schema.spaceMember.memberType, memberType),
          eq(schema.spaceMember.status, 'active'),
        ),
      });
      candidateSpaceIds = rows.map((r) => r.spaceId);
    }
    if (agentIds && agentIds.length) {
      // DB-side filter for agent memberships
      const rows = await this.db.query.spaceMember.findMany({
        where: and(
          eq(schema.spaceMember.memberType, 'agent'),
          eq(schema.spaceMember.status, 'active'),
          inArray(schema.spaceMember.memberId, agentIds),
        ),
      });
      const agentSpaceIds = rows.map((r) => r.spaceId);
      candidateSpaceIds = candidateSpaceIds
        ? candidateSpaceIds.filter((id) => agentSpaceIds.includes(id))
        : agentSpaceIds;
    }

    if (candidateSpaceIds) {
      if (!candidateSpaceIds.length) return []; // early exit
      // Simple post-filter: We'll fetch then filter since again we avoid pulling in extra helpers.
    }

    // Build base where conditions for main space query
    const spaceWhere: any[] = [];
    if (publicOnly) spaceWhere.push(eq(schema.space.isPublic, true));
    if (candidateSpaceIds) {
      if (!candidateSpaceIds.length)
        return { data: [], total: 0, limit, offset };
      spaceWhere.push(inArray(schema.space.spaceId, candidateSpaceIds));
    }

    let spaces = await this.db.query.space.findMany({
      where: spaceWhere.length
        ? spaceWhere.length === 1
          ? spaceWhere[0]
          : and(...spaceWhere)
        : undefined,
      with: includeMembers ? { members: true } : undefined,
      orderBy: desc(schema.space.createdAt),
    });

    if (search) {
      const q = search.toLowerCase();
      spaces = spaces.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          (s.description || '').toLowerCase().includes(q),
      );
    }

    const total = spaces.length;
    const paged = spaces.slice(offset, offset + limit);
    return { data: paged, total, limit, offset }; // uniform response shape
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
    console.log(
      `Adding member ${memberId} of type ${memberType} to space ${spaceId}`,
    );
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
        eq(schema.spaceMember.memberType, memberType), //reconsider haviing this...messages my fail if an agent in correctly adds a human as an ai agent
        eq(schema.spaceMember.status, 'active'),
      ),
    });
    console.log(
      `Checking membership for ${memberType} ${memberId} in space ${spaceId}:`,
      member ? 'Member found' : 'Member not found',
    );
    return !!member;
  }

  /* ─────────────────────────  MESSAGE MANAGEMENT  ───────────────────────── */

  async sendMessage(props: {
    spaceId: string;
    senderId: string;
    senderType: 'agent' | 'human';
    content: string;
    sessionId?: string; // optional session ID for context
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

    try {
      console.log(
        `Sending message in space ${spaceId} from ${senderType} ${senderId}`,
      );
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

      // Emit real-time event for new message
      try {
        this.emitter.emit('space.message.created', {
          spaceId,
          message,
        });
      } catch {}

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

      const sessionIdToUse = metadata?.sessionId || props.sessionId;
      console.log(`Session ID to use: when calling ${sessionIdToUse}`);
      if (sessionIdToUse) {
        const session = await this.db.query.session.findFirst({
          where: eq(schema.session.sessionId, sessionIdToUse),
        });
        if (session) {
          console.log(`Adding space data to session ${sessionIdToUse}`);
          // Add the spaceId to the session
          const currentSpaces = session.spaces || {};
          console.log(
            `Current spaces in session: ${JSON.stringify(currentSpaces)}`,
          );

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
    } catch (error) {
      console.error('Error in sendMessage:', error);
      throw error;
    }
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

    // Emit real-time event for message update
    try {
      this.emitter.emit('space.message.updated', {
        spaceId: updatedMessage.spaceId,
        message: updatedMessage,
      });
    } catch {}
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
    // Emit real-time event for message deletion
    try {
      this.emitter.emit('space.message.deleted', {
        spaceId: deletedMessage.spaceId,
        message: deletedMessage,
      });
    } catch {}
    return { success: true };
  }

  //subscribe an agent to a space
  async subscribeAgentToSpace(agentId: string, spaceId: string) {
    const agent = await this.db.query.agent.findFirst({
      where: eq(schema.agent.agentId, agentId),
    });
    if (!agent) {
      throw new NotFoundException(`Agent with ID ${agentId} not found`);
    }
    const space = await this.db.query.space.findFirst({
      where: eq(schema.space.spaceId, spaceId),
    });
    if (!space) {
      throw new NotFoundException(`Space with ID ${spaceId} not found`);
    }
    const [updatedMember] = await this.db
      .update(schema.spaceMember)
      .set({ isSubscribed: true })
      .where(
        and(
          eq(schema.spaceMember.spaceId, spaceId),
          eq(schema.spaceMember.memberId, agentId),
          eq(schema.spaceMember.memberType, 'agent'),
        ),
      )
      .returning();

    if (!updatedMember) {
      throw new NotFoundException(
        `Agent with ID ${agentId} is not a member of space ${spaceId}`,
      );
    }
    console.log(`Agent ${agentId} subscribed to space ${spaceId}`);
    return updatedMember;
  }

  //unsubscribe an agent from a space
  async unsubscribeAgentFromSpace(agentId: string, spaceId: string) {
    console.log(`Unsubscribing agent ${agentId} from space ${spaceId}`);
    // Check if
    const agent = await this.db.query.agent.findFirst({
      where: eq(schema.agent.agentId, agentId),
    });
    if (!agent) {
      console.log(`Agent ${agentId} not found`);
      throw new NotFoundException(`Agent with ID ${agentId} not found`);
    }
    const space = await this.db.query.space.findFirst({
      where: eq(schema.space.spaceId, spaceId),
    });
    if (!space) {
      console.log(`Space ${spaceId} not found`);
      throw new NotFoundException(`Space with ID ${spaceId} not found`);
    }
    const [updatedMember] = await this.db
      .update(schema.spaceMember)
      .set({ isSubscribed: false })
      .where(
        and(
          eq(schema.spaceMember.spaceId, spaceId),
          eq(schema.spaceMember.memberId, agentId),
        ),
      )
      .returning();
    if (!updatedMember) {
      console.log(
        `Agent ${agentId} is not a member of space ${spaceId}, cannot unsubscribe`,
      );
      throw new NotFoundException(
        `Agent with ID ${agentId} is not a member of space ${spaceId}`,
      );
    }
    console.log(`Agent ${agentId} unsubscribed from space ${spaceId}`);

    return updatedMember;
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
      orderBy: schema.spaceMessage.createdAt,
    });

    return { ...space, members, messages };
  }
}

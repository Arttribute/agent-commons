import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  Headers,
  BadRequestException,
  Sse,
} from '@nestjs/common';
import { SpaceService } from './space.service';
import { SpaceBusService } from './space-bus.service';
import { TypedBody } from '@nestia/core';
import { AddMemberDto, CreateSpaceDto, SendMessageDto } from './dto/space.dto';
import { Observable, from, merge } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';

// Utility to convert Observable to AsyncIterable
function observableToAsyncIterable<T>(
  observable: Observable<T>,
): AsyncIterable<T> {
  const iterator = {
    next: () =>
      new Promise<{ value: T; done: boolean }>((resolve, reject) => {
        const subscription = observable.subscribe({
          next(value) {
            resolve({ value, done: false });
            subscription.unsubscribe();
          },
          error(err) {
            reject(err);
          },
          complete() {
            resolve({ value: undefined as any, done: true });
          },
        });
      }),
    [Symbol.asyncIterator]() {
      return this;
    },
  };
  return iterator as AsyncIterable<T>;
}

@Controller({ version: '1', path: 'spaces' })
export class SpaceController {
  constructor(
    private readonly spaceService: SpaceService,
    private readonly spaceBusService: SpaceBusService,
  ) {}

  /* ─────────────────────────  SPACE MANAGEMENT  ───────────────────────── */

  /**
   * Create a new space
   */
  @Post()
  async createSpace(
    @TypedBody() body: CreateSpaceDto,
    @Headers('x-creator-id') creatorId: string,
    @Headers('x-creator-type') creatorType: 'agent' | 'human',
  ) {
    if (!creatorId || !creatorType) {
      throw new BadRequestException('Creator ID and type are required');
    }

    const space = await this.spaceService.createSpace({
      ...body,
      createdBy: creatorId,
      createdByType: creatorType,
    });

    return { data: space };
  }

  /**
   * Get space by ID
   */
  @Get(':spaceId')
  async getSpace(@Param('spaceId') spaceId: string) {
    const space = await this.spaceService.getSpace(spaceId);
    return { data: space };
  }

  /**
   * Get spaces for a member
   */
  @Get('member/:memberId')
  async getSpacesForMember(
    @Param('memberId') memberId: string,
    @Query('memberType') memberType: 'agent' | 'human',
  ) {
    if (!memberType) {
      throw new BadRequestException('Member type is required');
    }

    const spaces = await this.spaceService.getSpacesForMember(
      memberId,
      memberType,
    );
    return { data: spaces };
  }

  /**
   * Get public spaces
   */
  @Get('public')
  async getPublicSpaces() {
    const spaces = await this.spaceService.getPublicSpaces();
    return { data: spaces };
  }

  /**
   * Update space
   */
  @Put(':spaceId')
  async updateSpace(
    @Param('spaceId') spaceId: string,
    @TypedBody() body: Partial<CreateSpaceDto>,
  ) {
    const space = await this.spaceService.updateSpace(spaceId, body);
    return { data: space };
  }

  /**
   * Delete space
   */
  @Delete(':spaceId')
  async deleteSpace(@Param('spaceId') spaceId: string) {
    const result = await this.spaceService.deleteSpace(spaceId);
    return result;
  }

  /* ─────────────────────────  MEMBER MANAGEMENT  ───────────────────────── */

  /**
   * Add member to space
   */
  @Post(':spaceId/members')
  async addMember(
    @Param('spaceId') spaceId: string,
    @TypedBody() body: AddMemberDto,
  ) {
    const member = await this.spaceService.addMember({
      spaceId,
      ...body,
    });
    return { data: member };
  }

  /**
   * Remove member from space
   */
  @Delete(':spaceId/members/:memberId')
  async removeMember(
    @Param('spaceId') spaceId: string,
    @Param('memberId') memberId: string,
    @Query('memberType') memberType: 'agent' | 'human',
  ) {
    if (!memberType) {
      throw new BadRequestException('Member type is required');
    }

    const result = await this.spaceService.removeMember(
      spaceId,
      memberId,
      memberType,
    );
    return result;
  }

  /**
   * Update member role or permissions
   */
  @Put(':spaceId/members/:memberId')
  async updateMember(
    @Param('spaceId') spaceId: string,
    @Param('memberId') memberId: string,
    @Query('memberType') memberType: 'agent' | 'human',
    @TypedBody() body: { role?: string; permissions?: any; status?: string },
  ) {
    if (!memberType) {
      throw new BadRequestException('Member type is required');
    }

    const member = await this.spaceService.updateMember(
      spaceId,
      memberId,
      memberType,
      body,
    );
    return { data: member };
  }

  /**
   * Get space members
   */
  @Get(':spaceId/members')
  async getSpaceMembers(@Param('spaceId') spaceId: string) {
    const members = await this.spaceService.getSpaceMembers(spaceId);
    return { data: members };
  }

  /* ─────────────────────────  MESSAGE MANAGEMENT  ───────────────────────── */

  /**
   * Send message to space
   */
  @Post(':spaceId/messages')
  async sendMessage(
    @Param('spaceId') spaceId: string,
    @TypedBody() body: SendMessageDto,
    @Headers('x-sender-id') senderId: string,
    @Headers('x-sender-type') senderType: 'agent' | 'human',
  ) {
    if (!senderId || !senderType) {
      throw new BadRequestException('Sender ID and type are required');
    }

    const message = await this.spaceService.sendMessage({
      spaceId,
      senderId,
      senderType,
      ...body,
    });

    return { data: message };
  }

  /**
   * Get messages from space
   */
  @Get(':spaceId/messages')
  async getMessages(
    @Param('spaceId') spaceId: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('memberId') memberId?: string,
  ) {
    const limitNum = limit ? parseInt(limit) : 50;
    const offsetNum = offset ? parseInt(offset) : 0;

    let messages;
    if (memberId) {
      messages = await this.spaceService.getMessagesForMember(
        spaceId,
        memberId,
        limitNum,
        offsetNum,
      );
    } else {
      messages = await this.spaceService.getMessages(
        spaceId,
        limitNum,
        offsetNum,
      );
    }

    return { data: messages };
  }

  /**
   * Update message
   */
  @Put(':spaceId/messages/:messageId')
  async updateMessage(
    @Param('spaceId') spaceId: string,
    @Param('messageId') messageId: string,
    @TypedBody() body: { content?: string; metadata?: any },
  ) {
    const message = await this.spaceService.updateMessage(messageId, body);
    return { data: message };
  }

  /**
   * Delete message
   */
  @Delete(':spaceId/messages/:messageId')
  async deleteMessage(
    @Param('spaceId') spaceId: string,
    @Param('messageId') messageId: string,
  ) {
    const result = await this.spaceService.deleteMessage(messageId);
    return result;
  }

  /* ─────────────────────────  COLLABORATION  ───────────────────────── */

  /**
   * Run agents in shared space with streaming
   */
  @Post(':spaceId/run/stream')
  @Sse(':spaceId/run/stream')
  runAgentsStreamingCollaboration(
    @Param('spaceId') spaceId: string,
    @Body()
    props: {
      agentIds: string[];
      initialMessage: string;
      spaceName?: string;
    },
  ) {
    return from(
      this.spaceBusService.runAgentsInSharedSpace({
        ...props,
        spaceId,
        stream: true,
      }),
    ).pipe(
      switchMap((result) => {
        return merge(...(result.sessions || [])).pipe(
          map((data) => ({ data })),
        );
      }),
    );
  }

  /**
   * Run agents in shared space (non-streaming)
   */
  @Post(':spaceId/run')
  async runAgentsCollaboration(
    @Param('spaceId') spaceId: string,
    @Body()
    props: {
      agentIds: string[];
      initialMessage: string;
      spaceName?: string;
      enableCollaborationSummary?: boolean;
      timeoutMs?: number;
    },
  ) {
    return this.spaceBusService.runAgentsInSharedSpace({
      ...props,
      spaceId,
      stream: false,
    });
  }
}

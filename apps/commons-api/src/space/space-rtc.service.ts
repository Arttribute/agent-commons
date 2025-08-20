// apps/commons-api/src/space/space-rtc.service.ts
import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { WebSocket } from 'ws';
import { eq, and } from 'drizzle-orm';
import { EventEmitter } from 'events';

import { DatabaseService } from '~/modules/database/database.service';
import * as schema from '#/models/schema';
import { SpaceService } from '~/space/space.service';

type Role = 'human' | 'agent';

export interface ClientCtx {
  client: WebSocket;
  spaceId: string;
  participantId: string;
  role: Role;
  publish: { audio: boolean; video: boolean };
  screenSharing?: boolean;
  urlSharing?: { active: boolean; url?: string; sessionId?: string };
}

export interface StreamInfo {
  participantId: string;
  role: Role;
  streamType: 'camera' | 'screen' | 'url';
  isActive: boolean;
  publish?: { audio: boolean; video: boolean };
  url?: string;
  sessionId?: string;
}
@Injectable()
export class SpaceRTCService extends EventEmitter {
  private readonly logger = new Logger(SpaceRTCService.name);
  /** in-memory registry: spaceId -> Map(participantId -> ctx) */
  private spaces = new Map<string, Map<string, ClientCtx>>();
  /** Track active streams per space */
  private spaceStreams = new Map<string, Map<string, StreamInfo[]>>();

  constructor(
    private readonly db: DatabaseService,
    private readonly spaceService: SpaceService,
  ) {
    super();
  }

  /* ─────────────────────────────────────────────────────────
   *  PUBLIC API
   * ───────────────────────────────────────────────────────── */

  /**
   * Pure in-memory registration (no DB checks).
   * Keep for compatibility—use `registerClientDb` when you want auth/membership.
   */
  registerClient(ctx: Omit<ClientCtx, 'publish'>) {
    this.ensureSpaceMap(ctx.spaceId);
    const peers = this.spaces.get(ctx.spaceId)!;

    // If the participant re-joins, close the old socket
    const existing = peers.get(ctx.participantId);
    if (existing && existing.client !== ctx.client) {
      try {
        existing.client.close();
      } catch {}
    }

    peers.set(ctx.participantId, {
      ...ctx,
      publish: { audio: false, video: false },
      screenSharing: false,
      urlSharing: { active: false },
    });

    this.logger.log(
      `Registered client ${ctx.participantId} in space ${ctx.spaceId} [${ctx.role}] (no DB)`,
    );

    // Initialize stream tracking for this participant
    this.initializeParticipantStreams(ctx.spaceId, ctx.participantId, ctx.role);
  }

  /**
   * DB-aware registration with the same updates as above
   */
  async registerClientDb(
    ctx: Omit<ClientCtx, 'publish'>,
    opts?: { autoEnrollPublic?: boolean },
  ) {
    const { spaceId, participantId, role } = ctx;
    const autoEnrollPublic = opts?.autoEnrollPublic ?? true;

    // 1) Space exists?
    const space = await this.db.query.space.findFirst({
      where: eq(schema.space.spaceId, spaceId),
    });
    if (!space) {
      throw new NotFoundException(`Space with ID ${spaceId} not found`);
    }

    // 2) Membership check
    const isMember = await this.isMember(spaceId, participantId, role);
    if (!isMember) {
      // If public and role allowed in settings, auto-enroll
      if (autoEnrollPublic && space.isPublic) {
        const allowAgents = space.settings?.allowAgents ?? true;
        const allowHumans = space.settings?.allowHumans ?? true;
        const allowed =
          (role === 'agent' && allowAgents) ||
          (role === 'human' && allowHumans);

        if (!allowed) {
          throw new BadRequestException(
            `Space ${spaceId} does not allow ${role} to join`,
          );
        }

        await this.spaceService.addMember({
          spaceId,
          memberId: participantId,
          memberType: role,
          role: 'member',
        });
        this.logger.log(
          `Auto-enrolled ${participantId} (${role}) into public space ${spaceId}`,
        );
      } else {
        throw new BadRequestException(
          `Only members can join space ${spaceId}. Not a member: ${participantId} (${role})`,
        );
      }
    }

    // 3) Update lastActiveAt (non-fatal if fails)
    await this.touchLastActive(spaceId, participantId, role).catch((e) =>
      this.logger.warn(`touchLastActive failed: ${String(e)}`),
    );

    // 4) Register in-memory
    this.ensureSpaceMap(spaceId);
    const peers = this.spaces.get(spaceId)!;

    const existing = peers.get(participantId);
    if (existing && existing.client !== ctx.client) {
      try {
        existing.client.close();
      } catch {}
    }
    peers.set(participantId, {
      ...ctx,
      publish: { audio: false, video: false },
      screenSharing: false,
      urlSharing: { active: false },
    });

    this.logger.log(
      `Registered client ${participantId} in space ${spaceId} [${role}] with DB auth`,
    );

    // Initialize stream tracking for this participant
    this.initializeParticipantStreams(spaceId, participantId, role);
  }

  /**
   * Remove a client by WebSocket handle.
   */
  async unregisterClient(client: WebSocket): Promise<ClientCtx | null> {
    for (const [spaceId, peers] of this.spaces.entries()) {
      for (const [pid, ctx] of peers.entries()) {
        if (ctx.client === client) {
          peers.delete(pid);
          if (peers.size === 0) this.spaces.delete(spaceId);

          // Clean up stream tracking
          this.removeParticipantStreams(spaceId, pid);

          // Update lastActiveAt non-fatal
          await this.touchLastActive(
            spaceId,
            ctx.participantId,
            ctx.role,
          ).catch(() => {});

          return ctx;
        }
      }
    }
    return null;
  }

  unregisterByIdentity(
    spaceId: string,
    participantId: string,
  ): ClientCtx | null {
    const peers = this.spaces.get(spaceId);
    if (!peers) return null;
    const ctx = peers.get(participantId) || null;
    if (ctx) {
      peers.delete(participantId);
      if (peers.size === 0) this.spaces.delete(spaceId);

      // Clean up stream tracking
      this.removeParticipantStreams(spaceId, participantId);

      // Not async here (leave path is fire-and-forget)
      this.touchLastActive(spaceId, participantId, ctx.role).catch(() => {});
    }
    return ctx;
  }

  getPeers(spaceId: string): ClientCtx[] {
    return Array.from(this.spaces.get(spaceId)?.values() ?? []);
  }

  getClient(spaceId: string, participantId: string): ClientCtx | undefined {
    return this.spaces.get(spaceId)?.get(participantId);
  }

  broadcast(spaceId: string, msg: any, exclude?: WebSocket) {
    const peers = this.spaces.get(spaceId);
    if (!peers) return;
    const data = JSON.stringify(msg);
    peers.forEach(({ client, participantId }) => {
      try {
        if (client !== exclude && client.readyState === WebSocket.OPEN) {
          client.send(data);
        }
      } catch (e) {
        this.logger.warn(
          `Broadcast to ${participantId} in ${spaceId} failed: ${String(e)}`,
        );
      }
    });
  }

  updatePublishState(
    spaceId: string,
    participantId: string,
    publish: { audio: boolean; video: boolean },
  ) {
    const ctx = this.getClient(spaceId, participantId);
    if (ctx) {
      ctx.publish = publish;
      this.updateStreamInfo(spaceId, participantId, 'camera', {
        isActive: publish.audio || publish.video,
        publish,
      });

      this.touchLastActive(spaceId, participantId, ctx.role).catch(() => {});
    }
  }

  /**
   * Update screen sharing state
   */
  updateScreenSharingState(
    spaceId: string,
    participantId: string,
    isSharing: boolean,
  ) {
    const ctx = this.getClient(spaceId, participantId);
    if (ctx) {
      ctx.screenSharing = isSharing;
      this.updateStreamInfo(spaceId, participantId, 'screen', {
        isActive: isSharing,
      });
    }
  }

  /**
   * Update URL sharing state
   */
  updateUrlSharingState(
    spaceId: string,
    participantId: string,
    urlSharing: { active: boolean; url?: string; sessionId?: string },
  ) {
    const ctx = this.getClient(spaceId, participantId);
    if (ctx) {
      ctx.urlSharing = urlSharing;
      this.updateStreamInfo(spaceId, participantId, 'url', {
        isActive: urlSharing.active,
        url: urlSharing.url,
        sessionId: urlSharing.sessionId,
      });
    }
  }

  /**
   * Get all active streams in a space
   */
  getSpaceStreams(spaceId: string): StreamInfo[] {
    const spaceStreamMap = this.spaceStreams.get(spaceId);
    if (!spaceStreamMap) return [];

    const allStreams: StreamInfo[] = [];
    spaceStreamMap.forEach((streams) => {
      allStreams.push(...streams.filter((s) => s.isActive));
    });

    return allStreams;
  }

  /**
   * Get active streams with participant details
   */
  getDetailedSpaceStreams(spaceId: string) {
    const peers = this.getPeers(spaceId);
    const streams = this.getSpaceStreams(spaceId);

    return streams.map((stream) => {
      const peer = peers.find((p) => p.participantId === stream.participantId);
      return {
        ...stream,
        participant: peer
          ? {
              id: peer.participantId,
              role: peer.role,
            }
          : null,
      };
    });
  }

  /* ─────────────────────────────────────────────────────────
   *  STREAM TRACKING HELPERS
   * ───────────────────────────────────────────────────────── */

  private initializeParticipantStreams(
    spaceId: string,
    participantId: string,
    role: Role,
  ) {
    if (!this.spaceStreams.has(spaceId)) {
      this.spaceStreams.set(spaceId, new Map());
    }

    const spaceStreamMap = this.spaceStreams.get(spaceId)!;
    const initialStreams: StreamInfo[] = [
      {
        participantId,
        role,
        streamType: 'camera',
        isActive: false,
        publish: { audio: false, video: false },
      },
      {
        participantId,
        role,
        streamType: 'screen',
        isActive: false,
      },
      {
        participantId,
        role,
        streamType: 'url',
        isActive: false,
      },
    ];

    spaceStreamMap.set(participantId, initialStreams);
  }

  private removeParticipantStreams(spaceId: string, participantId: string) {
    const spaceStreamMap = this.spaceStreams.get(spaceId);
    if (spaceStreamMap) {
      spaceStreamMap.delete(participantId);
      if (spaceStreamMap.size === 0) {
        this.spaceStreams.delete(spaceId);
      }
    }
  }

  private updateStreamInfo(
    spaceId: string,
    participantId: string,
    streamType: 'camera' | 'screen' | 'url',
    updates: Partial<StreamInfo>,
  ) {
    const spaceStreamMap = this.spaceStreams.get(spaceId);
    if (!spaceStreamMap) return;

    const participantStreams = spaceStreamMap.get(participantId);
    if (!participantStreams) return;

    const streamIndex = participantStreams.findIndex(
      (s) => s.streamType === streamType,
    );
    if (streamIndex >= 0) {
      participantStreams[streamIndex] = {
        ...participantStreams[streamIndex],
        ...updates,
      };
    }
  }

  /* ─────────────────────────────────────────────────────────
   *  INTERNAL HELPERS (existing code remains the same)
   * ───────────────────────────────────────────────────────── */

  private ensureSpaceMap(spaceId: string) {
    if (!this.spaces.has(spaceId)) this.spaces.set(spaceId, new Map());
  }

  private async isMember(
    spaceId: string,
    memberId: string,
    memberType: 'agent' | 'human',
  ): Promise<boolean> {
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

  private async touchLastActive(
    spaceId: string,
    memberId: string,
    memberType: 'agent' | 'human',
  ) {
    await this.db
      .update(schema.spaceMember)
      .set({ lastActiveAt: new Date() })
      .where(
        and(
          eq(schema.spaceMember.spaceId, spaceId),
          eq(schema.spaceMember.memberId, memberId),
          eq(schema.spaceMember.memberType, memberType),
        ),
      );
  }

  /**
   * Emit screen share frame to monitoring agents
   */
  emitScreenShareFrame(
    spaceId: string,
    participantId: string,
    frameData: Buffer,
    timestamp: number,
  ) {
    // Notify AI media bridge about screen share frame
    this.emit('screenShareFrame', {
      spaceId,
      participantId,
      frameData,
      timestamp,
      streamType: 'screen',
    });
  }

  /**
   * Emit web capture frame to monitoring agents
   */
  emitWebCaptureFrame(
    spaceId: string,
    participantId: string,
    frameData: Buffer,
    timestamp: number,
    sessionId?: string,
  ) {
    // Notify AI media bridge about web capture frame
    this.emit('webCaptureFrame', {
      spaceId,
      participantId,
      frameData,
      timestamp,
      streamType: 'url',
      sessionId,
    });
  }
}

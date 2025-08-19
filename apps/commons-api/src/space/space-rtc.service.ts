// apps/commons-api/src/space/space-rtc.service.ts
import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { WebSocket } from 'ws';
import { eq, and } from 'drizzle-orm';

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
}

@Injectable()
export class SpaceRTCService {
  private readonly logger = new Logger(SpaceRTCService.name);
  /** in-memory registry: spaceId -> Map(participantId -> ctx) */
  private spaces = new Map<string, Map<string, ClientCtx>>();

  constructor(
    private readonly db: DatabaseService,
    private readonly spaceService: SpaceService,
  ) {}

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
    });

    this.logger.log(
      `Registered client ${ctx.participantId} in space ${ctx.spaceId} [${ctx.role}] (no DB)`,
    );
  }

  /**
   * DB-aware registration:
   * - Validates space exists
   * - Ensures membership (auto-enrolls if space is public and role allowed)
   * - Updates lastActiveAt
   * - Registers in the in-memory RTC map
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
        const allowAgents = space.settings?.allowAgents ?? true; // default generous
        const allowHumans = space.settings?.allowHumans ?? true; // default generous
        const allowed =
          (role === 'agent' && allowAgents) ||
          (role === 'human' && allowHumans);

        if (!allowed) {
          throw new BadRequestException(
            `Space ${spaceId} does not allow ${role} to join`,
          );
        }

        // Leverage SpaceService.addMember for consistent behavior
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
    });

    this.logger.log(
      `Registered client ${participantId} in space ${spaceId} [${role}] with DB auth`,
    );
  }

  /**
   * Remove a client by WebSocket handle.
   * Also tries to set lastActiveAt.
   */
  async unregisterClient(client: WebSocket): Promise<ClientCtx | null> {
    // For debugging: list spaces and peers
    try {
      const dump = Array.from(this.spaces.entries()).map(([sid, map]) => ({
        spaceId: sid,
        participants: Array.from(map.keys()),
      }));
      this.logger.debug(`Current spaces: ${JSON.stringify(dump)}`);
    } catch {}

    for (const [spaceId, peers] of this.spaces.entries()) {
      for (const [pid, ctx] of peers.entries()) {
        if (ctx.client === client) {
          peers.delete(pid);
          if (peers.size === 0) this.spaces.delete(spaceId);

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
      // Optional: touch last active when publish state changes
      this.touchLastActive(spaceId, participantId, ctx.role).catch(() => {});
    }
  }

  getSpaceStreams(spaceId: string) {
    const peers = this.getPeers(spaceId);
    return peers.map((p) => ({
      id: p.participantId,
      role: p.role,
      publish: p.publish,
    }));
  }

  /* ─────────────────────────────────────────────────────────
   *  INTERNAL HELPERS (DB + guards)
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
}

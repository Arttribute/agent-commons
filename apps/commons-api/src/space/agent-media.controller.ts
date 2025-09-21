import {
  Controller,
  Post,
  Param,
  Body,
  Delete,
  BadRequestException,
  Get,
} from '@nestjs/common';
import { AiMediaBridgeService } from './ai-media-bridge.service';

interface RTCIceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

@Controller({ version: '1', path: 'spaces' })
export class AgentMediaController {
  constructor(private readonly bridge: AiMediaBridgeService) {}

  @Post(':spaceId/agents/:agentId/media/join')
  async join(
    @Param('spaceId') spaceId: string,
    @Param('agentId') agentId: string,
    @Body() body: { wsUrl: string; iceServers?: RTCIceServer[] },
  ) {
    if (!body.wsUrl) throw new BadRequestException('wsUrl is required');
    await this.bridge.joinSpaceAsAgent(
      spaceId,
      agentId,
      body.wsUrl,
      body.iceServers,
    );
    return { ok: true };
  }

  @Delete(':spaceId/agents/:agentId/media/leave')
  async leave(
    @Param('spaceId') spaceId: string,
    @Param('agentId') agentId: string,
  ) {
    await this.bridge.leaveSpace(spaceId, agentId);
    return { ok: true };
  }

  @Post(':spaceId/agents/:agentId/media/monitor/start')
  async startStreamMonitoring(
    @Param('spaceId') spaceId: string,
    @Param('agentId') agentId: string,
    @Body() body: { targetParticipantId?: string },
  ) {
    await this.bridge.startStreamMonitoring(
      spaceId,
      agentId,
      body.targetParticipantId,
    );
    return { ok: true };
  }

  @Post(':spaceId/agents/:agentId/media/monitor/stop')
  async stopStreamMonitoring(
    @Param('spaceId') spaceId: string,
    @Param('agentId') agentId: string,
  ) {
    await this.bridge.stopStreamMonitoring(spaceId, agentId);
    return { ok: true };
  }

  @Get(':spaceId/streams/active')
  async getActiveStreams(@Param('spaceId') spaceId: string) {
    const streams = await this.bridge.getActiveStreams(spaceId);
    return { data: streams };
  }

  @Get(':spaceId/streams/monitored')
  async getMonitoredStreams(@Param('spaceId') spaceId: string) {
    const streams = await this.bridge.getMonitoredStreams(spaceId);
    return { data: streams };
  }

  @Get(':spaceId/participants')
  async getSpaceParticipants(@Param('spaceId') spaceId: string) {
    const participants = await this.bridge.getSpaceParticipants(spaceId);
    return { data: participants };
  }
}

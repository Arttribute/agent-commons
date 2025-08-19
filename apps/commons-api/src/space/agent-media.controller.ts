import {
  Controller,
  Post,
  Param,
  Body,
  Delete,
  BadRequestException,
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

  @Post(':spaceId/agents/:agentId/media/publish/audio/start')
  async startAudio(
    @Param('spaceId') spaceId: string,
    @Param('agentId') agentId: string,
  ) {
    await this.bridge.startPublishingAudio(spaceId, agentId);
    return { ok: true };
  }

  @Post(':spaceId/agents/:agentId/media/publish/audio/stop')
  async stopAudio(
    @Param('spaceId') spaceId: string,
    @Param('agentId') agentId: string,
  ) {
    await this.bridge.stopPublishingAudio(spaceId, agentId);
    return { ok: true };
  }

  @Post(':spaceId/agents/:agentId/media/publish/video/start')
  async startVideo(
    @Param('spaceId') spaceId: string,
    @Param('agentId') agentId: string,
  ) {
    await this.bridge.startPublishingVideo(spaceId, agentId);
    return { ok: true };
  }

  @Post(':spaceId/agents/:agentId/media/publish/video/stop')
  async stopVideo(
    @Param('spaceId') spaceId: string,
    @Param('agentId') agentId: string,
  ) {
    await this.bridge.stopPublishingVideo(spaceId, agentId);
    return { ok: true };
  }
}

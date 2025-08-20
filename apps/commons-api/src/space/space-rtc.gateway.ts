import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { WebCaptureService } from './web-capture.service';
import { SpaceRTCService } from './space-rtc.service';

interface SignalMessage {
  type:
    | 'join'
    | 'leave'
    | 'offer'
    | 'answer'
    | 'candidate'
    | 'publishState'
    | 'startWebCapture'
    | 'stopWebCapture'
    | 'requestPublishState';
  spaceId: string;
  fromId: string;
  role: 'human' | 'agent';
  targetId?: string;
  data?: any;
  publish?: { audio: boolean; video: boolean };
  streamType?: 'camera' | 'screen' | 'url';
  url?: string;
  sessionId?: string;
}

interface ParticipantState {
  id: string;
  role: string;
  socketId: string;
  publishing: { audio: boolean; video: boolean };
  screenSharing: boolean;
  urlSharing: { active: boolean; url?: string; sessionId?: string };
}

@WebSocketGateway({
  cors: { origin: '*' },
  namespace: '/rtc',
  transports: ['websocket'],
})
export class SpaceRTCGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer() server!: Server;
  private readonly logger = new Logger(SpaceRTCGateway.name);

  private spaces = new Map<string, Map<string, ParticipantState>>();
  private clients = new Map<
    string,
    { spaceId: string; participantId: string; role: string }
  >();

  constructor(
    private readonly webCaptureService: WebCaptureService,
    private readonly spaceRTCService: SpaceRTCService,
  ) {
    // Listen for frame data from web capture service
    this.webCaptureService.on('frame', (frameData) => {
      this.handleWebFrame(frameData);

      // Also emit to RTC service for AI monitoring
      this.spaceRTCService.emitWebCaptureFrame(
        frameData.spaceId,
        frameData.participantId,
        frameData.frameData,
        frameData.timestamp,
        frameData.sessionId,
      );
    });
  }

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
    const clientInfo = this.clients.get(client.id);
    if (clientInfo) {
      this.handleLeave(client, {
        type: 'leave',
        spaceId: clientInfo.spaceId,
        fromId: clientInfo.participantId,
        role: clientInfo.role as any,
      });
    }
  }

  @SubscribeMessage('join')
  handleJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() message: SignalMessage,
  ) {
    const { spaceId, fromId, role } = message;

    this.clients.set(client.id, { spaceId, participantId: fromId, role });

    if (!this.spaces.has(spaceId)) {
      this.spaces.set(spaceId, new Map());
    }

    const space = this.spaces.get(spaceId)!;

    const newParticipant: ParticipantState = {
      id: fromId,
      role,
      socketId: client.id,
      publishing: { audio: false, video: false },
      screenSharing: false,
      urlSharing: { active: false },
    };

    space.set(fromId, newParticipant);

    // Register with SpaceRTCService for unified tracking
    const mockWs = {
      close: () => client.disconnect(),
      readyState: 1, // OPEN
    } as any;

    try {
      this.spaceRTCService.registerClient({
        client: mockWs,
        spaceId,
        participantId: fromId,
        role: role as any,
      });
    } catch (error) {
      this.logger.warn(`Failed to register with RTC service: ${error}`);
    }

    client.join(spaceId);

    // Get existing participants with their current states
    const participants: any[] = [];
    space.forEach((participant, participantId) => {
      if (participantId !== fromId) {
        participants.push({
          id: participant.id,
          role: participant.role,
          publishing: participant.publishing,
          screenSharing: participant.screenSharing,
          urlSharing: participant.urlSharing,
        });
      }
    });

    // Send join response with current participants
    client.emit('joined', {
      spaceId,
      participants,
      yourId: fromId,
    });

    // Notify other participants about new peer
    client.to(spaceId).emit('signal', {
      type: 'peer-joined',
      spaceId,
      fromId,
      role,
    });

    this.logger.log(
      `${fromId} (${role}) joined space ${spaceId}. Active participants: ${space.size}`,
    );
  }

  @SubscribeMessage('signal')
  handleSignal(
    @ConnectedSocket() client: Socket,
    @MessageBody() message: SignalMessage,
  ) {
    const { spaceId, targetId, type, streamType } = message;

    // Update participant state for publishState messages
    if (type === 'publishState') {
      const clientInfo = this.clients.get(client.id);
      if (clientInfo && this.spaces.has(spaceId)) {
        const space = this.spaces.get(spaceId)!;
        const participant = space.get(clientInfo.participantId);
        if (participant) {
          if (streamType === 'url') {
            participant.urlSharing = {
              active: !!message.url,
              url: message.url,
              sessionId: message.sessionId,
            };
            // Update RTC service
            this.spaceRTCService.updateUrlSharingState(
              spaceId,
              clientInfo.participantId,
              participant.urlSharing,
            );
          } else if (streamType === 'screen') {
            participant.screenSharing = !!message.publish?.video;
            // Update RTC service
            this.spaceRTCService.updateScreenSharingState(
              spaceId,
              clientInfo.participantId,
              participant.screenSharing,
            );
          } else if (streamType === 'camera' && message.publish) {
            participant.publishing = message.publish;
            // Update RTC service
            this.spaceRTCService.updatePublishState(
              spaceId,
              clientInfo.participantId,
              message.publish,
            );
          }

          this.logger.log(
            `Updated ${clientInfo.participantId} state: ${streamType} - ${JSON.stringify(
              streamType === 'url'
                ? participant.urlSharing
                : streamType === 'screen'
                  ? participant.screenSharing
                  : participant.publishing,
            )}`,
          );
        }
      }
    }

    // Forward signal to appropriate target(s)
    if (targetId) {
      // Direct message to specific peer
      this.server.to(spaceId).emit('signal', message);
    } else {
      // Broadcast to all peers in space except sender
      client.to(spaceId).emit('signal', message);
    }
  }

  @SubscribeMessage('startWebCapture')
  async handleStartWebCapture(
    @ConnectedSocket() client: Socket,
    @MessageBody() message: SignalMessage,
  ) {
    const { spaceId, fromId, url, sessionId } = message;

    if (!url || !sessionId) {
      client.emit('webCaptureError', { error: 'Missing URL or session ID' });
      return;
    }

    try {
      const result = await this.webCaptureService.startCapture({
        sessionId,
        spaceId,
        url,
        participantId: fromId,
      });

      if (result.success) {
        // Update participant state
        const clientInfo = this.clients.get(client.id);
        if (clientInfo && this.spaces.has(spaceId)) {
          const space = this.spaces.get(spaceId)!;
          const participant = space.get(fromId);
          if (participant) {
            participant.urlSharing = {
              active: true,
              url,
              sessionId,
            };
            // Update RTC service
            this.spaceRTCService.updateUrlSharingState(
              spaceId,
              fromId,
              participant.urlSharing,
            );
          }
        }

        // Notify all clients in space about the new URL stream
        this.server.to(spaceId).emit('signal', {
          type: 'publishState',
          spaceId,
          fromId,
          streamType: 'url',
          url,
          sessionId,
        });

        client.emit('webCaptureStarted', { sessionId, url });
        this.logger.log(`Web capture started for ${fromId}: ${url}`);
      } else {
        client.emit('webCaptureError', { error: result.error });
      }
    } catch (error) {
      this.logger.error('Web capture start error:', error);
      client.emit('webCaptureError', { error: 'Failed to start web capture' });
    }
  }

  @SubscribeMessage('stopWebCapture')
  async handleStopWebCapture(
    @ConnectedSocket() client: Socket,
    @MessageBody() message: SignalMessage,
  ) {
    const { spaceId, fromId, sessionId } = message;

    if (!sessionId) {
      return;
    }

    try {
      await this.webCaptureService.stopCapture(sessionId);

      // Update participant state
      const clientInfo = this.clients.get(client.id);
      if (clientInfo && this.spaces.has(spaceId)) {
        const space = this.spaces.get(spaceId)!;
        const participant = space.get(fromId);
        if (participant) {
          participant.urlSharing = { active: false };
          // Update RTC service
          this.spaceRTCService.updateUrlSharingState(
            spaceId,
            fromId,
            participant.urlSharing,
          );
        }
      }

      // Notify all clients in space
      this.server.to(spaceId).emit('signal', {
        type: 'publishState',
        spaceId,
        fromId,
        streamType: 'url',
        url: null,
        sessionId: null,
      });

      client.emit('webCaptureStopped', { sessionId });
      this.logger.log(`Web capture stopped for ${fromId}: ${sessionId}`);
    } catch (error) {
      this.logger.error('Web capture stop error:', error);
    }
  }

  @SubscribeMessage('leave')
  async handleLeave(
    @ConnectedSocket() client: Socket,
    @MessageBody() message: SignalMessage,
  ) {
    const { spaceId, fromId } = message;

    // Stop any active web captures for this participant
    const space = this.spaces.get(spaceId);
    if (space) {
      const participant = space.get(fromId);
      if (participant?.urlSharing.sessionId) {
        await this.webCaptureService.stopCapture(
          participant.urlSharing.sessionId,
        );
      }
    }

    // Unregister from RTC service
    this.spaceRTCService.unregisterByIdentity(spaceId, fromId);

    this.clients.delete(client.id);
    if (this.spaces.has(spaceId)) {
      const space = this.spaces.get(spaceId)!;
      space.delete(fromId);
      if (space.size === 0) {
        this.spaces.delete(spaceId);
      }
    }

    client.leave(spaceId);

    // Notify other participants
    client.to(spaceId).emit('signal', {
      type: 'peer-left',
      spaceId,
      fromId,
    });

    this.logger.log(`${fromId} left space ${spaceId}`);
  }

  @SubscribeMessage('requestPublishState')
  handleRequestPublishState(
    @ConnectedSocket() client: Socket,
    @MessageBody() message: SignalMessage,
  ) {
    const { spaceId, targetId, streamType = 'camera' } = message;

    if (targetId && this.spaces.has(spaceId)) {
      const space = this.spaces.get(spaceId)!;
      const targetParticipant = space.get(targetId);

      if (targetParticipant) {
        if (streamType === 'camera') {
          // Send current camera publish state to requesting agent
          client.emit('signal', {
            type: 'publishState',
            spaceId,
            fromId: targetId,
            role: targetParticipant.role,
            publish: targetParticipant.publishing,
            streamType: 'camera',
          });
        } else if (streamType === 'screen' && targetParticipant.screenSharing) {
          // Send screen sharing state
          client.emit('signal', {
            type: 'publishState',
            spaceId,
            fromId: targetId,
            role: targetParticipant.role,
            publish: { audio: false, video: true },
            streamType: 'screen',
          });
        }

        this.logger.log(
          `Sent ${streamType} publish state for ${targetId} to requesting agent`,
        );
      }
    }
  }

  private handleWebFrame(frameData: {
    sessionId: string;
    spaceId: string;
    participantId: string;
    frameData: Buffer;
    timestamp: number;
  }) {
    // Convert frame to base64 and send to all clients in the space
    const base64Frame = frameData.frameData.toString('base64');

    this.server.to(frameData.spaceId).emit('webFrame', {
      sessionId: frameData.sessionId,
      participantId: frameData.participantId,
      frame: base64Frame,
      timestamp: frameData.timestamp,
    });
  }
}

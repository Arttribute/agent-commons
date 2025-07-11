/* This file is for when we need to fetch statistics or other information on spaces or interact with the space (oonce stored in the DB) */

import { Controller, Get, Param } from '@nestjs/common';
import { SpaceConductor } from './space-conductor.service';

@Controller({ version: '1', path: 'spaces' })
export class SpaceController {
  constructor(private readonly spaceConductor: SpaceConductor) {}

  @Get()
  testEndpoint() {
    return {
      message: 'Space controller is working',
    };
  }

  // This endpoint is for getting the detailed context of a space by sessionId
  @Get(':sessionId')
  async getSpaceContext(@Param('sessionId') sessionId: string) {
    const spaceContext = this.spaceConductor.getOrCreateContext(sessionId);

    console.log(`[SessionController] Getting events for session: ${sessionId}`);
    console.log(
      `[SessionController] Total contributions: ${spaceContext.contributions.length}`,
    );

    return {
      data: {
        sessionId,
        messages: spaceContext.getMessages(),
        toolCalls: spaceContext.getToolCalls(),
        agentInteractions: spaceContext.getAgentInteractions(),
        contributions: spaceContext.contributions,
        finalResult: spaceContext.finalResult,
        totalEvents: spaceContext.contributions.length,
        lastUpdated: new Date().toISOString(),
      },
    };
  }

  // This endpoint is for getting aggregated stats about the space context
  @Get(':sessionId/stats')
  async getSpaceContextStats(@Param('sessionId') sessionId: string) {
    // This would require injecting AgentService, but let's keep it simple for now
    const spaceContext = this.spaceConductor.getOrCreateContext(sessionId);

    const stats = spaceContext.getStatistics();

    return { data: stats };
  }
}

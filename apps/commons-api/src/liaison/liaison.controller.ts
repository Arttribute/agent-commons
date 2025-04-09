// src/liaison/liaison.controller.ts
import {
  Controller,
  Post,
  Body,
  Headers,
  BadRequestException,
} from '@nestjs/common';
import { LiaisonService } from './liaison.service';

@Controller({ version: '1', path: 'liaison' })
export class LiaisonController {
  constructor(private readonly liaisonService: LiaisonService) {}

  /**
   * Create a new liaison agent.
   * Returns the agent record and the raw liaison_secret (store it securely).
   */
  @Post()
  async createLiaison(
    @Body()
    body: {
      name: string;
      owner: string;
      externalOwner: string;
      persona?: string;
      instructions?: string;
      externalUrl?: string;
      externalEndpoint?: string;
    },
  ) {
    const result = await this.liaisonService.createLiaisonAgent(body);
    return {
      data: result.agent,
      liaisonKey: result.liaisonKey,
      note: 'Store this liaison_secret securely. It will not be retrievable again.',
    };
  }

  /**
   * Interact with the liaison agent.
   * Requires the liaisonAgentId in the body and the liaison_secret in the "x-api-key" header.
   */
  @Post('interact')
  async interact(
    @Body() body: { liaisonAgentId: string; message?: string },
    @Headers('x-api-key') liaisonKey: string,
  ) {
    if (!body.liaisonAgentId) {
      throw new BadRequestException('liaisonAgentId is required in the body.');
    }
    if (!liaisonKey) {
      throw new BadRequestException('x-api-key header is required.');
    }
    const result = await this.liaisonService.interactWithLiaison(
      body.liaisonAgentId,
      liaisonKey,
      body.message,
    );
    return { data: result };
  }
}

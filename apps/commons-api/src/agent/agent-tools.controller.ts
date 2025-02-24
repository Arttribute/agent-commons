import { TypedBody } from '@nestia/core';
import {
  BadRequestException,
  Controller,
  forwardRef,
  Inject,
  Post,
} from '@nestjs/common';
import { InferInsertModel } from 'drizzle-orm';
import { ChatCompletionMessageToolCall } from 'openai/resources/index.mjs';
import { Except } from 'type-fest';
import { CommonToolService } from '~/tool/tools/common-tool.service';
import { EthereumToolService } from '~/tool/tools/ethereum-tool.service';
import { AgentService } from './agent.service';
import { merge } from 'lodash';
import { ToolRunnableConfig } from '@langchain/core/tools';

@Controller({ version: '1', path: 'agents' })
export class AgentToolsController {
  constructor(
    private agent: AgentService,
    @Inject(forwardRef(() => EthereumToolService))
    private ethereumToolService: EthereumToolService,
    @Inject(forwardRef(() => CommonToolService))
    private commonToolService: CommonToolService,
  ) {}

  @Post('tools')
  async makeAgentToolCall(
    @TypedBody()
    body: {
      config: ToolRunnableConfig<Record<string, any>>;
      args: any;
      metadata: any;
    },
  ) {
    const { metadata, config, args } = body;

    const { agentId } = metadata;

    const agent = await this.agent.getAgent({ agentId });

    if (!agent) {
      throw new BadRequestException('Agent not found');
    }

    const privateKey = this.agent.seedToPrivateKey(agent.wallet.seed);
    merge(metadata, { privateKey });

    console.log('Tool Call', { config, toolCallArgs: args });

    const toolWithMethod = [
      this.commonToolService,
      this.ethereumToolService,
      // @ts-expect-error
    ].find((tool) => tool[config.runName]);

    // console.log('Tool with method', toolWithMethod);

    // @ts-expect-error
    const data = await toolWithMethod[config.runName](args, metadata);

    return data;
  }
}

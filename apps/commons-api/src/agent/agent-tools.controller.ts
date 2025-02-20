import { TypedBody } from '@nestia/core';
import { Controller, forwardRef, Inject, Post } from '@nestjs/common';
import { InferInsertModel } from 'drizzle-orm';
import { ChatCompletionMessageToolCall } from 'openai/resources/index.mjs';
import { Except } from 'type-fest';
import { CommonToolService } from '~/tool/tools/common-tool.service';
import { EthereumToolService } from '~/tool/tools/ethereum-tool.service';

@Controller({ version: '1', path: 'agents' })
export class AgentToolsController {
  constructor(
    @Inject(forwardRef(() => EthereumToolService))
    private ethereumToolService: EthereumToolService,
    @Inject(forwardRef(() => CommonToolService))
    private commonToolService: CommonToolService,
  ) {}

  @Post('tools')
  async makeAgentToolCall(
    @TypedBody()
    body: {
      toolCall: ChatCompletionMessageToolCall;
      metadata: any;
    },
  ) {
    const { metadata, toolCall } = body;
    const args = JSON.parse(toolCall.function.arguments);

    console.log('Tool Call', { toolCall, toolCallArgs: args });

    const toolWithMethod = [
      this.commonToolService,
      this.ethereumToolService,
      // @ts-expect-error
    ].find((tool) => tool[toolCall.function.name]);

    // console.log('Tool with method', toolWithMethod);

    // @ts-expect-error
    const data = await toolWithMethod[toolCall.function.name](args, metadata);

    return data;
  }
}

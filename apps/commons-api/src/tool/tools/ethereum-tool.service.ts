import { forwardRef, Inject, Injectable } from '@nestjs/common';
import { AgentService } from '~/agent/agent.service';

export interface EthereumTool {
  /**
   * Get the balance of the COMMON token in wallet
   */
  getCommonTokenBalance(): number;

  /**
   * Transfer COMMON tokens from wallet to another wallet
   */
  transferTokensToWallet(props: { address: string; amount: number }): any;
}

@Injectable()
export class EthereumToolService implements EthereumTool {
  constructor(
    @Inject(forwardRef(() => AgentService)) private agentService: AgentService,
  ) {}
  // @ts-expect-error
  async getCommonTokenBalance(props: {}, metadata: { agentId: string }) {
    const { agentId } = metadata;
    // Find a way to get current agent
    return await this.agentService.checkCommonsBalance({ agentId });
  }

  // @ts-expect-error
  async transferTokensToWallet(
    props: { address: string; amount: number },
    metadata: { agentId: string },
  ) {
    // return this.agentService.transferTokensToWallet(props);
  }
}

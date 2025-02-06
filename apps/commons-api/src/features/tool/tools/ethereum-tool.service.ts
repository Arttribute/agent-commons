import { forwardRef, Inject, Injectable } from '@nestjs/common';
import { AgentService } from '~/features/agent/agent.service';

export interface EthereumTool {
  /**
   * Check the balance of the COMMON token in wallet
   */
  checkCommonTokenBalance(): Promise<number>;

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
  async checkCommonTokenBalance(props: {}) {
    // Find a way to get current agent
    return await this.agentService.checkCommonsBalance({ agentId: '' });
  }

  transferTokensToWallet(props: { address: string; amount: number }) {
    return this.agentService.transferTokensToWallet(props);
  }
}

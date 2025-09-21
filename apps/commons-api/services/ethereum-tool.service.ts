import { inject, injectable } from "tsyringe";
import { AgentService } from "./agent.service.js";

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

@injectable()
export class EthereumToolService implements EthereumTool {
	constructor(
    @inject(AgentService) private $agent: AgentService,
  ) {}
	// @ts-expect-error
	async getCommonTokenBalance(props: {}, metadata: { agentId: string }) {
		const { agentId } = metadata;
		// Find a way to get current agent
		return await this.$agent.checkCommonsBalance({ id: agentId });
	}

	// @ts-expect-error
	async transferTokensToWallet(
		props: { address: string; amount: number },
		metadata: { agentId: string },
	) {
		return this.$agent.transferTokensToWallet({
			...props,
			agentId: metadata.agentId,
		});
	}
}

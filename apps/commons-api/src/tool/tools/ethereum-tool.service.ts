import { randomUUID } from 'node:crypto';
import { BadRequestException, Injectable } from '@nestjs/common';
import { WalletService } from '~/wallet/wallet.service';

type WalletNetwork =
  | 'base-sepolia'
  | 'arc-testnet'
  | 'celo-sepolia'
  | 'hedera-testnet'
  | 'base';

const NETWORK_CHAIN_IDS: Record<WalletNetwork, string> = {
  'base-sepolia': '84532',
  'arc-testnet': '5042002',
  'celo-sepolia': '11142220',
  'hedera-testnet': '296',
  base: '8453',
};

/** @deprecated Use WalletTool */
export type EthereumTool = WalletTool;

/** Agent-facing operations on the agent's own wallet. */
export interface WalletTool {
  /**
   * Get this agent's wallet address, USDC and native balances on a network,
   * and the owner-set transfer allowance still available there. Balances are
   * separate on each network. Defaults to the wallet's own network.
   */
  getWalletBalance(props: { network?: WalletNetwork }): Promise<any>;

  /**
   * Send USDC from this agent's wallet on chain. Works only within the
   * transfer allowance its owner set for that network (total budget, maximum
   * per transfer, optional recipient list). Use it when asked to pay or send
   * funds; do not ask the user to send it manually. The network needs a
   * little native balance for gas. Returns the transaction hash and explorer
   * link; report both. Never retry a transfer whose status is "unknown".
   */
  transferUsdc(props: {
    /** Recipient 0x address, or the ID of another agent to pay its wallet */
    to: string;
    /** USDC amount as a decimal string, e.g. "1" or "0.25" */
    amount: string;
    /** Network to send on; defaults to the wallet's own network */
    network?: 'base-sepolia' | 'arc-testnet' | 'celo-sepolia';
  }): Promise<any>;
}

type ToolMetadata = {
  agentId?: string;
  sessionId?: string;
  runId?: string;
  toolCallId?: string;
};

@Injectable()
export class EthereumToolService implements WalletTool {
  constructor(private readonly wallets: WalletService) {}

  async getWalletBalance(
    props: { network?: WalletNetwork },
    metadata?: ToolMetadata,
  ) {
    return this.wallets.agentWalletSummary(
      this.requireAgentId(metadata),
      this.chainId(props?.network),
    );
  }

  async transferUsdc(
    props: {
      to: string;
      amount: string;
      network?: 'base-sepolia' | 'arc-testnet' | 'celo-sepolia';
    },
    metadata?: ToolMetadata,
  ) {
    return this.wallets.agentTransfer({
      agentId: this.requireAgentId(metadata),
      to: props?.to,
      amount: props?.amount,
      chainId: this.chainId(props?.network),
      // A replayed tool call must not pay twice.
      idempotencyKey:
        metadata?.runId && metadata?.toolCallId
          ? `${metadata.runId}:${metadata.toolCallId}`
          : `call:${randomUUID()}`,
      sessionId: metadata?.sessionId,
    });
  }

  /** Identity comes from the trusted runtime, never from model arguments. */
  private requireAgentId(metadata?: ToolMetadata) {
    if (!metadata?.agentId)
      throw new BadRequestException('Wallet tools require an agent context');
    return metadata.agentId;
  }

  private chainId(network?: string) {
    if (!network) return undefined;
    const chainId = NETWORK_CHAIN_IDS[network as WalletNetwork];
    if (!chainId) throw new BadRequestException(`Unknown network ${network}`);
    return chainId;
  }
}

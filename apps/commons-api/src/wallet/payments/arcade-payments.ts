import { BadRequestException, ForbiddenException } from '@nestjs/common';
import {
  createPublicClient,
  createWalletClient,
  http,
  erc20Abi,
  encodeFunctionData,
  type Hex,
  type Address,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { arcadeAbi } from './arcade-abi';
import { walletChain } from './chains';
import { positiveUnits } from './policy';
import type {
  PaymentSession,
  PaymentSessionService,
} from './payment-session.service';
export async function payArcadeDeposit(
  session: PaymentSession,
  sessions: PaymentSessionService,
  key: Hex,
  input: {
    operation: 'stake' | 'bounty' | 'bet';
    amountUnits?: string;
    idempotencyKey: string;
  },
) {
  const grant = session.policy.arcade;
  if (!grant || !grant.allowedOperations.includes(input.operation))
    throw new ForbiddenException(
      'Arcade deposit is outside this spending grant',
    );
  const chainId =
    session.policy.network === 'hedera:testnet'
      ? '296'
      : session.policy.network.split(':')[1];
  const network = walletChain(chainId),
    reader = createPublicClient({ chain: network.chain, transport: http() }),
    account = privateKeyToAccount(key),
    wallet = createWalletClient({
      chain: network.chain,
      transport: http(),
      account,
    });
  const contract = session.policy.payTo as Address,
    id = grant.poolId as Hex,
    seat = grant.seatId as Hex;
  const pool = await reader.readContract({
    address: contract,
    abi: arcadeAbi,
    functionName: 'getMatch',
    args: [id],
  });
  if (
    pool.status !== 1 ||
    pool.terms.token.toLowerCase() !== network.token.toLowerCase() ||
    Number(pool.terms.fundingDeadline) <= Date.now() / 1000
  )
    throw new BadRequestException('Pool is closed or uses the wrong token');
  const amount =
    input.operation === 'stake'
      ? pool.terms.stake
      : positiveUnits(input.amountUnits);
  if (amount <= 0n || amount > positiveUnits(session.policy.maxPaymentUnits))
    throw new ForbiddenException('Deposit exceeds per-payment limit');
  if (input.operation === 'stake') {
    const recipient = await reader.readContract({
      address: contract,
      abi: arcadeAbi,
      functionName: 'recipient',
      args: [id, seat],
    });
    if (recipient.toLowerCase() !== account.address.toLowerCase())
      throw new ForbiddenException('This wallet does not own the granted seat');
  }
  const attempt = await sessions.reserve(
    session,
    input.idempotencyKey,
    amount.toString(),
    `${session.policy.origin}/${grant.matchId}/${input.operation}`,
  );
  try {
    const approval = await wallet.writeContract({
      address: network.token,
      abi: erc20Abi,
      functionName: 'approve',
      args: [contract, amount],
    });
    const approved = await reader.waitForTransactionReceipt({
      hash: approval,
      confirmations: 2,
    });
    if (approved.status !== 'success')
      throw new Error('USDC approval reverted');
    const data =
      input.operation === 'stake'
        ? encodeFunctionData({
            abi: arcadeAbi,
            functionName: 'stake',
            args: [id, seat],
          })
        : input.operation === 'bounty'
          ? encodeFunctionData({
              abi: arcadeAbi,
              functionName: 'fundBounty',
              args: [id, amount],
            })
          : encodeFunctionData({
              abi: arcadeAbi,
              functionName: 'placeBet',
              args: [id, seat, amount],
            });
    await reader.call({ account, to: contract, data });
    const hash = await wallet.sendTransaction({ to: contract, data });
    const receipt = await reader.waitForTransactionReceipt({
      hash,
      confirmations: 2,
    });
    if (receipt.status !== 'success') throw new Error('Deposit reverted');
    await sessions.finish(attempt, 'settled', {
      transaction: hash,
      approval,
      network: session.policy.network,
      pool: id,
      amount: amount.toString(),
    });
    return { transaction: hash, amountUnits: amount.toString(), pool: id };
  } catch (error) {
    await sessions.finish(attempt, 'unknown', {
      reason: 'Inspect onchain receipts before retrying; budget retained',
    });
    throw error;
  }
}

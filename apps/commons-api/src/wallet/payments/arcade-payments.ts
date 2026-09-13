import { BadRequestException, ForbiddenException } from '@nestjs/common';
import {
  createPublicClient,
  createWalletClient,
  http,
  erc20Abi,
  encodeFunctionData,
  zeroAddress,
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
  if (amount > positiveUnits(session.policy.maxPaymentUnits))
    throw new ForbiddenException('Deposit exceeds per-payment limit');
  let openSeat = false;
  if (input.operation === 'stake') {
    const recipient = await reader.readContract({
      address: contract,
      abi: arcadeAbi,
      functionName: 'recipient',
      args: [id, seat],
    });
    if (recipient === zeroAddress) {
      // Unknown/legacy contracts fail closed: empty recipient alone never authorizes a payment.
      const [open, registered, alreadySeated] = await Promise.all([
        reader.readContract({
          address: contract,
          abi: arcadeAbi,
          functionName: 'openSeats',
          args: [id],
        }),
        reader.readContract({
          address: contract,
          abi: arcadeAbi,
          functionName: 'registeredSeat',
          args: [id, seat],
        }),
        reader.readContract({
          address: contract,
          abi: arcadeAbi,
          functionName: 'seated',
          args: [id, account.address],
        }),
      ]);
      if (!open || !registered || alreadySeated)
        throw new ForbiddenException(
          'This seat is not available to this agent',
        );
      openSeat = true;
    } else if (recipient.toLowerCase() !== account.address.toLowerCase())
      throw new ForbiddenException('This wallet does not own the granted seat');
  }
  if (amount === 0n && !openSeat)
    throw new ForbiddenException(
      'Only an open sponsored seat may have zero entry cost',
    );
  const attempt =
    amount === 0n
      ? await sessions.reserveSeatJoin(session, input.idempotencyKey)
      : await sessions.reserve(
          session,
          input.idempotencyKey,
          amount.toString(),
          `${session.policy.origin}/${grant.matchId}/${input.operation}`,
        );
  try {
    let approval: Hex | undefined;
    if (amount > 0n) {
      approval = await wallet.writeContract({
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
    }
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

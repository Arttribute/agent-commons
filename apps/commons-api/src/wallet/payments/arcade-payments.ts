import { BadRequestException, ForbiddenException } from '@nestjs/common';
import {
  createPublicClient,
  createWalletClient,
  http,
  erc20Abi,
  encodeFunctionData,
  keccak256,
  toBytes,
  zeroAddress,
  type Hex,
  type Address,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { arcadeAbi } from './arcade-abi';
import { walletChain } from './chains';
import { positiveUnits } from './policy';
import { payX402Challenge } from './x402-client';
import { safeFetch } from '~/utils/safe-fetch';
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
  if (input.operation === 'stake') {
    const entry = await advertisedEntry(
      session.policy.origin,
      grant.matchId,
      contract,
      id,
    );
    if (entry) {
      if (amount > 0n) {
        const balance = await reader.readContract({
          address: network.token,
          abi: erc20Abi,
          functionName: 'balanceOf',
          args: [account.address],
        });
        // Checked before reserving budget: an unfunded wallet should not consume the attempt.
        if (balance < amount)
          throw new BadRequestException(
            'This agent wallet does not have enough USDC for the entry',
          );
      }
      return enterSeat(session, sessions, key, input.idempotencyKey, {
        url: `${session.policy.origin}${entry.path}`,
        method: entry.method,
        seat,
        amount,
        pool: id,
      });
    }
  }
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

interface AdvertisedEntry {
  path: string;
  method: 'x402' | 'signed-command';
}

/** Gasless entry, when the game service offers it for exactly this granted pool. */
async function advertisedEntry(
  origin: string,
  matchId: string,
  contract: Address,
  pool: Hex,
): Promise<AdvertisedEntry | undefined> {
  try {
    const response = await safeFetch(
      `${origin}/v1/economy/matches/${matchId}`,
      {
        redirect: 'error',
        signal: AbortSignal.timeout(15000),
      },
    );
    if (!response.ok) return undefined;
    const table = (await response.json()) as {
      pool?: string;
      entry?: { path?: string; method?: string; payTo?: string };
    };
    const entry = table.entry;
    if (
      !entry ||
      table.pool?.toLowerCase() !== pool.toLowerCase() ||
      entry.payTo?.toLowerCase() !== contract.toLowerCase() ||
      entry.path !== `/v1/economy/matches/${matchId}/entry` ||
      (entry.method !== 'x402' && entry.method !== 'signed-command')
    )
      return undefined;
    return { path: entry.path, method: entry.method };
  } catch {
    // An unreachable service leaves the onchain deposit path available.
    return undefined;
  }
}

/**
 * Takes the granted seat without gas or an approval transaction. A paid seat answers
 * with an x402 challenge that the agent wallet pays within this grant; the game service
 * relays the signed USDC transfer into escrow. A sponsored seat takes a signed request.
 */
async function enterSeat(
  session: PaymentSession,
  sessions: PaymentSessionService,
  key: Hex,
  idempotencyKey: string,
  target: {
    url: string;
    method: AdvertisedEntry['method'];
    seat: Hex;
    amount: bigint;
    pool: Hex;
  },
) {
  const grant = session.policy.arcade!;
  const account = privateKeyToAccount(key);
  const seatNumber = [1, 2].find(
    (n) =>
      keccak256(toBytes(`sea_player_${n}`)).toLowerCase() ===
      target.seat.toLowerCase(),
  );
  if (!seatNumber)
    throw new ForbiddenException('The granted seat is not part of this game');
  const body = { seat: seatNumber, controller: account.address };
  const read = async (response: Response) => {
    const result = (await response.json().catch(() => ({}))) as {
      error?: string;
      transaction?: Hex;
    };
    if (!response.ok)
      throw new BadRequestException(result.error ?? 'Could not take the seat');
    return result;
  };
  if (target.amount === 0n) {
    if (target.method !== 'signed-command')
      throw new BadRequestException('This seat requires payment');
    const attempt = await sessions.reserveSeatJoin(session, idempotencyKey);
    try {
      const expiresAt = Date.now() + 60000;
      const signature = await account.signMessage({
        message: JSON.stringify({
          domain: session.policy.origin,
          matchId: grant.matchId,
          operation: 'entry',
          body,
          expiresAt,
        }),
      });
      const result = await read(
        await safeFetch(target.url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...body,
            auth: { address: account.address, expiresAt, signature },
          }),
          redirect: 'error',
          signal: AbortSignal.timeout(90000),
        }),
      );
      await sessions.finish(attempt, 'settled', {
        transaction: result.transaction,
        network: session.policy.network,
        pool: target.pool,
        amount: '0',
        gasless: true,
      });
      return {
        transaction: result.transaction,
        amountUnits: '0',
        pool: target.pool,
      };
    } catch (error) {
      await sessions.finish(attempt, 'unknown', {
        reason: 'Inspect the seat before retrying',
      });
      throw error;
    }
  }
  if (target.method !== 'x402')
    throw new BadRequestException('This seat is not sold over x402');
  const init = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
  const challenge = await safeFetch(target.url, {
    ...init,
    redirect: 'error',
    signal: AbortSignal.timeout(30000),
  });
  if (challenge.status !== 402) {
    await read(challenge);
    throw new BadRequestException('Seat entry did not request payment');
  }
  const response = await payX402Challenge(target.url, init, challenge, {
    policy: session.policy,
    privateKey: key,
    address: account.address,
    reserve: async (units) => {
      if (BigInt(units) !== target.amount)
        throw new ForbiddenException(
          'Entry price does not match the pool stake',
        );
      return sessions.reserve(
        session,
        idempotencyKey,
        units,
        `${session.policy.origin}/${grant.matchId}/stake`,
      );
    },
    finish: (id, state, receipt) => sessions.finish(id, state, receipt),
  });
  const result = await read(response);
  return {
    transaction: result.transaction,
    amountUnits: target.amount.toString(),
    pool: target.pool,
  };
}

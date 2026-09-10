import { BadRequestException, ForbiddenException } from '@nestjs/common';
export interface SpendingPolicy {
  network:
    'eip155:84532' | 'eip155:5042002' | 'eip155:11142220' | 'hedera:testnet';
  arcade?: {
    poolId: string;
    seatId: string;
    matchId: string;
    allowedOperations: ('stake' | 'bounty' | 'bet')[];
  };
  asset: string;
  payTo: string;
  origin: string;
  maxPaymentUnits: string;
}
const ASSETS: Record<string, string> = {
  'eip155:84532': '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
  'eip155:5042002': '0x3600000000000000000000000000000000000000',
  'eip155:11142220': '0x01C5C0122039549AD1493B8220cABEdD739BC44E',
  'hedera:testnet': '0.0.429274',
};
export function positiveUnits(value: unknown): bigint {
  if (typeof value !== 'string' || !/^[1-9]\d{0,29}$/.test(value))
    throw new BadRequestException(
      'Amount must be positive atomic units (maximum 30 digits)',
    );
  return BigInt(value);
}
export function validateSpendingPolicy(input: SpendingPolicy): SpendingPolicy {
  if (
    !input ||
    typeof input !== 'object' ||
    !ASSETS[input.network] ||
    input.asset?.toLowerCase() !== ASSETS[input.network].toLowerCase()
  )
    throw new BadRequestException('Unsupported testnet USDC rail');
  positiveUnits(input.maxPaymentUnits);
  let url: URL;
  try {
    url = new URL(input.origin);
  } catch {
    throw new BadRequestException('Invalid service origin');
  }
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.origin !== input.origin
  )
    throw new BadRequestException('Use an exact HTTPS origin');
  if (
    !(
      input.network === 'hedera:testnet' && !input.arcade
        ? /^0\.0\.[1-9]\d*$/
        : /^0x[0-9a-fA-F]{40}$/
    ).test(input.payTo)
  )
    throw new BadRequestException('Invalid recipient');
  if (
    input.arcade &&
    (!/^0x[0-9a-fA-F]{64}$/.test(input.arcade.poolId) ||
      !/^0x[0-9a-fA-F]{64}$/.test(input.arcade.seatId) ||
      !/^mat_[A-Za-z0-9_-]{8,128}$/.test(input.arcade.matchId) ||
      !Array.isArray(input.arcade.allowedOperations) ||
      !input.arcade.allowedOperations.length ||
      input.arcade.allowedOperations.some(
        (o) => !['stake', 'bounty', 'bet'].includes(o),
      ))
  )
    throw new BadRequestException('Invalid Arcade pool grant');
  return {
    ...(input.arcade ? { arcade: input.arcade } : {}),
    network: input.network,
    asset: input.asset,
    payTo: input.payTo,
    origin: url.origin,
    maxPaymentUnits: input.maxPaymentUnits,
  };
}
export function assertRequirement(
  policy: SpendingPolicy,
  requirement: {
    scheme: string;
    network: string;
    asset: string;
    payTo: string;
    amount: string;
    maxTimeoutSeconds: number;
  },
  url: string,
) {
  const target = new URL(url);
  if (target.origin !== policy.origin || target.username || target.password)
    throw new ForbiddenException('Service outside payment grant');
  if (
    requirement.scheme !== 'exact' ||
    requirement.network !== policy.network ||
    requirement.asset.toLowerCase() !== policy.asset.toLowerCase() ||
    requirement.payTo.toLowerCase() !== policy.payTo.toLowerCase()
  )
    throw new ForbiddenException(
      'Payment does not match owner-approved network, token, or recipient',
    );
  if (positiveUnits(requirement.amount) > positiveUnits(policy.maxPaymentUnits))
    throw new ForbiddenException('Per-payment budget exceeded');
  if (
    !Number.isInteger(requirement.maxTimeoutSeconds) ||
    requirement.maxTimeoutSeconds < 1 ||
    requirement.maxTimeoutSeconds > 120
  )
    throw new ForbiddenException(
      'Payment authorization lifetime exceeds policy',
    );
}

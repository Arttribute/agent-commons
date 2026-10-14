import { BadRequestException, ForbiddenException } from '@nestjs/common';

export type ResourceAccessMode = 'ask' | 'auto' | 'off';
export type ResourceUpgradePolicy = {
  cpuAccess: ResourceAccessMode;
  gpuAccess: ResourceAccessMode;
  maxAutomaticCpuProfile: 'standard' | 'performance';
  maxMinutes: number;
};

export function resourceUpgradePolicy(value?: unknown): ResourceUpgradePolicy {
  const input = value as Partial<ResourceUpgradePolicy> | undefined;
  const mode = (value: unknown) => {
    if (value === undefined) return 'ask' as const;
    if (!['ask', 'auto', 'off'].includes(String(value)))
      throw new BadRequestException(
        'Resource access must be ask, auto, or off.',
      );
    return value as ResourceAccessMode;
  };
  const maxMinutes = input?.maxMinutes ?? 30;
  if (!Number.isInteger(maxMinutes) || maxMinutes < 5 || maxMinutes > 120)
    throw new BadRequestException(
      'Temporary resource access must last between 5 and 120 minutes.',
    );
  const maxAutomaticCpuProfile = input?.maxAutomaticCpuProfile ?? 'performance';
  if (!['standard', 'performance'].includes(maxAutomaticCpuProfile))
    throw new BadRequestException(
      'The automatic CPU limit must be standard or performance.',
    );
  return {
    cpuAccess: mode(input?.cpuAccess),
    gpuAccess: mode(input?.gpuAccess),
    maxAutomaticCpuProfile,
    maxMinutes,
  };
}

export function evaluateResourceUpgrade(
  policy: ResourceUpgradePolicy,
  profile: string,
  requestedMinutes?: number,
) {
  if (!['standard', 'performance', 'gpu'].includes(profile))
    throw new BadRequestException('Choose standard, performance, or gpu.');
  const access = profile === 'gpu' ? policy.gpuAccess : policy.cpuAccess;
  if (access === 'off')
    throw new ForbiddenException(
      `Agent ${profile === 'gpu' ? 'GPU' : 'CPU and RAM'} upgrades are disabled in computer settings.`,
    );
  const minutes = requestedMinutes ?? policy.maxMinutes;
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > policy.maxMinutes)
    throw new BadRequestException(
      `Request between 1 and ${policy.maxMinutes} minutes.`,
    );
  const withinCpuLimit =
    profile !== 'performance' ||
    policy.maxAutomaticCpuProfile === 'performance';
  return {
    profile: profile as 'standard' | 'performance' | 'gpu',
    minutes,
    automatic: access === 'auto' && (profile === 'gpu' || withinCpuLimit),
  };
}

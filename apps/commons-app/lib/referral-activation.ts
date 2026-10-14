import { cookies } from 'next/headers';
import { REFERRAL_CODE_PATTERN, REFERRAL_COOKIE } from './referrals';

export type PendingReferralActivation = {
  principalId: string;
  email: string;
  emailVerified: boolean;
  firstActivation: boolean;
  activatedAt: string;
  code?: string;
};

export async function captureReferralActivation(input: Omit<PendingReferralActivation, 'code'>) {
  const code = (await cookies()).get(REFERRAL_COOKIE)?.value;
  return { ...input, ...(code && REFERRAL_CODE_PATTERN.test(code) ? { code } : {}) };
}

export async function deliverReferralActivation(input: PendingReferralActivation) {
  const base = process.env.NEXT_PUBLIC_NEST_API_BASE_URL;
  if (!base) return false;
  // Import lazily: api-headers also imports auth, but this service-only helper
  // never resolves a session and cannot recursively enter the JWT callback.
  const { backendServiceAuthHeaders } = await import('./api-headers');
  const headers = await backendServiceAuthHeaders({ allowLegacyKey: false });
  if (!headers.Authorization) return false;
  const response = await fetch(`${base}/v1/referrals/activate`, {
    method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(input), signal: AbortSignal.timeout(3_000),
  }).catch(() => null);
  return response?.ok === true;
}

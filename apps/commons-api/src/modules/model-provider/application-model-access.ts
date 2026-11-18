/** A symbol cannot be supplied through an HTTP JSON body. */
export const APPLICATION_MODEL_ACCESS = Symbol('verified-application-model-access');
export const COMMON_BUSINESS_PREMIUM_MODELS = ['gpt-5.6-sol', 'gpt-6.2-sol', 'gpt-6.2-astra'] as const;
export type ApplicationModelAccess = { application: 'common-business'; access: 'intro' | 'subscription'; tenantId: string; userId: string };

/** Trusted application servers enforce their own plan and introductory limits. */
export function verifyApplicationModelAccess(principal: unknown, claim: unknown, initiator: string): ApplicationModelAccess | undefined {
  if (!principal || typeof principal !== 'object' || !claim || typeof claim !== 'object') return;
  const caller = principal as { principalType?: string; scopes?: string[] };
  const value = claim as Partial<ApplicationModelAccess>;
  if (caller.principalType !== 'service' || !caller.scopes?.some(scope => ['platform:admin', 'common-business:models'].includes(scope))) return;
  if (value.application !== 'common-business' || !['intro', 'subscription'].includes(value.access || '') || !/^[a-f\d]{24}$/i.test(value.tenantId || '') || !initiator || value.userId !== initiator) return;
  return { application: 'common-business', access: value.access!, tenantId: value.tenantId!, userId: initiator };
}

export function applicationAllowsModel(access: ApplicationModelAccess | undefined, provider: string, modelId: string) {
  return Boolean(access?.application === 'common-business' && provider === 'openai' && (COMMON_BUSINESS_PREMIUM_MODELS as readonly string[]).includes(modelId));
}

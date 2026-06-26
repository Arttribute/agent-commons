export type CreditDirection =
  | 'grant'
  | 'debit'
  | 'adjustment'
  | 'refund'
  | 'expiration';

export type CreditPrincipalType = 'user' | 'agent' | 'service';

export type CreditPlatform =
  | 'agent_commons'
  | 'commonlab'
  | 'common_os'
  | 'system';

export type CreditLedgerInput = {
  principalId: string;
  principalType?: CreditPrincipalType;
  workspaceId?: string | null;
  amount: number;
  direction: CreditDirection;
  eventType: string;
  sourcePlatform: CreditPlatform;
  idempotencyKey: string;
  description?: string;
  relatedCourseId?: string;
  relatedChallengeId?: string;
  agentId?: string;
  sessionId?: string;
  taskId?: string;
  workflowId?: string;
  usageEventId?: string;
  metadata?: Record<string, unknown>;
  createdBy?: string;
  createdByType?: CreditPrincipalType;
  expiresAt?: Date;
};

export type CreditBalance = {
  principalId: string;
  workspaceId?: string | null;
  balance: number;
  currency: 'credits';
};

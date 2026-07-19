-- 011_launch_credit_campaign.sql
-- A finite onboarding bridge for users present when hard credit enforcement
-- launches. It is programmable campaign state, not a special-case grant.

UPDATE credit_campaign
SET metadata = metadata || '{"selfClaim":true}'::jsonb,
    updated_at = timezone('utc', now())
WHERE campaign_key = 'daily-check-in';

INSERT INTO credit_campaign (
  campaign_key, name, description, reward_credits, trigger_type,
  source_platform, max_claims_per_principal, total_budget_credits,
  visible, eligibility, metadata
) VALUES (
  'launch-builder-bonus',
  'Builder launch bonus',
  'A one-time credit boost to try the newly metered Agent Commons experience.',
  500,
  'once',
  'agent_commons',
  1,
  100000,
  true,
  '{"plans":["free","plus","pro","max"]}'::jsonb,
  '{"selfClaim":true,"icon":"rocket","expiresInDays":45}'::jsonb
)
ON CONFLICT (campaign_key) DO NOTHING;

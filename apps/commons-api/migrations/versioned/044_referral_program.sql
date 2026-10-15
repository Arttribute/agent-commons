CREATE TABLE referral_profile (
  principal_id text PRIMARY KEY,
  code text NOT NULL UNIQUE,
  email_hash text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Both constraints are permanent. Deleting/recreating an account or retrying
-- activation must never award a second reward for the same verified identity.
CREATE TABLE referral_signup (
  referred_principal_id text PRIMARY KEY,
  email_hash text NOT NULL UNIQUE,
  referrer_principal_id text NOT NULL REFERENCES referral_profile(principal_id),
  reward_credits integer NOT NULL DEFAULT 1000 CHECK (reward_credits = 1000),
  ledger_entry_id uuid NOT NULL REFERENCES credit_ledger_entry(entry_id),
  joined_at timestamptz NOT NULL DEFAULT now(),
  CHECK (referrer_principal_id <> referred_principal_id)
);
CREATE INDEX referral_signup_referrer_idx ON referral_signup(referrer_principal_id, joined_at);

CREATE TABLE referral_invitation (
  invitation_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  principal_id text NOT NULL REFERENCES referral_profile(principal_id),
  email text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  UNIQUE (principal_id, email)
);
CREATE INDEX referral_invitation_sender_idx ON referral_invitation(principal_id, created_at);

ALTER TABLE referral_profile ENABLE ROW LEVEL SECURITY;
ALTER TABLE referral_signup ENABLE ROW LEVEL SECURITY;
ALTER TABLE referral_invitation ENABLE ROW LEVEL SECURITY;

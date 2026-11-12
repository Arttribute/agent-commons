CREATE TABLE IF NOT EXISTS event_payment_account (
  account_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES project(project_id),
  owner_user_id text NOT NULL,
  provider text NOT NULL DEFAULT 'paystack' CHECK (provider = 'paystack'),
  mode text NOT NULL CHECK (mode IN ('live', 'test')),
  credentials jsonb NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS event_payment_account_active_idx ON event_payment_account(project_id) WHERE active;

CREATE TABLE IF NOT EXISTS project_event (
  event_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES project(project_id),
  owner_user_id text NOT NULL,
  slug text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'open', 'closed')),
  config jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS project_event_project_idx ON project_event(project_id, created_at DESC);

CREATE TABLE IF NOT EXISTS event_registration (
  registration_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES project_event(event_id),
  account_id uuid REFERENCES event_payment_account(account_id),
  reference text NOT NULL UNIQUE,
  idempotency_key text NOT NULL,
  request_hash text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'review', 'failed')),
  payment_status text NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid', 'paid', 'free')),
  quantity integer NOT NULL CHECK (quantity BETWEEN 1 AND 10),
  amount_minor bigint NOT NULL CHECK (amount_minor >= 0),
  currency text NOT NULL,
  contact jsonb NOT NULL,
  participants jsonb NOT NULL,
  agreement_snapshot jsonb NOT NULL,
  checkout_url text,
  expires_at timestamptz NOT NULL,
  paid_at timestamptz,
  payment_details jsonb,
  provider_transaction_id text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(event_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS event_registration_inventory_idx ON event_registration(event_id, status, expires_at);
CREATE INDEX IF NOT EXISTS event_registration_list_idx ON event_registration(event_id, created_at DESC, registration_id);

ALTER TABLE event_payment_account ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_event ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_registration ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public_page_chat_usage (
  bucket text NOT NULL,
  usage_day date NOT NULL DEFAULT CURRENT_DATE,
  requests integer NOT NULL DEFAULT 0 CHECK (requests >= 0),
  PRIMARY KEY(bucket, usage_day)
);
ALTER TABLE public_page_chat_usage ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS event_discount (
  discount_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES project_event(event_id),
  code text NOT NULL,
  label text NOT NULL DEFAULT '',
  active boolean NOT NULL DEFAULT true,
  amount_type text NOT NULL CHECK (amount_type IN ('percent', 'fixed')),
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  max_redemptions integer CHECK (max_redemptions > 0),
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(event_id, code)
);
ALTER TABLE event_discount ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_registration ADD COLUMN IF NOT EXISTS discount_id uuid REFERENCES event_discount(discount_id);
ALTER TABLE event_registration ADD COLUMN IF NOT EXISTS discount_code text;
ALTER TABLE event_registration ADD COLUMN IF NOT EXISTS original_amount_minor bigint;
ALTER TABLE event_registration ADD COLUMN IF NOT EXISTS discount_amount_minor bigint NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS event_discount_usage_idx ON event_registration(discount_id, status, expires_at);

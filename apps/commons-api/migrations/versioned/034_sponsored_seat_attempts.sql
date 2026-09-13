-- Sponsored Arcade seats require a signed, grant-bound transaction with no USDC transfer.
-- Ordinary payment reservations still require positive amounts in application validation.
ALTER TABLE wallet_payment_attempt DROP CONSTRAINT IF EXISTS wallet_payment_attempt_amount_units_check;
ALTER TABLE wallet_payment_attempt ADD CONSTRAINT wallet_payment_attempt_amount_units_check CHECK (amount_units >= 0);

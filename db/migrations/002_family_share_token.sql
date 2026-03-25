-- Family-facing share links: TTL, revocation, optional one-time consumption.
ALTER TABLE pickup_assignments
  ADD COLUMN IF NOT EXISTS share_token_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS share_token_revoked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS share_token_consumed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS share_token_one_time BOOLEAN NOT NULL DEFAULT false;

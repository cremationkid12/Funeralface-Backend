CREATE TABLE IF NOT EXISTS staff_invites (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  invited_email TEXT NOT NULL,
  invited_role TEXT NOT NULL DEFAULT 'user',
  token_hash TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending',
  expires_at TIMESTAMPTZ NOT NULL,
  invited_by_user_id TEXT NOT NULL,
  accepted_by_user_id TEXT,
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT staff_invites_status_check CHECK (status IN ('pending', 'accepted', 'revoked', 'expired'))
);

CREATE INDEX IF NOT EXISTS staff_invites_org_id_status_idx
  ON staff_invites(org_id, status);

CREATE INDEX IF NOT EXISTS staff_invites_invited_email_status_idx
  ON staff_invites(invited_email, status);

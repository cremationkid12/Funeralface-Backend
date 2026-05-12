-- ============================================================================
-- Everroute schema (consolidated from the original 001..008 migrations).
--
-- Idempotent: every CREATE TABLE / INDEX statement uses IF NOT EXISTS guards
-- so this script is safe to re-run.
--
-- Behaviour by environment:
--   * Fresh DB        → produces the full final schema from scratch.
--   * Deployed DB     → no-op (every object already exists).
--   * Old dev DB that
--     still has the
--     pre-rename
--     `settings` table → drop and re-create the local DB before running.
--     This script does not carry transitional rename logic.
-- ============================================================================

-- ─── funeral_homes (per-org configuration) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS funeral_homes (
  id TEXT PRIMARY KEY,
  funeral_home_name TEXT NOT NULL,
  funeral_home_phone TEXT NOT NULL,
  funeral_home_address TEXT NOT NULL,
  logo_url TEXT,
  default_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── staff_members ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS staff_members (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  bio TEXT,
  role TEXT NOT NULL DEFAULT 'user',
  active BOOLEAN NOT NULL DEFAULT true,
  profile_image_url TEXT,
  provider TEXT NOT NULL DEFAULT 'email',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS staff_members_org_id_created_at_idx
  ON staff_members(org_id, created_at DESC);

-- ─── staff_audit_logs ────────────────────────────────────────────────────────
-- staff_member_id is nullable + ON DELETE SET NULL so audit history survives
-- staff deletion (see original migration 003).
CREATE TABLE IF NOT EXISTS staff_audit_logs (
  id TEXT PRIMARY KEY,
  staff_member_id TEXT REFERENCES staff_members(id) ON DELETE SET NULL,
  org_id TEXT NOT NULL,
  action TEXT NOT NULL,
  from_role TEXT,
  to_role TEXT,
  from_active BOOLEAN,
  to_active BOOLEAN,
  changed_by_user_id TEXT,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  note TEXT
);

CREATE INDEX IF NOT EXISTS staff_audit_logs_staff_member_id_changed_at_idx
  ON staff_audit_logs(staff_member_id, changed_at DESC);

-- ─── staff_invites ───────────────────────────────────────────────────────────
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
  CONSTRAINT staff_invites_status_check
    CHECK (status IN ('pending', 'accepted', 'revoked', 'expired'))
);

CREATE INDEX IF NOT EXISTS staff_invites_org_id_status_idx
  ON staff_invites(org_id, status);
CREATE INDEX IF NOT EXISTS staff_invites_invited_email_status_idx
  ON staff_invites(invited_email, status);

-- ─── pickup_assignments ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pickup_assignments (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  decedent_name TEXT NOT NULL,
  pickup_address TEXT NOT NULL,
  contact_name TEXT NOT NULL,
  contact_phone TEXT NOT NULL,
  notes TEXT,
  assigned_staff_id TEXT REFERENCES staff_members(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  share_token TEXT UNIQUE,
  share_token_expires_at TIMESTAMPTZ,
  share_token_revoked_at TIMESTAMPTZ,
  share_token_consumed_at TIMESTAMPTZ,
  share_token_one_time BOOLEAN NOT NULL DEFAULT false,
  eta_time TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT pickup_assignments_status_check
    CHECK (status IN ('pending', 'assigned', 'en_route', 'arrived', 'completed', 'cancelled'))
);

CREATE INDEX IF NOT EXISTS pickup_assignments_org_id_created_at_idx
  ON pickup_assignments(org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS pickup_assignments_org_id_status_idx
  ON pickup_assignments(org_id, status);

-- ─── assignment_audit_logs ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS assignment_audit_logs (
  id TEXT PRIMARY KEY,
  assignment_id TEXT NOT NULL REFERENCES pickup_assignments(id) ON DELETE CASCADE,
  org_id TEXT NOT NULL,
  from_status TEXT,
  to_status TEXT NOT NULL,
  changed_by_user_id TEXT,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  note TEXT
);

CREATE INDEX IF NOT EXISTS assignment_audit_logs_assignment_id_changed_at_idx
  ON assignment_audit_logs(assignment_id, changed_at DESC);

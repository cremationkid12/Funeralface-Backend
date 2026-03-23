CREATE TABLE IF NOT EXISTS settings (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  funeral_home_name TEXT NOT NULL,
  funeral_home_phone TEXT NOT NULL,
  funeral_home_address TEXT NOT NULL,
  logo_url TEXT,
  default_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS settings_org_id_key ON settings(org_id);

CREATE TABLE IF NOT EXISTS staff_members (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  role TEXT NOT NULL DEFAULT 'user',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS staff_members_org_id_created_at_idx
  ON staff_members(org_id, created_at DESC);

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

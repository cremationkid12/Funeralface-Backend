ALTER TABLE staff_members
ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS staff_audit_logs (
  id TEXT PRIMARY KEY,
  staff_member_id TEXT NOT NULL REFERENCES staff_members(id) ON DELETE CASCADE,
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


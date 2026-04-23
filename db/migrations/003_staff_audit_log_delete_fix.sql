-- Keep staff audit history even after a staff member is deleted.
-- We must allow NULL staff_member_id and avoid cascading audit-row deletion.
ALTER TABLE staff_audit_logs
  ALTER COLUMN staff_member_id DROP NOT NULL;

ALTER TABLE staff_audit_logs
  DROP CONSTRAINT IF EXISTS staff_audit_logs_staff_member_id_fkey;

ALTER TABLE staff_audit_logs
  ADD CONSTRAINT staff_audit_logs_staff_member_id_fkey
  FOREIGN KEY (staff_member_id)
  REFERENCES staff_members(id)
  ON DELETE SET NULL;

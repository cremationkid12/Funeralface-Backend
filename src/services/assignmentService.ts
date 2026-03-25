import { randomUUID } from "node:crypto";
import { Pool } from "pg";

export const ASSIGNMENT_STATUSES = [
  "pending",
  "assigned",
  "en_route",
  "arrived",
  "completed",
  "cancelled",
] as const;

export type AssignmentStatus = (typeof ASSIGNMENT_STATUSES)[number];

export type PickupAssignmentRecord = {
  id: string;
  org_id: string;
  decedent_name: string;
  pickup_address: string;
  contact_name: string;
  contact_phone: string;
  notes: string | null;
  assigned_staff_id: string | null;
  status: AssignmentStatus;
  created_at?: string;
};

export type AssignmentCreateInput = {
  decedent_name: string;
  pickup_address: string;
  contact_name: string;
  contact_phone: string;
  notes?: string | null;
  assigned_staff_id?: string | null;
  status?: AssignmentStatus;
};

export type AssignmentUpdateInput = Partial<AssignmentCreateInput> & {
  status?: AssignmentStatus;
};

export type AssignmentService = {
  listByOrgId: (orgId: string, sort?: string) => Promise<PickupAssignmentRecord[]>;
  createByOrgId: (orgId: string, input: AssignmentCreateInput) => Promise<PickupAssignmentRecord>;
  updateByOrgIdAndId: (
    orgId: string,
    id: string,
    input: AssignmentUpdateInput,
    actorUserId: string,
  ) => Promise<PickupAssignmentRecord | null>;
};

let pgPool: Pool | null = null;

function getPgPool(): Pool {
  if (pgPool) return pgPool;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required for default assignment service.");
  }
  pgPool = new Pool({ connectionString });
  return pgPool;
}

export function isAssignmentStatus(value: string): value is AssignmentStatus {
  return (ASSIGNMENT_STATUSES as readonly string[]).includes(value);
}

function canTransition(fromStatus: AssignmentStatus, toStatus: AssignmentStatus): boolean {
  if (fromStatus === toStatus) return true;
  if (fromStatus === "cancelled" || fromStatus === "completed") return false;

  const order: AssignmentStatus[] = ["pending", "assigned", "en_route", "arrived", "completed"];
  const fromIndex = order.indexOf(fromStatus);
  const toIndex = order.indexOf(toStatus);

  if (toStatus === "cancelled") return true;
  return toIndex === fromIndex + 1;
}

async function insertAuditLog(
  pool: Pool,
  assignmentId: string,
  orgId: string,
  fromStatus: AssignmentStatus,
  toStatus: AssignmentStatus,
  actorUserId: string,
): Promise<void> {
  await pool.query(
    `
    INSERT INTO assignment_audit_logs (
      id,
      assignment_id,
      org_id,
      from_status,
      to_status,
      changed_by_user_id
    )
    VALUES ($1, $2, $3, $4, $5, $6)
    `,
    [randomUUID(), assignmentId, orgId, fromStatus, toStatus, actorUserId],
  );
}

export const defaultAssignmentService: AssignmentService = {
  async listByOrgId(orgId, sort = "-created_at") {
    const pool = getPgPool();
    const direction = sort === "-created_at" ? "DESC" : "ASC";
    const result = await pool.query<PickupAssignmentRecord>(
      `
      SELECT
        id, org_id, decedent_name, pickup_address, contact_name, contact_phone,
        notes, assigned_staff_id, status, created_at
      FROM pickup_assignments
      WHERE org_id = $1
      ORDER BY created_at ${direction}
      `,
      [orgId],
    );
    return result.rows;
  },

  async createByOrgId(orgId, input) {
    const pool = getPgPool();
    const status: AssignmentStatus = input.status ?? "pending";
    const result = await pool.query<PickupAssignmentRecord>(
      `
      INSERT INTO pickup_assignments (
        id,
        org_id,
        decedent_name,
        pickup_address,
        contact_name,
        contact_phone,
        notes,
        assigned_staff_id,
        status
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      RETURNING
        id, org_id, decedent_name, pickup_address, contact_name, contact_phone,
        notes, assigned_staff_id, status, created_at
      `,
      [
        randomUUID(),
        orgId,
        input.decedent_name.trim(),
        input.pickup_address.trim(),
        input.contact_name.trim(),
        input.contact_phone.trim(),
        input.notes?.trim() || null,
        input.assigned_staff_id ?? null,
        status,
      ],
    );
    return result.rows[0];
  },

  async updateByOrgIdAndId(orgId, id, input, actorUserId) {
    const pool = getPgPool();
    const existingResult = await pool.query<PickupAssignmentRecord>(
      `
      SELECT
        id, org_id, decedent_name, pickup_address, contact_name, contact_phone,
        notes, assigned_staff_id, status, created_at
      FROM pickup_assignments
      WHERE org_id = $1 AND id = $2
      LIMIT 1
      `,
      [orgId, id],
    );
    const current = existingResult.rows[0];
    if (!current) return null;

    const nextStatus = input.status ?? current.status;
    if (!canTransition(current.status, nextStatus)) {
      const err = new Error(`Invalid status transition: ${current.status} -> ${nextStatus}`);
      Object.assign(err, { name: "InvalidStatusTransitionError" });
      throw err;
    }

    const result = await pool.query<PickupAssignmentRecord>(
      `
      UPDATE pickup_assignments
      SET
        decedent_name = $3,
        pickup_address = $4,
        contact_name = $5,
        contact_phone = $6,
        notes = $7,
        assigned_staff_id = $8,
        status = $9,
        updated_at = NOW()
      WHERE org_id = $1 AND id = $2
      RETURNING
        id, org_id, decedent_name, pickup_address, contact_name, contact_phone,
        notes, assigned_staff_id, status, created_at
      `,
      [
        orgId,
        id,
        input.decedent_name?.trim() || current.decedent_name,
        input.pickup_address?.trim() || current.pickup_address,
        input.contact_name?.trim() || current.contact_name,
        input.contact_phone?.trim() || current.contact_phone,
        input.notes !== undefined ? (input.notes?.trim() || null) : current.notes,
        input.assigned_staff_id !== undefined ? input.assigned_staff_id : current.assigned_staff_id,
        nextStatus,
      ],
    );

    if (current.status !== nextStatus) {
      await insertAuditLog(pool, id, orgId, current.status, nextStatus, actorUserId);
    }

    return result.rows[0];
  },
};


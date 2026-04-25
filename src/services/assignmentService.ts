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
  /** Set opaque family link token, or `null` to revoke the public link. */
  share_token?: string | null;
  /** ISO-8601 expiry for the family link (only applied when issuing a new `share_token`). */
  share_token_expires_at?: string | null;
  /** When true, the first successful public resolution consumes the token. */
  share_token_one_time?: boolean;
};

type AssignmentRow = PickupAssignmentRecord & {
  share_token: string | null;
  share_token_expires_at: Date | null;
  share_token_revoked_at: Date | null;
  share_token_consumed_at: Date | null;
  share_token_one_time: boolean;
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
    const existingResult = await pool.query<AssignmentRow>(
      `
      SELECT
        id, org_id, decedent_name, pickup_address, contact_name, contact_phone,
        notes, assigned_staff_id, status, created_at,
        share_token,
        share_token_expires_at,
        share_token_revoked_at,
        share_token_consumed_at,
        share_token_one_time
      FROM pickup_assignments
      WHERE org_id = $1 AND id = $2
      LIMIT 1
      `,
      [orgId, id],
    );
    const current = existingResult.rows[0];
    if (!current) return null;

    const nextStatus = input.status ?? current.status;

    let nextShareToken = current.share_token;
    let nextShareExpires = current.share_token_expires_at;
    let nextShareRevoked = current.share_token_revoked_at;
    let nextShareConsumed = current.share_token_consumed_at;
    let nextShareOneTime = current.share_token_one_time;

    if (input.share_token !== undefined) {
      if (input.share_token === null) {
        nextShareToken = null;
        nextShareExpires = null;
        nextShareConsumed = null;
        nextShareOneTime = false;
        nextShareRevoked = new Date();
      } else {
        const trimmed = input.share_token.trim();
        nextShareToken = trimmed.length > 0 ? trimmed : null;
        nextShareRevoked = null;
        nextShareConsumed = null;
        if (input.share_token_expires_at !== undefined) {
          if (input.share_token_expires_at === null || input.share_token_expires_at === "") {
            nextShareExpires = null;
          } else {
            const parsed = new Date(input.share_token_expires_at);
            if (Number.isNaN(parsed.getTime())) {
              const err = new Error("Invalid share_token_expires_at");
              Object.assign(err, { name: "InvalidShareTokenFieldsError" });
              throw err;
            }
            nextShareExpires = parsed;
          }
        } else {
          nextShareExpires = null;
        }
        nextShareOneTime = input.share_token_one_time ?? false;
      }
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
        share_token = $10,
        share_token_expires_at = $11,
        share_token_revoked_at = $12,
        share_token_consumed_at = $13,
        share_token_one_time = $14,
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
        nextShareToken,
        nextShareExpires,
        nextShareRevoked,
        nextShareConsumed,
        nextShareOneTime,
      ],
    );

    if (current.status !== nextStatus) {
      await insertAuditLog(pool, id, orgId, current.status, nextStatus, actorUserId);
    }

    return result.rows[0];
  },
};


import { randomUUID } from "node:crypto";
import { Pool } from "pg";

export type StaffMemberRecord = {
  id: string;
  org_id: string;
  name: string;
  phone: string;
  email: string | null;
  role: string;
  active: boolean;
  created_at?: string;
};

export type StaffCreateInput = {
  name: string;
  phone: string;
  email?: string | null;
  role?: string;
  active?: boolean;
};

export type StaffUpdateInput = Partial<StaffCreateInput>;

export type ListStaffInput = {
  sort?: string;
  page?: number;
  pageSize?: number;
};

export type StaffService = {
  listByOrgId: (orgId: string, input: ListStaffInput) => Promise<StaffMemberRecord[]>;
  createByOrgId: (
    orgId: string,
    input: StaffCreateInput,
    actorUserId: string,
  ) => Promise<StaffMemberRecord>;
  updateByOrgIdAndId: (
    orgId: string,
    id: string,
    input: StaffUpdateInput,
    actorUserId: string,
  ) => Promise<StaffMemberRecord | null>;
  deleteByOrgIdAndId: (orgId: string, id: string, actorUserId: string) => Promise<boolean>;
};

let pgPool: Pool | null = null;

function getPgPool(): Pool {
  if (pgPool) return pgPool;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required for default staff service.");
  }

  pgPool = new Pool({ connectionString });
  return pgPool;
}

function normalizeRole(role?: string): string {
  return role && role.trim() ? role.trim() : "user";
}

export const defaultStaffService: StaffService = {
  async listByOrgId(orgId, input) {
    const pool = getPgPool();
    const sort = input.sort === "-created_at" ? "DESC" : "ASC";
    const page = Math.max(1, input.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, input.pageSize ?? 20));
    const offset = (page - 1) * pageSize;

    const result = await pool.query<StaffMemberRecord>(
      `
      SELECT id, org_id, name, phone, email, role, active, created_at
      FROM staff_members
      WHERE org_id = $1
      ORDER BY created_at ${sort}
      LIMIT $2 OFFSET $3
      `,
      [orgId, pageSize, offset],
    );

    return result.rows;
  },

  async createByOrgId(orgId, input, actorUserId) {
    const pool = getPgPool();
    const result = await pool.query<StaffMemberRecord>(
      `
      INSERT INTO staff_members (id, org_id, name, phone, email, role)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id, org_id, name, phone, email, role, active, created_at
      `,
      [
        randomUUID(),
        orgId,
        input.name.trim(),
        input.phone.trim(),
        input.email?.trim() || null,
        normalizeRole(input.role),
        input.active ?? true,
      ],
    );

    const created = result.rows[0];
    await pool.query(
      `
      INSERT INTO staff_audit_logs (
        id,
        staff_member_id,
        org_id,
        action,
        to_role,
        to_active,
        changed_by_user_id
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7)
      `,
      [
        randomUUID(),
        created.id,
        orgId,
        "created",
        created.role,
        created.active,
        actorUserId,
      ],
    );
    return created;
  },

  async updateByOrgIdAndId(orgId, id, input, actorUserId) {
    const pool = getPgPool();
    const existing = await pool.query<StaffMemberRecord>(
      `
      SELECT id, org_id, name, phone, email, role, active, created_at
      FROM staff_members
      WHERE org_id = $1 AND id = $2
      LIMIT 1
      `,
      [orgId, id],
    );

    const current = existing.rows[0];
    if (!current) return null;

    const nextRole = normalizeRole(input.role ?? current.role);
    const nextActive = input.active ?? current.active;
    const roleChanged = nextRole !== current.role;
    const activeChanged = nextActive !== current.active;

    const result = await pool.query<StaffMemberRecord>(
      `
      UPDATE staff_members
      SET
        name = $3,
        phone = $4,
        email = $5,
        role = $6,
        active = $7,
        updated_at = NOW()
      WHERE org_id = $1 AND id = $2
      RETURNING id, org_id, name, phone, email, role, active, created_at
      `,
      [
        orgId,
        id,
        input.name?.trim() || current.name,
        input.phone?.trim() || current.phone,
        input.email !== undefined ? (input.email?.trim() || null) : current.email,
        nextRole,
        nextActive,
      ],
    );

    if (roleChanged) {
      await pool.query(
        `
        INSERT INTO staff_audit_logs (
          id,
          staff_member_id,
          org_id,
          action,
          from_role,
          to_role,
          changed_by_user_id
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7)
        `,
        [randomUUID(), id, orgId, "role_updated", current.role, nextRole, actorUserId],
      );
    }

    if (activeChanged) {
      await pool.query(
        `
        INSERT INTO staff_audit_logs (
          id,
          staff_member_id,
          org_id,
          action,
          from_active,
          to_active,
          changed_by_user_id
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7)
        `,
        [
          randomUUID(),
          id,
          orgId,
          nextActive ? "activated" : "deactivated",
          current.active,
          nextActive,
          actorUserId,
        ],
      );
    }

    return result.rows[0];
  },

  async deleteByOrgIdAndId(orgId, id, actorUserId) {
    const pool = getPgPool();
    const existing = await pool.query<Pick<StaffMemberRecord, "id" | "role" | "active">>(
      `
      SELECT id, role, active
      FROM staff_members
      WHERE org_id = $1 AND id = $2
      LIMIT 1
      `,
      [orgId, id],
    );

    const current = existing.rows[0];

    const result = await pool.query(
      `
      DELETE FROM staff_members
      WHERE org_id = $1 AND id = $2
      `,
      [orgId, id],
    );

    const deleted = (result.rowCount ?? 0) > 0;
    if (deleted && current) {
      await pool.query(
        `
        INSERT INTO staff_audit_logs (
          id,
          staff_member_id,
          org_id,
          action,
          from_role,
          from_active,
          changed_by_user_id
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7)
        `,
        [
          randomUUID(),
          id,
          orgId,
          "deleted",
          current.role,
          current.active,
          actorUserId,
        ],
      );
    }

    return deleted;
  },
};


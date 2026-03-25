import { randomUUID } from "node:crypto";
import { Pool } from "pg";

export type StaffMemberRecord = {
  id: string;
  org_id: string;
  name: string;
  phone: string;
  email: string | null;
  role: string;
  created_at?: string;
};

export type StaffCreateInput = {
  name: string;
  phone: string;
  email?: string | null;
  role?: string;
};

export type StaffUpdateInput = Partial<StaffCreateInput>;

export type ListStaffInput = {
  sort?: string;
  page?: number;
  pageSize?: number;
};

export type StaffService = {
  listByOrgId: (orgId: string, input: ListStaffInput) => Promise<StaffMemberRecord[]>;
  createByOrgId: (orgId: string, input: StaffCreateInput) => Promise<StaffMemberRecord>;
  updateByOrgIdAndId: (orgId: string, id: string, input: StaffUpdateInput) => Promise<StaffMemberRecord | null>;
  deleteByOrgIdAndId: (orgId: string, id: string) => Promise<boolean>;
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
      SELECT id, org_id, name, phone, email, role, created_at
      FROM staff_members
      WHERE org_id = $1
      ORDER BY created_at ${sort}
      LIMIT $2 OFFSET $3
      `,
      [orgId, pageSize, offset],
    );

    return result.rows;
  },

  async createByOrgId(orgId, input) {
    const pool = getPgPool();
    const result = await pool.query<StaffMemberRecord>(
      `
      INSERT INTO staff_members (id, org_id, name, phone, email, role)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, org_id, name, phone, email, role, created_at
      `,
      [
        randomUUID(),
        orgId,
        input.name.trim(),
        input.phone.trim(),
        input.email?.trim() || null,
        normalizeRole(input.role),
      ],
    );

    return result.rows[0];
  },

  async updateByOrgIdAndId(orgId, id, input) {
    const pool = getPgPool();
    const existing = await pool.query<StaffMemberRecord>(
      `
      SELECT id, org_id, name, phone, email, role, created_at
      FROM staff_members
      WHERE org_id = $1 AND id = $2
      LIMIT 1
      `,
      [orgId, id],
    );

    const current = existing.rows[0];
    if (!current) return null;

    const result = await pool.query<StaffMemberRecord>(
      `
      UPDATE staff_members
      SET
        name = $3,
        phone = $4,
        email = $5,
        role = $6,
        updated_at = NOW()
      WHERE org_id = $1 AND id = $2
      RETURNING id, org_id, name, phone, email, role, created_at
      `,
      [
        orgId,
        id,
        input.name?.trim() || current.name,
        input.phone?.trim() || current.phone,
        input.email !== undefined ? (input.email?.trim() || null) : current.email,
        normalizeRole(input.role ?? current.role),
      ],
    );

    return result.rows[0];
  },

  async deleteByOrgIdAndId(orgId, id) {
    const pool = getPgPool();
    const result = await pool.query(
      `
      DELETE FROM staff_members
      WHERE org_id = $1 AND id = $2
      `,
      [orgId, id],
    );
    return (result.rowCount ?? 0) > 0;
  },
};


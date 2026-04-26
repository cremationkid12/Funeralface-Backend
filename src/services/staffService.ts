import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { defaultSettingsService } from "./settingsService";

export type StaffMemberRecord = {
  id: string;
  org_id: string;
  name: string;
  phone: string;
  email: string | null;
  role: string;
  active: boolean;
  profile_image_url: string | null;
  provider: string;
  created_at?: string;
};

export type StaffCreateInput = {
  name: string;
  phone: string;
  email?: string | null;
  role?: string;
  active?: boolean;
  profile_image_url?: string | null;
  provider?: string;
};

export type StaffUpdateInput = Partial<StaffCreateInput>;

export type ListStaffInput = {
  sort?: string;
  page?: number;
  pageSize?: number;
};

export type OrgRoleForUser = { org_id: string; role: string };

export type StaffService = {
  listByOrgId: (orgId: string, input: ListStaffInput) => Promise<StaffMemberRecord[]>;
  getByOrgIdAndId: (orgId: string, id: string) => Promise<StaffMemberRecord | null>;
  findOrgRoleByUserId: (userId: string) => Promise<OrgRoleForUser | null>;
  bootstrapOrgAndAdminForUser: (
    userId: string,
    email: string,
    displayName?: string | null,
    provider?: string,
    profileImageUrl?: string | null,
  ) => Promise<OrgRoleForUser>;
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

function normalizeProvider(provider?: string): string {
  const normalized = provider?.trim().toLowerCase();
  if (!normalized) return "email";
  if (normalized === "google" || normalized === "facebook" || normalized === "email") {
    return normalized;
  }
  return "email";
}

export const defaultStaffService: StaffService = {
  async getByOrgIdAndId(orgId, id) {
    const pool = getPgPool();
    const result = await pool.query<StaffMemberRecord>(
      `
      SELECT id, org_id, name, phone, email, role, active, profile_image_url, provider, created_at
      FROM staff_members
      WHERE org_id = $1 AND id = $2
      LIMIT 1
      `,
      [orgId, id],
    );
    return result.rows[0] ?? null;
  },

  async findOrgRoleByUserId(userId) {
    const pool = getPgPool();
    const result = await pool.query<OrgRoleForUser>(
      `
      SELECT org_id, role
      FROM staff_members
      WHERE id = $1 AND active = true
      LIMIT 1
      `,
      [userId],
    );
    return result.rows[0] ?? null;
  },

  async bootstrapOrgAndAdminForUser(userId, email, displayNameInput, providerInput, profileImageUrlInput) {
    const existing = await this.findOrgRoleByUserId(userId);
    const provider = normalizeProvider(providerInput);
    const profileImageUrl = profileImageUrlInput?.trim() || null;
    const pool = getPgPool();
    if (existing) {
      await pool.query(
        `
        UPDATE staff_members
        SET
          provider = $2,
          profile_image_url = COALESCE($3, profile_image_url),
          updated_at = NOW()
        WHERE id = $1
        `,
        [userId, provider, profileImageUrl],
      );
      return existing;
    }

    const orgId = randomUUID();
    const safeEmail = email.trim();
    const safeDisplayName = displayNameInput?.trim() ?? "";
    const displayName = safeDisplayName
      ? safeDisplayName
      : safeEmail.includes("@")
        ? safeEmail.split("@")[0]!.trim() || "Admin"
        : safeEmail || "Admin";

    await defaultSettingsService.upsertByOrgId(orgId, {
      funeral_home_name: displayName,
      funeral_home_phone: "—",
      funeral_home_address: "—",
    });

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `
        INSERT INTO staff_members (id, org_id, name, phone, email, role, active, provider, profile_image_url)
        VALUES ($1, $2, $3, $4, $5, 'admin', true, $6, $7)
        `,
        [userId, orgId, displayName, "0000000000", safeEmail || null, provider, profileImageUrl],
      );
      await client.query(
        `
        INSERT INTO staff_audit_logs (
          id, staff_member_id, org_id, action, to_role, to_active, changed_by_user_id
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        `,
        [randomUUID(), userId, orgId, "created", "admin", true, userId],
      );
      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }

    return { org_id: orgId, role: "admin" };
  },

  async listByOrgId(orgId, input) {
    const pool = getPgPool();
    const sort = input.sort === "-created_at" ? "DESC" : "ASC";
    const page = Math.max(1, input.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, input.pageSize ?? 20));
    const offset = (page - 1) * pageSize;

    const result = await pool.query<StaffMemberRecord>(
      `
      SELECT id, org_id, name, phone, email, role, active, profile_image_url, provider, created_at
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
      INSERT INTO staff_members (id, org_id, name, phone, email, role, active, provider, profile_image_url)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING id, org_id, name, phone, email, role, active, profile_image_url, provider, created_at
      `,
      [
        randomUUID(),
        orgId,
        input.name.trim(),
        input.phone.trim(),
        input.email?.trim() || null,
        normalizeRole(input.role),
        input.active ?? true,
        normalizeProvider(input.provider),
        input.profile_image_url?.trim() || null,
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
      SELECT id, org_id, name, phone, email, role, active, profile_image_url, provider, created_at
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
        profile_image_url = $8,
        updated_at = NOW()
      WHERE org_id = $1 AND id = $2
      RETURNING id, org_id, name, phone, email, role, active, profile_image_url, provider, created_at
      `,
      [
        orgId,
        id,
        input.name?.trim() || current.name,
        input.phone?.trim() || current.phone,
        input.email !== undefined ? (input.email?.trim() || null) : current.email,
        nextRole,
        nextActive,
        input.profile_image_url !== undefined
          ? (input.profile_image_url?.trim() || null)
          : current.profile_image_url,
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
          null,
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


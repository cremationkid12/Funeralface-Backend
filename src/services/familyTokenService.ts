import { Pool } from "pg";

export type FamilyAssignmentView = {
  assignment_id: string;
  decedent_name: string;
  status: string;
  pickup_address: string | null;
  eta_time: string | null;
  eta_note: string | null;
  support_contact_phone: string;
  funeral_home_name?: string | null;
  funeral_home_logo_url?: string | null;
  funeral_home_address?: string | null;
  assigned_staff_name?: string | null;
  assigned_staff_bio?: string | null;
  assigned_staff_phone?: string | null;
  assigned_staff_email?: string | null;
  assigned_staff_profile_image_url?: string | null;
};

export type FamilyTokenResolveResult =
  | { type: "ok"; view: FamilyAssignmentView }
  | { type: "not_found" }
  | { type: "expired" };

export type FamilyTokenService = {
  resolveByToken: (rawToken: string) => Promise<FamilyTokenResolveResult>;
};

let pgPool: Pool | null = null;

function getPgPool(): Pool {
  if (pgPool) return pgPool;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required for default family token service.");
  }
  pgPool = new Pool({ connectionString });
  return pgPool;
}

type AssignmentTokenRow = {
  id: string;
  org_id: string;
  decedent_name: string;
  status: string;
  pickup_address: string | null;
  eta_time: Date | null;
  share_token_expires_at: Date | null;
  share_token_revoked_at: Date | null;
  share_token_consumed_at: Date | null;
  share_token_one_time: boolean;
  assigned_staff_name: string | null;
  assigned_staff_bio: string | null;
  assigned_staff_phone: string | null;
  assigned_staff_email: string | null;
  assigned_staff_profile_image_url: string | null;
  funeral_home_name: string | null;
  funeral_home_logo_url: string | null;
  funeral_home_address: string | null;
  funeral_home_phone: string | null;
};

function formatEtaNote(eta: Date | null): string | null {
  if (!eta) return null;
  return eta.toISOString();
}

export const defaultFamilyTokenService: FamilyTokenService = {
  async resolveByToken(rawToken: string) {
    const pool = getPgPool();
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const result = await client.query<AssignmentTokenRow>(
        `
        SELECT
          pa.id,
          pa.org_id,
          pa.decedent_name,
          pa.status,
          pa.pickup_address,
          pa.eta_time,
          pa.share_token_expires_at,
          pa.share_token_revoked_at,
          pa.share_token_consumed_at,
          pa.share_token_one_time,
          sm.name AS assigned_staff_name,
          sm.bio AS assigned_staff_bio,
          sm.phone AS assigned_staff_phone,
          sm.email AS assigned_staff_email,
          sm.profile_image_url AS assigned_staff_profile_image_url,
          s.funeral_home_name,
          s.logo_url AS funeral_home_logo_url,
          s.funeral_home_address,
          s.funeral_home_phone
        FROM pickup_assignments pa
        LEFT JOIN staff_members sm ON sm.id = pa.assigned_staff_id
        LEFT JOIN funeral_homes s ON s.id = pa.org_id
        WHERE pa.share_token = $1
        FOR UPDATE OF pa
        LIMIT 1
        `,
        [rawToken],
      );

      const row = result.rows[0];
      if (!row) {
        await client.query("ROLLBACK");
        return { type: "not_found" };
      }

      if (row.share_token_revoked_at) {
        await client.query("ROLLBACK");
        return { type: "not_found" };
      }

      if (row.share_token_expires_at && row.share_token_expires_at.getTime() <= Date.now()) {
        await client.query("ROLLBACK");
        return { type: "expired" };
      }

      if (row.share_token_one_time) {
        if (row.share_token_consumed_at) {
          await client.query("ROLLBACK");
          return { type: "not_found" };
        }

        const consumed = await client.query(
          `
          UPDATE pickup_assignments
          SET
            share_token_consumed_at = NOW(),
            updated_at = NOW()
          WHERE id = $1
            AND share_token_one_time = true
            AND share_token_consumed_at IS NULL
          `,
          [row.id],
        );

        if (consumed.rowCount === 0) {
          await client.query("ROLLBACK");
          return { type: "not_found" };
        }
      }

      const view: FamilyAssignmentView = {
        assignment_id: row.id,
        decedent_name: row.decedent_name,
        status: row.status,
        pickup_address: row.pickup_address?.trim() ?? null,
        eta_time: row.eta_time ? row.eta_time.toISOString() : null,
        eta_note: formatEtaNote(row.eta_time),
        support_contact_phone: row.funeral_home_phone?.trim() ?? "",
        funeral_home_name: row.funeral_home_name?.trim() ?? null,
        funeral_home_logo_url: row.funeral_home_logo_url?.trim() ?? null,
        funeral_home_address: row.funeral_home_address?.trim() ?? null,
        assigned_staff_name: row.assigned_staff_name?.trim() ?? null,
        assigned_staff_bio: row.assigned_staff_bio?.trim() ?? null,
        assigned_staff_phone: row.assigned_staff_phone?.trim() ?? null,
        assigned_staff_email: row.assigned_staff_email?.trim() ?? null,
        assigned_staff_profile_image_url: row.assigned_staff_profile_image_url?.trim() ?? null,
      };

      await client.query("COMMIT");
      return { type: "ok", view };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  },
};

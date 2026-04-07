import { Pool } from "pg";

export type FamilyAssignmentView = {
  assignment_id: string;
  decedent_name: string;
  status: string;
  eta_note: string | null;
  support_contact_phone: string;
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
  eta_time: Date | null;
  share_token_expires_at: Date | null;
  share_token_revoked_at: Date | null;
  share_token_consumed_at: Date | null;
  share_token_one_time: boolean;
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
          pa.eta_time,
          pa.share_token_expires_at,
          pa.share_token_revoked_at,
          pa.share_token_consumed_at,
          pa.share_token_one_time,
          s.funeral_home_phone
        FROM pickup_assignments pa
        LEFT JOIN settings s ON s.org_id = pa.org_id
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
        eta_note: formatEtaNote(row.eta_time),
        support_contact_phone: row.funeral_home_phone?.trim() ?? "",
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

import { Pool } from "pg";

export type SettingsRecord = {
  org_id: string;
  director_name: string;
  director_phone: string;
  director_email: string | null;
  director_image_url: string | null;
  funeral_home_name: string;
  funeral_home_phone: string;
  funeral_home_address: string;
  logo_url: string | null;
  default_message: string | null;
};

export type SettingsUpdateInput = {
  director_name?: string;
  director_phone?: string;
  director_email?: string | null;
  director_image_url?: string | null;
  funeral_home_name?: string;
  funeral_home_phone?: string;
  funeral_home_address?: string;
  logo_url?: string | null;
  default_message?: string | null;
};

export type SettingsService = {
  getByOrgId: (orgId: string) => Promise<SettingsRecord>;
  upsertByOrgId: (orgId: string, input: SettingsUpdateInput) => Promise<SettingsRecord>;
};

const DEFAULT_SETTINGS = {
  director_name: "",
  director_phone: "",
  director_email: null,
  director_image_url: null,
  funeral_home_name: "",
  funeral_home_phone: "",
  funeral_home_address: "",
  logo_url: null,
  default_message: null,
} as const;

let pgPool: Pool | null = null;

function getPgPool(): Pool {
  if (pgPool) return pgPool;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required for default settings service.");
  }

  pgPool = new Pool({ connectionString });
  return pgPool;
}

export const defaultSettingsService: SettingsService = {
  async getByOrgId(orgId: string): Promise<SettingsRecord> {
    const pool = getPgPool();
    const result = await pool.query<SettingsRecord>(
      `
      SELECT
        id AS org_id,
        director_name,
        director_phone,
        director_email,
        director_image_url,
        funeral_home_name,
        funeral_home_phone,
        funeral_home_address,
        logo_url,
        default_message
      FROM funeral_homes
      WHERE id = $1
      LIMIT 1
      `,
      [orgId],
    );

    const row = result.rows[0];
    if (row) {
      return row;
    }

    return { org_id: orgId, ...DEFAULT_SETTINGS };
  },

  async upsertByOrgId(orgId: string, input: SettingsUpdateInput): Promise<SettingsRecord> {
    const pool = getPgPool();
    const current = await this.getByOrgId(orgId);
    const next = {
      ...current,
      ...input,
      org_id: orgId,
    };

    const result = await pool.query<SettingsRecord>(
      `
      INSERT INTO funeral_homes (
        id,
        director_name,
        director_phone,
        director_email,
        director_image_url,
        funeral_home_name,
        funeral_home_phone,
        funeral_home_address,
        logo_url,
        default_message
      )
      VALUES (
        $1,
        $2,
        $3,
        $4,
        $5,
        $6,
        $7,
        $8,
        $9,
        $10
      )
      ON CONFLICT (id)
      DO UPDATE SET
        director_name = EXCLUDED.director_name,
        director_phone = EXCLUDED.director_phone,
        director_email = EXCLUDED.director_email,
        director_image_url = EXCLUDED.director_image_url,
        funeral_home_name = EXCLUDED.funeral_home_name,
        funeral_home_phone = EXCLUDED.funeral_home_phone,
        funeral_home_address = EXCLUDED.funeral_home_address,
        logo_url = EXCLUDED.logo_url,
        default_message = EXCLUDED.default_message,
        updated_at = NOW()
      RETURNING
        id AS org_id,
        director_name,
        director_phone,
        director_email,
        director_image_url,
        funeral_home_name,
        funeral_home_phone,
        funeral_home_address,
        logo_url,
        default_message
      `,
      [
        orgId,
        next.director_name,
        next.director_phone,
        next.director_email,
        next.director_image_url,
        next.funeral_home_name,
        next.funeral_home_phone,
        next.funeral_home_address,
        next.logo_url,
        next.default_message,
      ],
    );

    return result.rows[0];
  },
};

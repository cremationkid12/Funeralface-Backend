import { createHash, randomUUID } from "node:crypto";
import { Pool, type PoolClient } from "pg";
import type { InviteByEmailInput } from "./inviteStaff";

export type InvitePreview = {
  org_id: string;
  invited_email: string;
  invited_role: string;
  inviter_name: string | null;
  inviter_email: string | null;
  expires_at: string;
};

export type InviteAcceptResult = {
  org_id: string;
  role: string;
};

export type CreateInviteInput = InviteByEmailInput & {
  orgId: string;
  invitedByUserId: string;
};

export type StaffInviteService = {
  createAndSend(input: CreateInviteInput): Promise<void>;
  previewByToken(token: string): Promise<InvitePreview | null>;
  acceptByToken(input: {
    token: string;
    userId: string;
    userEmail: string;
    userName?: string | null;
  }): Promise<InviteAcceptResult | null>;
};

let pgPool: Pool | null = null;

function getPgPool(): Pool {
  if (pgPool) return pgPool;
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) {
    throw new Error("DATABASE_URL is required for invite workflow.");
  }
  pgPool = new Pool({ connectionString });
  return pgPool;
}

function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function fallbackDisplayName(email: string): string {
  const trimmed = email.trim();
  if (!trimmed.includes("@")) return "Team Member";
  const local = trimmed.split("@")[0]?.trim();
  return local && local.length > 0 ? local : "Team Member";
}

function defaultExpiryIso(): string {
  const days = Number(process.env.INVITE_TOKEN_TTL_DAYS ?? "7");
  const ttlDays = Number.isFinite(days) && days > 0 ? days : 7;
  const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000);
  return expiresAt.toISOString();
}

function validTokenOrThrow(token: string): string {
  const trimmed = token.trim();
  if (!trimmed || trimmed.length > 512) {
    throw new Error("Invalid invite token.");
  }
  return trimmed;
}

type InviteMailer = (input: InviteByEmailInput & { inviteToken: string }) => Promise<void>;

export function createDefaultStaffInviteService(sendInviteEmail: InviteMailer): StaffInviteService {
  return {
    async createAndSend(input) {
      const normalizedEmail = normalizeEmail(input.email);
      const inviteToken = randomUUID().replaceAll("-", "") + randomUUID().replaceAll("-", "");
      const inviteId = randomUUID();
      const tokenHash = hashToken(inviteToken);
      const expiresAt = defaultExpiryIso();

      const pool = getPgPool();
      await pool.query(
        `
        INSERT INTO staff_invites (
          id,
          org_id,
          invited_email,
          invited_role,
          token_hash,
          status,
          expires_at,
          invited_by_user_id
        )
        VALUES ($1, $2, $3, 'user', $4, 'pending', $5, $6)
        `,
        [inviteId, input.orgId, normalizedEmail, tokenHash, expiresAt, input.invitedByUserId],
      );

      await sendInviteEmail({
        email: normalizedEmail,
        senderName: input.senderName,
        senderEmail: input.senderEmail,
        inviteToken,
      });
    },

    async previewByToken(token) {
      const rawToken = validTokenOrThrow(token);
      const tokenHash = hashToken(rawToken);
      const pool = getPgPool();
      const result = await pool.query<InvitePreview>(
        `
        SELECT
          i.org_id,
          i.invited_email,
          i.invited_role,
          inviter.name AS inviter_name,
          inviter.email AS inviter_email,
          i.expires_at
        FROM staff_invites i
        LEFT JOIN staff_members inviter
          ON inviter.id = i.invited_by_user_id
        WHERE i.token_hash = $1
          AND i.status = 'pending'
          AND i.expires_at > NOW()
        LIMIT 1
        `,
        [tokenHash],
      );
      return result.rows[0] ?? null;
    },

    async acceptByToken(input) {
      const rawToken = validTokenOrThrow(input.token);
      const normalizedEmail = normalizeEmail(input.userEmail);
      if (!normalizedEmail) {
        return null;
      }
      const tokenHash = hashToken(rawToken);
      const pool = getPgPool();
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const inviteResult = await client.query<{
          id: string;
          org_id: string;
          invited_email: string;
          invited_role: string;
        }>(
          `
          SELECT id, org_id, invited_email, invited_role
          FROM staff_invites
          WHERE token_hash = $1
            AND status = 'pending'
            AND expires_at > NOW()
          FOR UPDATE
          `,
          [tokenHash],
        );
        const invite = inviteResult.rows[0];
        if (!invite) {
          await client.query("ROLLBACK");
          return null;
        }
        if (normalizeEmail(invite.invited_email) !== normalizedEmail) {
          await client.query("ROLLBACK");
          return null;
        }

        await upsertMembershipForAcceptedInvite(client, {
          userId: input.userId,
          orgId: invite.org_id,
          email: normalizedEmail,
          role: invite.invited_role || "user",
          displayName: input.userName ?? fallbackDisplayName(normalizedEmail),
        });

        await client.query(
          `
          UPDATE staff_invites
          SET
            status = 'accepted',
            accepted_by_user_id = $2,
            accepted_at = NOW(),
            updated_at = NOW()
          WHERE id = $1
          `,
          [invite.id, input.userId],
        );

        await client.query("COMMIT");
        return { org_id: invite.org_id, role: invite.invited_role || "user" };
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
  };
}

async function upsertMembershipForAcceptedInvite(
  client: PoolClient,
  input: {
    userId: string;
    orgId: string;
    email: string;
    role: string;
    displayName: string;
  },
): Promise<void> {
  const existing = await client.query<{ id: string }>(
    `SELECT id FROM staff_members WHERE id = $1 LIMIT 1`,
    [input.userId],
  );
  if (existing.rows[0]) {
    await client.query(
      `
      UPDATE staff_members
      SET
        org_id = $2,
        role = $3,
        active = true,
        email = $4,
        name = COALESCE(NULLIF(TRIM(name), ''), $5),
        updated_at = NOW()
      WHERE id = $1
      `,
      [input.userId, input.orgId, input.role, input.email, input.displayName],
    );
    return;
  }

  await client.query(
    `
    INSERT INTO staff_members (id, org_id, name, phone, email, role, active)
    VALUES ($1, $2, $3, '0000000000', $4, $5, true)
    `,
    [input.userId, input.orgId, input.displayName, input.email, input.role],
  );
}

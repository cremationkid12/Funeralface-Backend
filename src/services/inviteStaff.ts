import { createClient } from "@supabase/supabase-js";

export class InviteNotConfiguredError extends Error {
  override name = "InviteNotConfiguredError";

  constructor() {
    super("Supabase invite is not configured (missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY).");
  }
}

export async function defaultInviteUserByEmail(email: string): Promise<void> {
  const url = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!url || !key) {
    throw new InviteNotConfiguredError();
  }

  const supabase = createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const { error } = await supabase.auth.admin.inviteUserByEmail(email);

  if (error) {
    const err = new Error(error.message);
    Object.assign(err, { name: "SupabaseInviteError" });
    throw err;
  }
}

export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

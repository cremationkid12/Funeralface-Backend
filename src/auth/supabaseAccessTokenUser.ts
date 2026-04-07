import { createClient, type User } from "@supabase/supabase-js";

/** Validates a Supabase access token (ES256) and returns the user, or null. */
export async function getUserFromSupabaseAccessToken(accessToken: string): Promise<User | null> {
  const url = process.env.SUPABASE_URL?.trim();
  const anon = process.env.SUPABASE_ANON_KEY?.trim();
  if (!url || !anon) return null;

  const supabase = createClient(url, anon, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
  const { data, error } = await supabase.auth.getUser(accessToken);
  if (error || !data.user) return null;
  return data.user;
}

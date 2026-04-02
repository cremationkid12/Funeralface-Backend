import { createClient } from "@supabase/supabase-js";

export class AuthNotConfiguredError extends Error {
  constructor(message = "Supabase auth service is not configured.") {
    super(message);
    this.name = "AuthNotConfiguredError";
  }
}

export type RegisterResult = {
  user_id: string | null;
  access_token: string | null;
  refresh_token: string | null;
};

export type LoginResult = {
  user_id: string;
  access_token: string;
  refresh_token: string;
};

export type RefreshResult = {
  user_id: string;
  access_token: string;
  refresh_token: string;
};

export type AuthService = {
  register(email: string, password: string): Promise<RegisterResult>;
  login(email: string, password: string): Promise<LoginResult>;
  refresh(refreshToken: string): Promise<RefreshResult>;
  logout(accessToken: string): Promise<void>;
  recoverPassword(email: string): Promise<void>;
};

function getAuthClient() {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new AuthNotConfiguredError();
  }
  return createClient(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export const defaultAuthService: AuthService = {
  async register(email: string, password: string): Promise<RegisterResult> {
    const client = getAuthClient();
    const { data, error } = await client.auth.signUp({ email, password });
    if (error) throw error;
    return {
      user_id: data.user?.id ?? null,
      access_token: data.session?.access_token ?? null,
      refresh_token: data.session?.refresh_token ?? null,
    };
  },

  async login(email: string, password: string): Promise<LoginResult> {
    const client = getAuthClient();
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw error;
    if (!data.user?.id || !data.session?.access_token || !data.session?.refresh_token) {
      throw new Error("Login did not return a complete auth session.");
    }
    return {
      user_id: data.user.id,
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
    };
  },

  async refresh(refreshToken: string): Promise<RefreshResult> {
    const client = getAuthClient();
    const { data, error } = await client.auth.refreshSession({ refresh_token: refreshToken });
    if (error) throw error;
    if (!data.user?.id || !data.session?.access_token || !data.session?.refresh_token) {
      throw new Error("Refresh did not return a complete auth session.");
    }
    return {
      user_id: data.user.id,
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
    };
  },

  async logout(accessToken: string): Promise<void> {
    const client = getAuthClient();
    void accessToken;
    const { error } = await client.auth.signOut();
    if (error) throw error;
  },

  async recoverPassword(email: string): Promise<void> {
    const client = getAuthClient();
    const { error } = await client.auth.resetPasswordForEmail(email);
    if (error) throw error;
  },
};

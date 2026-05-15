import { createClient } from "@supabase/supabase-js";
import { mailerOtpDigits } from "../auth/otpConfig";

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

/// Returned by [AuthService.loginWithGoogle]. Carries the user-profile bits
/// Supabase relays from Google's ID token (full name, email, avatar) so the
/// controller can seed `staff_members` instead of falling back to "Admin"/null.
export type GoogleLoginResult = LoginResult & {
  email: string;
  name: string;
  avatar_url: string | null;
};

export type RefreshResult = {
  user_id: string;
  access_token: string;
  refresh_token: string;
};

export type AuthService = {
  register(
    email: string,
    password: string,
    displayName?: string,
  ): Promise<RegisterResult>;
  login(email: string, password: string): Promise<LoginResult>;
  loginWithGoogle(idToken: string): Promise<GoogleLoginResult>;
  refresh(refreshToken: string): Promise<RefreshResult>;
  logout(accessToken: string): Promise<void>;
  recoverPassword(email: string): Promise<void>;
  verifyPasswordResetOtp(email: string, otp: string): Promise<LoginResult>;
  completePasswordRecovery(
    accessToken: string,
    refreshToken: string,
    newPassword: string,
  ): Promise<LoginResult>;
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
  async register(
    email: string,
    password: string,
    displayName?: string,
  ): Promise<RegisterResult> {
    const client = getAuthClient();
    const trimmedName = displayName?.trim();
    // When the user provides a name we stash it under three common keys so
    // it surfaces consistently: the Supabase Dashboard "Display name" column
    // reads `display_name`, while our own metadata reader prefers
    // `full_name`/`name` (see `loginWithGoogle`).
    const userMetadata = trimmedName
      ? {
          display_name: trimmedName,
          full_name: trimmedName,
          name: trimmedName,
        }
      : undefined;
    const { data, error } = await client.auth.signUp({
      email,
      password,
      options: userMetadata ? { data: userMetadata } : undefined,
    });
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

  async loginWithGoogle(idToken: string): Promise<GoogleLoginResult> {
    const client = getAuthClient();
    const { data, error } = await client.auth.signInWithIdToken({
      provider: "google",
      token: idToken,
    });
    if (error) throw error;
    if (!data.user?.id || !data.session?.access_token || !data.session?.refresh_token) {
      throw new Error("Google login did not return a complete auth session.");
    }
    const meta = (data.user.user_metadata ?? {}) as Record<string, unknown>;
    const pickString = (...keys: string[]): string => {
      for (const key of keys) {
        const value = meta[key];
        if (typeof value === "string" && value.trim()) return value.trim();
      }
      return "";
    };
    const name = pickString("full_name", "name");
    const avatarUrl = pickString("avatar_url", "picture");
    return {
      user_id: data.user.id,
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      email: data.user.email?.trim() ?? "",
      name,
      avatar_url: avatarUrl || null,
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
    // Email OTP length matches `PASSWORD_RESET_MAILER_OTP_DIGITS` in otpConfig (Supabase hosted default: 8).
    const { error } = await client.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: false,
      },
    });
    if (error) throw error;
  },

  async verifyPasswordResetOtp(email: string, otp: string): Promise<LoginResult> {
    const client = getAuthClient();
    const token = otp.trim();
    const len = mailerOtpDigits();
    if (!new RegExp(`^\\d{${len}}$`).test(token)) {
      throw new Error(`OTP must be a ${len}-digit code.`);
    }
    const { data, error } = await client.auth.verifyOtp({
      email: email.trim(),
      token,
      type: "email",
    });
    if (error) throw error;
    const session = data.session;
    const user = data.user;
    if (!user?.id || !session?.access_token || !session?.refresh_token) {
      throw new Error("OTP verification did not return a complete auth session.");
    }
    return {
      user_id: user.id,
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    };
  },

  async completePasswordRecovery(
    accessToken: string,
    refreshToken: string,
    newPassword: string,
  ): Promise<LoginResult> {
    const client = getAuthClient();
    const { error: setSessionError } = await client.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    if (setSessionError) throw setSessionError;

    const { error } = await client.auth.updateUser({
      password: newPassword,
    });
    if (error) throw error;

    const { data: sessionWrap, error: getSessionError } = await client.auth.getSession();
    if (getSessionError) throw getSessionError;
    const session = sessionWrap.session;
    const userId = session?.user?.id;
    if (!userId || !session.access_token || !session.refresh_token) {
      throw new Error("Password reset did not return a complete auth session.");
    }

    return {
      user_id: userId,
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    };
  },
};

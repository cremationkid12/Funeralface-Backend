import type { Request, Response } from "express";
import type { AuthenticatedRequest } from "../auth/authMiddleware";
import { getUserFromSupabaseAccessToken } from "../auth/supabaseAccessTokenUser";
import { isValidEmail } from "../services/inviteStaff";
import { AuthNotConfiguredError, type AuthService } from "../services/authService";
import type { StaffService } from "../services/staffService";

export type AuthControllerDeps = {
  authService: AuthService;
  staffService: StaffService;
};

export function getAuthMe(req: AuthenticatedRequest, res: Response): void {
  res.status(200).json({
    user_id: req.auth?.userId,
    role: req.auth?.role,
    org_id: req.auth?.orgId,
  });
}

export async function postEnsureProvisioned(
  req: Request,
  res: Response,
  staffService: StaffService,
): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ code: "unauthorized", message: "Bearer token is required." });
    return;
  }
  const token = authHeader.slice("Bearer ".length).trim();
  if (!token) {
    res.status(401).json({ code: "unauthorized", message: "Bearer token is required." });
    return;
  }
  const user = await getUserFromSupabaseAccessToken(token);
  if (!user) {
    res.status(401).json({ code: "unauthorized", message: "Invalid authentication token." });
    return;
  }
  if (!process.env.DATABASE_URL?.trim()) {
    res.status(503).json({ code: "service_unavailable", message: "Database is not configured." });
    return;
  }
  try {
    const profileName =
      user.user_metadata?.full_name?.toString().trim() ||
      user.user_metadata?.name?.toString().trim() ||
      "";
    const row = await staffService.bootstrapOrgAndAdminForUser(
      user.id,
      user.email ?? "",
      profileName,
    );
    res.status(200).json({ org_id: row.org_id, role: row.role });
  } catch (error) {
    res.status(500).json({
      code: "provision_failed",
      message: error instanceof Error ? error.message : "Provisioning failed.",
    });
  }
}

export async function postRegister(
  req: Request,
  res: Response,
  deps: AuthControllerDeps,
): Promise<void> {
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  const email = typeof req.body?.email === "string" ? req.body.email.trim() : "";
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  const inviteToken = typeof req.body?.invite_token === "string" ? req.body.invite_token.trim() : "";
  if (!name || !email || !isValidEmail(email) || password.length < 8) {
    res.status(400).json({
      code: "bad_request",
      message: "Name, valid email, and password (min 8 chars) are required.",
    });
    return;
  }
  try {
    const data = await deps.authService.register(email, password);
    if (data.user_id && data.access_token && process.env.DATABASE_URL?.trim() && !inviteToken) {
      await deps.staffService.bootstrapOrgAndAdminForUser(data.user_id, email, name);
    }
    res.status(201).json(data);
  } catch (error) {
    if (error instanceof AuthNotConfiguredError) {
      res.status(503).json({ code: "service_unavailable", message: error.message });
      return;
    }
    const message = error instanceof Error ? error.message : "Register failed.";
    const isRateLimited = /rate limit/i.test(message);
    res.status(isRateLimited ? 429 : 400).json({
      code: isRateLimited ? "rate_limited" : "auth_failed",
      message,
    });
  }
}

export async function postLogin(
  req: Request,
  res: Response,
  deps: AuthControllerDeps,
): Promise<void> {
  const email = typeof req.body?.email === "string" ? req.body.email.trim() : "";
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  const inviteToken = typeof req.body?.invite_token === "string" ? req.body.invite_token.trim() : "";
  if (!email || !isValidEmail(email) || !password) {
    res.status(400).json({
      code: "bad_request",
      message: "Valid email and password are required.",
    });
    return;
  }
  try {
    const data = await deps.authService.login(email, password);
    if (process.env.DATABASE_URL?.trim() && !inviteToken) {
      await deps.staffService.bootstrapOrgAndAdminForUser(data.user_id, email);
    }
    res.status(200).json(data);
  } catch (error) {
    if (error instanceof AuthNotConfiguredError) {
      res.status(503).json({ code: "service_unavailable", message: error.message });
      return;
    }
    res.status(401).json({
      code: "unauthorized",
      message: error instanceof Error ? error.message : "Login failed.",
    });
  }
}

export async function postGoogleLogin(
  req: Request,
  res: Response,
  deps: AuthControllerDeps,
): Promise<void> {
  const idToken = typeof req.body?.id_token === "string" ? req.body.id_token.trim() : "";
  if (!idToken) {
    res.status(400).json({
      code: "bad_request",
      message: "id_token is required.",
    });
    return;
  }
  try {
    const data = await deps.authService.loginWithGoogle(idToken);
    if (process.env.DATABASE_URL?.trim()) {
      await deps.staffService.bootstrapOrgAndAdminForUser(data.user_id, "");
    }
    res.status(200).json(data);
  } catch (error) {
    if (error instanceof AuthNotConfiguredError) {
      res.status(503).json({ code: "service_unavailable", message: error.message });
      return;
    }
    res.status(401).json({
      code: "unauthorized",
      message: error instanceof Error ? error.message : "Google login failed.",
    });
  }
}

export async function postRefresh(req: Request, res: Response, authService: AuthService): Promise<void> {
  const refreshToken =
    typeof req.body?.refresh_token === "string" ? req.body.refresh_token.trim() : "";
  if (!refreshToken) {
    res.status(400).json({
      code: "bad_request",
      message: "refresh_token is required.",
    });
    return;
  }
  try {
    const data = await authService.refresh(refreshToken);
    res.status(200).json(data);
  } catch (error) {
    if (error instanceof AuthNotConfiguredError) {
      res.status(503).json({ code: "service_unavailable", message: error.message });
      return;
    }
    res.status(401).json({
      code: "unauthorized",
      message: error instanceof Error ? error.message : "Refresh failed.",
    });
  }
}

export async function postLogout(req: Request, res: Response, authService: AuthService): Promise<void> {
  const accessToken = typeof req.body?.access_token === "string" ? req.body.access_token.trim() : "";
  if (!accessToken) {
    res.status(400).json({
      code: "bad_request",
      message: "access_token is required.",
    });
    return;
  }
  try {
    await authService.logout(accessToken);
    res.status(204).send();
  } catch (error) {
    if (error instanceof AuthNotConfiguredError) {
      res.status(503).json({ code: "service_unavailable", message: error.message });
      return;
    }
    res.status(400).json({
      code: "auth_failed",
      message: error instanceof Error ? error.message : "Logout failed.",
    });
  }
}

export async function postPasswordRecover(
  req: Request,
  res: Response,
  authService: AuthService,
): Promise<void> {
  const email = typeof req.body?.email === "string" ? req.body.email.trim() : "";
  if (!email || !isValidEmail(email)) {
    res.status(400).json({
      code: "bad_request",
      message: "A valid email address is required.",
    });
    return;
  }
  try {
    await authService.recoverPassword(email);
    res.status(202).json({
      status: "recovery_requested",
      email,
    });
  } catch (error) {
    if (error instanceof AuthNotConfiguredError) {
      res.status(503).json({ code: "service_unavailable", message: error.message });
      return;
    }
    res.status(400).json({
      code: "auth_failed",
      message: error instanceof Error ? error.message : "Password recovery failed.",
    });
  }
}

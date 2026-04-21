import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { defaultStaffService } from "../services/staffService";
import { getUserFromSupabaseAccessToken } from "./supabaseAccessTokenUser";

export type AuthenticatedRequest = Request & {
  auth?: {
    userId: string;
    role: string;
    orgId: string;
    email?: string;
    name?: string;
  };
};

type JwtPayload = {
  sub?: string;
  role?: string;
  org_id?: string;
  email?: string;
  name?: string;
  full_name?: string;
};

export async function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({
      code: "unauthorized",
      message: "Authentication is required.",
    });
    return;
  }

  const token = authHeader.slice("Bearer ".length).trim();
  if (!token) {
    res.status(401).json({
      code: "unauthorized",
      message: "Authentication is required.",
    });
    return;
  }

  try {
    const header = jwt.decode(token, { complete: true })?.header;
    const alg = header?.alg;

    const secret = process.env.JWT_SECRET?.trim();
    if (alg === "HS256" && secret) {
      const decoded = jwt.verify(token, secret) as JwtPayload;
      const userId = decoded.sub;
      const role = decoded.role ?? "user";
      const orgId = decoded.org_id;

      if (!userId || !orgId) {
        res.status(401).json({
          code: "unauthorized",
          message: "Invalid authentication token.",
        });
        return;
      }

      req.auth = {
        userId,
        role,
        orgId,
        email: decoded.email,
        name: decoded.full_name ?? decoded.name,
      };
      next();
      return;
    }

    const user = await getUserFromSupabaseAccessToken(token);
    if (user) {
      const row = await defaultStaffService.findOrgRoleByUserId(user.id);
      if (!row) {
        res.status(401).json({
          code: "unauthorized",
          message:
            "Account is not provisioned for this app. Sign out, sign in again, or register to create your organization.",
        });
        return;
      }

      req.auth = {
        userId: user.id,
        role: row.role,
        orgId: row.org_id,
        email: user.email ?? undefined,
        name:
          user.user_metadata?.full_name?.toString().trim() ||
          user.user_metadata?.name?.toString().trim() ||
          undefined,
      };
      next();
      return;
    }

    if (process.env.SUPABASE_URL?.trim() && process.env.SUPABASE_ANON_KEY?.trim()) {
      res.status(401).json({
        code: "unauthorized",
        message: "Invalid authentication token.",
      });
      return;
    }

    if (!secret) {
      res.status(503).json({
        code: "auth_not_configured",
        message: "Authentication is not configured (JWT_SECRET missing).",
      });
      return;
    }

    res.status(401).json({
      code: "unauthorized",
      message: "Invalid authentication token.",
    });
  } catch {
    res.status(401).json({
      code: "unauthorized",
      message: "Invalid authentication token.",
    });
  }
}

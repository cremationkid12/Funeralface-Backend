import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";

export type AuthenticatedRequest = Request & {
  auth?: {
    userId: string;
    role: string;
    orgId: string;
  };
};

type JwtPayload = {
  sub?: string;
  role?: string;
  org_id?: string;
};

export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({
      code: "unauthorized",
      message: "Authentication is required.",
    });
    return;
  }

  const token = authHeader.slice("Bearer ".length);
  const secret = process.env.JWT_SECRET;
  if (!secret || !secret.trim()) {
    res.status(503).json({
      code: "auth_not_configured",
      message: "Authentication is not configured (JWT_SECRET missing).",
    });
    return;
  }

  try {
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
    };

    next();
  } catch {
    res.status(401).json({
      code: "unauthorized",
      message: "Invalid authentication token.",
    });
  }
}

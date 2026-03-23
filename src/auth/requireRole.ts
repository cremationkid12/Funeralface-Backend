import type { NextFunction, Response } from "express";
import type { AuthenticatedRequest } from "./authMiddleware";

export function requireRole(...allowedRoles: string[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.auth) {
      res.status(401).json({
        code: "unauthorized",
        message: "Authentication is required.",
      });
      return;
    }

    if (!allowedRoles.includes(req.auth.role)) {
      res.status(403).json({
        code: "forbidden",
        message: "Insufficient permissions for this action.",
      });
      return;
    }

    next();
  };
}
